//! The previous, larger scorer (feature `large`): SmolLM2-360M-Instruct Q8 GGUF, ~386 MB,
//! ~1.3 s per call on desktop. Prompt building and logit scoring with candle's quantized llama.
//!
//! * No generation: one prompt forward pass, then the next-token logits are read for
//!   the digit tokens `"1"`..`"9"`. Because the tokenizer splits `"10"` into `"1"`,`"0"`,
//!   one extra single-token pass after `"1"` decides `P("0" | "1")` vs end-of-turn,
//!   which splits the mass of `"1"` into `1` and `10`. The result is a proper
//!   distribution over 1..=10; we return its expected value, argmax and max probability.
//! * Personalisation by in-context few-shot (most similar past tasks by word overlap).
//!
//! The prompt is a plain-text few-shot list (no chat template), which tested clearly
//! better than ChatML multi-turn prompts on SmolLM2 (the chat variant mostly copied the
//! previous answer):
//!
//! ```text
//! Effort ratings for everyday tasks, from 1 (tiny, a minute) to 10 (huge, days of work).
//!
//! Task: Pack up and move house
//! Effort: 10
//!
//! ...
//! Task: <query>
//! Effort: ␣
//! ```

use crate::download::{ModelFile, download_files};
use crate::{Example, Suggestion, TaskInput, clamp, similarity};
use anyhow::{Context, anyhow};
use candle_core::quantized::gguf_file;
use candle_core::{Device, Tensor};
use candle_transformers::models::quantized_llama::ModelWeights;
use std::path::Path;
use std::time::Instant;
use tokenizers::Tokenizer;

/// Quantized weights (SmolLM2-360M-Instruct, Q8_0, llama architecture). 135M was tried
/// and rejected: its scores barely moved between "buy milk" and "renovate the bathroom".
const WEIGHTS: ModelFile = ModelFile {
    name: "SmolLM2-360M-Instruct-Q8_0.gguf",
    url: "https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q8_0.gguf",
    size: 386_405_280,
};

/// Tokenizer (shared by the whole SmolLM2 family).
const TOKENIZER: ModelFile = ModelFile {
    name: "smollm2-tokenizer.json",
    url: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct/resolve/main/tokenizer.json",
    size: 2_104_556,
};

const FILES: [&ModelFile; 2] = [&TOKENIZER, &WEIGHTS];

/// True when the large model's files are in `dir`.
pub fn model_present(dir: &Path) -> bool {
    FILES.iter().all(|f| std::fs::metadata(dir.join(f.name)).is_ok_and(|m| m.is_file() && m.len() == f.size))
}

/// Download size of the large model.
pub fn model_size_hint() -> u64 {
    FILES.iter().map(|f| f.size).sum()
}

/// Downloads the large model into `dir`.
pub fn download_model(dir: &Path, progress: &mut dyn FnMut(u64, u64)) -> anyhow::Result<()> {
    download_files(dir, &FILES, progress)
}

/// Same contract as [`crate::suggest`], using the 360M model (no heuristic fallback:
/// errors if the model is missing). Up to 6 most similar examples (word overlap) are
/// used as few-shot examples.
pub fn suggest(dir: &Path, task: &TaskInput, examples: &[Example], user_bias: f32) -> anyhow::Result<Suggestion> {
    let start = Instant::now();
    let bias = if user_bias.is_finite() { user_bias } else { 0.0 };
    let shots = similarity::select_examples(task, examples, 6);
    let dist = score(dir, task, &shots)?; // all model memory is dropped inside

    let ev: f32 = dist.iter().enumerate().map(|(i, p)| (i as f32 + 1.0) * p).sum();
    let (best, conf) = dist
        .iter()
        .copied()
        .enumerate()
        .fold((0, f32::MIN), |a, (i, p)| if p > a.1 { (i, p) } else { a });

    Ok(Suggestion {
        effort: clamp(calibrate(ev, shots.len()) + bias),
        argmax: clamp(best as f32 + 1.0 + bias.round()) as u8,
        confidence: conf,
        source: "llm",
        millis: start.elapsed().as_millis() as u64,
    })
}

/// The small model's expected values are compressed towards the middle (roughly 3..7 for
/// tasks that should span 1..10). A linear stretch fitted on a hand-labelled set
/// (r = 0.83 before and after) undoes that. User examples in the prompt already pull the
/// model onto the user's scale, so the stretch is relaxed as more of them are used.
fn calibrate(ev: f32, n_user_shots: usize) -> f32 {
    const CENTER_IN: f32 = 4.5;
    const CENTER_OUT: f32 = 5.2;
    let w = 1.0 - (n_user_shots.min(6) as f32 / 6.0) * 0.5;
    let slope = 1.0 + 1.1 * w;
    CENTER_OUT + (ev - CENTER_IN) * slope
}

const HEADER: &str = "Effort ratings for everyday tasks, from 1 (tiny, a minute) to 10 (huge, days of work).\n\n";

