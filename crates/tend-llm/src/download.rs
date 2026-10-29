//! Model download / presence checks.

use anyhow::{Context, bail};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

/// A file that makes up a model: local name, URL and exact size in bytes.
pub(crate) struct ModelFile {
    pub name: &'static str,
    pub url: &'static str,
    pub size: u64,
}

/// Tiny embedding model weights: TaylorAI/bge-micro-v2 (MIT), a 3-layer, 384-wide BERT
/// (17M params) stored as f16 safetensors. Pinned to a commit so the size never changes.
pub(crate) const MINI_WEIGHTS: ModelFile = ModelFile {
    name: "tend-mini-bge-micro-v2.safetensors",
    url: "https://huggingface.co/TaylorAI/bge-micro-v2/resolve/3edf6d7de0faa426b09780416fe61009f26ae589/model.safetensors",
    size: 34_785_664,
};

/// Its WordPiece vocabulary (uncased BERT). The tokenizer is assembled in code from
/// this rather than parsing tokenizer.json, which is 3x bigger and ~30 ms to load.
pub(crate) const MINI_VOCAB: ModelFile = ModelFile {
    name: "tend-mini-bge-micro-v2-vocab.txt",
    url: "https://huggingface.co/TaylorAI/bge-micro-v2/resolve/3edf6d7de0faa426b09780416fe61009f26ae589/vocab.txt",
    size: 231_508,
};

/// BERT layers in `MINI_WEIGHTS`.
pub(crate) const MINI_LAYERS: usize = 3;
/// Cache key for embeddings made with `MINI_WEIGHTS`.
pub(crate) const MINI_KEY: &str = "bge-micro-v2@3edf6d7";

const MINI_FILES: [&ModelFile; 2] = [&MINI_VOCAB, &MINI_WEIGHTS];

fn file_ok(dir: &Path, f: &ModelFile) -> bool {
    fs::metadata(dir.join(f.name)).is_ok_and(|m| m.is_file() && m.len() == f.size)
}

/// True when all files of the (tiny, default) model exist in `dir` with their expected sizes.
pub fn model_present(dir: &Path) -> bool {
    MINI_FILES.iter().all(|f| file_ok(dir, f))
}

/// Total download size in bytes of the (tiny, default) model.
pub fn model_size_hint() -> u64 {
    MINI_FILES.iter().map(|f| f.size).sum()
}

/// Downloads missing model files into `dir` (created if needed). Each file is streamed
/// to `<name>.part` and renamed when complete. `progress(downloaded, total)` is called
/// as bytes arrive (totals cover all files; already-present files count as downloaded).
///
/// Afterwards the model runs once to fill the anchor embedding cache (~0.3 s on desktop),
/// so the first real suggestion is as fast as the rest.
pub fn download_model(dir: &Path, progress: &mut dyn FnMut(u64, u64)) -> anyhow::Result<()> {
    download_files(dir, &MINI_FILES, progress)?;
    crate::warm_up(dir);
    Ok(())
}

pub(crate) fn download_files(dir: &Path, files: &[&ModelFile], progress: &mut dyn FnMut(u64, u64)) -> anyhow::Result<()> {
    fs::create_dir_all(dir).with_context(|| format!("create {}", dir.display()))?;
    let total: u64 = files.iter().map(|f| f.size).sum();
    let mut done = 0u64;

    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(20)))
        .user_agent("tend-llm/0.1")
        .build()
        .into();

    for f in files {
        if file_ok(dir, f) {
            done += f.size;
            progress(done, total);
            continue;
        }
        let tmp = dir.join(format!("{}.part", f.name));
        let res = fetch(&agent, f, &tmp, done, total, progress);
        if res.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        res?;
        let dst = dir.join(f.name);
        let _ = fs::remove_file(&dst);
        fs::rename(&tmp, &dst).with_context(|| format!("rename to {}", dst.display()))?;
        done += f.size;
        progress(done, total);
    }
    Ok(())
}

fn fetch(
    agent: &ureq::Agent,
    f: &ModelFile,
    tmp: &Path,
    base: u64,
    total: u64,
    progress: &mut dyn FnMut(u64, u64),
) -> anyhow::Result<()> {
    let mut resp = agent.get(f.url).call().with_context(|| format!("GET {}", f.url))?;
    let mut reader = resp.body_mut().as_reader();
    let mut out = fs::File::create(tmp).with_context(|| format!("create {}", tmp.display()))?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut got = 0u64;
    let mut last_report = 0u64;
    loop {
        let n = reader.read(&mut buf).context("download interrupted")?;
        if n == 0 {
            break;
        }
        out.write_all(&buf[..n])?;
        got += n as u64;
        if got - last_report >= 512 * 1024 {
            last_report = got;
            progress(base + got.min(f.size), total);
        }
    }
    out.sync_all()?;
    if got != f.size {
        bail!("{}: expected {} bytes, got {}", f.name, f.size, got);
    }
    Ok(())
}