/// Fixed anchors that define the scale. Interleaved (extremes first, a mid value last)
/// so the model does not just copy the most recent answer.
const ANCHORS: &[(&str, u8)] = &[
    ("Pack up and move house", 10),
    ("Water the plants", 1),
    ("Write and send a job application", 7),
    ("Pay the phone bill online", 2),
    ("Go grocery shopping for the week", 5),
    ("Wash the dishes", 3),
];

fn one_line(s: &str, max: usize) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max).collect()
}

fn query_line(t: &TaskInput) -> String {
    let mut s = one_line(&t.title, 120);
    let steps: Vec<String> = t.steps.iter().map(|s| one_line(s, 40)).filter(|s| !s.is_empty()).collect();
    if !steps.is_empty() {
        let shown = steps.iter().take(8).cloned().collect::<Vec<_>>().join(", ");
        s.push_str(&format!(" ({} steps: {shown})", steps.len()));
    }
    let notes = one_line(&t.notes, 160);
    if !notes.is_empty() {
        s.push_str(&format!(" - {notes}"));
    }
    s
}

/// Full prompt: header, anchors, user's similar examples (most similar last), query.
pub(crate) fn build_prompt(task: &TaskInput, shots: &[Example]) -> String {
    let mut p = String::from(HEADER);
    let user = shots.iter().map(|e| (one_line(&e.title, 120), e.effort.round().clamp(1.0, 10.0) as u8));
    for (t, e) in ANCHORS.iter().map(|(t, e)| (t.to_string(), *e)).chain(user) {
        p.push_str(&format!("Task: {t}\nEffort: {e}\n\n"));
    }
    // Trailing space: the tokenizer emits "Ġ" then the digit, matching the examples.
    p.push_str(&format!("Task: {}\nEffort: ", query_line(task)));
    p
}

/// Returns a probability distribution over efforts 1..=10 (index 0 = effort 1).
/// Model, tokenizer and KV cache are dropped before returning.
pub(crate) fn score(dir: &Path, task: &TaskInput, shots: &[Example]) -> anyhow::Result<[f32; 10]> {
    crate::limit_threads();
    let tokenizer = Tokenizer::from_file(dir.join(TOKENIZER.name)).map_err(|e| anyhow!("tokenizer: {e}"))?;
    let id = |s: &str| tokenizer.token_to_id(s).ok_or_else(|| anyhow!("token {s:?} missing"));
    let digits: Vec<u32> = (1..=9).map(|d| id(&d.to_string())).collect::<Result<_, _>>()?;
    let zero = id("0")?;
    let newline = id("Ċ")?; // byte-level BPE "\n"
    let ids = tokenizer
        .encode(build_prompt(task, shots), false)
        .map_err(|e| anyhow!("encode: {e}"))?
        .get_ids()
        .to_vec();
    drop(tokenizer);

    let device = Device::Cpu;
    let path = dir.join(WEIGHTS.name);
    // Buffered: the GGUF header holds ~100k small vocab/merge strings; unbuffered reads
    // made header parsing take ~750 ms on Windows.
    let file = std::fs::File::open(&path).with_context(|| format!("open {}", path.display()))?;
    let mut file = std::io::BufReader::with_capacity(1 << 20, file);
    let content = gguf_file::Content::read(&mut file).context("read gguf")?;
    let mut model = ModelWeights::from_gguf(content, &mut file, &device).context("load gguf")?;
    drop(file);

    // Pass 1: whole prompt -> first answer digit, restricted to "1".."9".
    let input = Tensor::new(ids.as_slice(), &device)?.unsqueeze(0)?;
    let logits = model.forward(&input, 0)?.squeeze(0)?.to_vec1::<f32>()?;
    let mut p: Vec<f32> = digits.iter().map(|&t| logits[t as usize]).collect();
    softmax(&mut p);

    // Pass 2 (one token, reuses KV cache): after "1", is the next token "0" (=10) or "\n" (=1)?
    let mut dist = [0f32; 10];
    dist[1..9].copy_from_slice(&p[1..9]);
    dist[0] = p[0];
    if p[0] > 0.01 {
        let one = Tensor::new(&[digits[0]], &device)?.unsqueeze(0)?;
        let l2 = model.forward(&one, ids.len())?.squeeze(0)?.to_vec1::<f32>()?;
        let mut c = [l2[zero as usize], l2[newline as usize]];
        softmax(&mut c);
        dist[0] = p[0] * c[1];
        dist[9] = p[0] * c[0];
    }
    drop(model);
    Ok(dist)
}

fn softmax(v: &mut [f32]) {
    let m = v.iter().copied().fold(f32::MIN, f32::max);
    let mut sum = 0.0;
    for x in v.iter_mut() {
        *x = (*x - m).exp();
        sum += *x;
    }
    for x in v.iter_mut() {
        *x /= sum;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_shape() {
        let t = TaskInput { title: "Deep clean kitchen".into(), notes: "".into(), steps: vec!["oven".into(), "floor".into()] };
        let p = build_prompt(&t, &[Example { title: "clean bathroom".into(), effort: 6.4 }]);
        assert!(p.ends_with("Task: Deep clean kitchen (2 steps: oven, floor)\nEffort: "));
        assert!(p.contains("Task: clean bathroom\nEffort: 6\n\n"));
    }
}
