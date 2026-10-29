//! Sentence embeddings with a tiny BERT (candle). Mean pooling over the attention mask,
//! then L2-normalised, so a dot product is the cosine similarity.
//!
//! [`embed_texts`] is one-shot: tokenize everything, load only what is needed, run,
//! drop. Two tricks keep the load near-instant:
//! * The tokenizer works straight off `vocab.txt` instead of parsing the ~700 KB
//!   `tokenizer.json` (that alone took ~30 ms).
//! * The word-embedding table (30522 x 384, two thirds of the weights) is never fully
//!   read or converted: the file is memory-mapped and only the rows for tokens that occur
//!   in this call are copied out, so most of its pages are never even read from disk.

use anyhow::{Context, anyhow};
use candle_core::safetensors::MmapedSafetensors;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config, HiddenAct, PositionEmbeddingType};
use std::collections::HashMap;
use std::path::Path;
use tokenizers::normalizers::BertNormalizer;
use tokenizers::pre_tokenizers::bert::BertPreTokenizer;
use tokenizers::{NormalizedString, Normalizer, OffsetReferential, OffsetType, PreTokenizedString, PreTokenizer};

/// Embedding width of every model we use (MiniLM / bge-micro family).
pub(crate) const DIM: usize = 384;
/// Titles are short; this only guards against someone pasting an essay into the title.
const MAX_TOKENS: usize = 64;
/// Texts per forward pass.
const BATCH: usize = 32;
const WORD_EMB: &str = "embeddings.word_embeddings.weight";

/// BERT config shared by MiniLM-L3/L6 and bge-micro (only the layer count differs), so
/// no config.json has to be downloaded. `vocab` is the size of the trimmed table.
fn config(layers: usize, vocab: usize) -> Config {
    Config {
        vocab_size: vocab,
        hidden_size: DIM,
        num_hidden_layers: layers,
        num_attention_heads: 12,
        intermediate_size: 1536,
        hidden_act: HiddenAct::Gelu,
        hidden_dropout_prob: 0.0,
        max_position_embeddings: 512,
        type_vocab_size: 2,
        initializer_range: 0.02,
        layer_norm_eps: 1e-12,
        pad_token_id: 0,
        position_embedding_type: PositionEmbeddingType::Absolute,
        use_cache: false,
        classifier_dropout: None,
        model_type: Some("bert".into()),
    }
}

/// Uncased BERT WordPiece tokenizer producing `[CLS] ... [SEP]` ids, equivalent to the
/// model's `tokenizer.json` (except that a literal "[CLS]" typed by the user is not
/// treated as a special token). Normalisation and pre-tokenisation reuse the
/// `tokenizers` crate; the WordPiece lookup borrows straight from the vocab text, which
/// avoids allocating 30k strings (~10-20 ms with the crate's own `WordPiece`).
pub(crate) fn tokenize_all(vocab_text: &str, texts: &[String]) -> anyhow::Result<Vec<Vec<u32>>> {
    let mut vocab: HashMap<&str, u32> = HashMap::with_capacity(32_000);
    for (i, line) in vocab_text.lines().enumerate() {
        vocab.insert(line.trim_end_matches('\r'), i as u32);
    }
    let id = |t: &str| vocab.get(t).copied().ok_or_else(|| anyhow!("{t} missing from vocab"));
    let (cls, sep, unk) = (id("[CLS]")?, id("[SEP]")?, id("[UNK]")?);
    let normalizer = BertNormalizer::default();
    let mut out = Vec::with_capacity(texts.len());
    let mut buf = String::new();
    for text in texts {
        let mut n = NormalizedString::from(text.as_str());
        normalizer.normalize(&mut n).map_err(|e| anyhow!("normalize: {e}"))?;
        let mut pre = PreTokenizedString::from(n);
        BertPreTokenizer.pre_tokenize(&mut pre).map_err(|e| anyhow!("pre-tokenize: {e}"))?;
        let mut ids = vec![cls];
        'words: for (word, _, _) in pre.get_splits(OffsetReferential::Original, OffsetType::Byte) {
            if ids.len() >= MAX_TOKENS - 1 {
                break;
            }
            let mark = ids.len();
            if word.chars().count() > 100 {
                ids.push(unk);
                continue;
            }
            let mut start = 0;
            while start < word.len() {
                let mut end = word.len();
                let found = loop {
                    if end <= start {
                        break None;
                    }
                    buf.clear();
                    if start > 0 {
                        buf.push_str("##");
                    }
                    buf.push_str(&word[start..end]);
                    if let Some(&t) = vocab.get(buf.as_str()) {
                        break Some(t);
                    }
                    end -= word[start..end].chars().last().map_or(1, char::len_utf8);
                };
                match found {
                    Some(t) => ids.push(t),
                    None => {
                        ids.truncate(mark);
                        ids.push(unk);
                        continue 'words;
                    }
                }
                start = end;
            }
        }
        ids.truncate(MAX_TOKENS - 1);
        ids.push(sep);
        out.push(ids);
    }
    Ok(out)
}

/// Widens raw little-endian weights to f32 in plain software. The `half` crate picks F16C
/// instructions at runtime, and some x86 Android emulators advertise F16C without AVX,
/// which crashes with SIGILL — so we never route weight loading through it.
fn to_f32(raw: &[u8], dt: DType) -> Vec<f32> {
    match dt {
        DType::F32 => raw.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect(),
        DType::BF16 => raw
            .chunks_exact(2)
            .map(|b| f32::from_bits((u16::from_le_bytes([b[0], b[1]]) as u32) << 16))
            .collect(),
        _ => raw.chunks_exact(2).map(|b| f16_to_f32(u16::from_le_bytes([b[0], b[1]]))).collect(),
    }
}

fn f16_to_f32(h: u16) -> f32 {
    let sign = ((h >> 15) as u32) << 31;
    let exp = ((h >> 10) & 0x1f) as u32;
    let man = (h & 0x3ff) as u32;
    let bits = match (exp, man) {
        (0, 0) => sign,
        (0, _) => {
            // Subnormal: normalise the mantissa.
            let mut e = 127 - 15 + 1;
            let mut m = man;
            while m & 0x400 == 0 {
                m <<= 1;
                e -= 1;
            }
            sign | (e << 23) | ((m & 0x3ff) << 13)
        }
        (0x1f, 0) => sign | 0x7f80_0000,
        (0x1f, _) => sign | 0x7fc0_0000,
        _ => sign | ((exp + 127 - 15) << 23) | (man << 13),
    };
    f32::from_bits(bits)
}

/// Embeds `texts` with the BERT at `weights` (f16 or f32 safetensors; computed in f32).
/// Everything is loaded and dropped inside. Output rows are unit length.
pub(crate) fn embed_texts(weights: &Path, vocab: &Path, layers: usize, texts: &[String]) -> anyhow::Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    crate::limit_threads();
    let vocab_text = std::fs::read_to_string(vocab).with_context(|| format!("read {}", vocab.display()))?;
    let enc = tokenize_all(&vocab_text, texts)?;
    drop(vocab_text);

    // Trimmed vocabulary: original id -> row in the small table. Row 0 is [PAD] (id 0).
    let mut remap: HashMap<u32, u32> = HashMap::from([(0, 0)]);
    let mut used: Vec<u32> = vec![0];
    let ids: Vec<Vec<u32>> = enc
        .iter()
        .map(|e| {
            e.iter()
                .map(|&id| {
                    *remap.entry(id).or_insert_with(|| {
                        used.push(id);
                        used.len() as u32 - 1
                    })
                })
                .collect()
        })
        .collect();
    drop(enc);

    let device = Device::Cpu;
    let model = {
        // SAFETY: the model file lives in the app's private data dir, is only ever replaced
        // by an atomic rename (download), and is never written in place while mapped.
        let st = unsafe { MmapedSafetensors::new(weights) }.with_context(|| format!("mmap {}", weights.display()))?;
        let mut ts: HashMap<String, Tensor> = HashMap::new();
        for (name, view) in st.tensors() {
            let Ok(dt) = DType::try_from(view.dtype()) else { continue };
            if !matches!(dt, DType::F16 | DType::BF16 | DType::F32) {
                continue; // e.g. MiniLM's i64 position_ids buffer
            }
            let (raw, shape): (Vec<u8>, Vec<usize>) = if name == WORD_EMB {
                let rows = view.shape()[0];
                let row = view.data().len() / rows;
                let mut buf = Vec::with_capacity(used.len() * row);
                for &id in &used {
                    let id = id as usize;
                    anyhow::ensure!(id < rows, "token id {id} out of range");
                    buf.extend_from_slice(&view.data()[id * row..(id + 1) * row]);
                }
                (buf, vec![used.len(), view.shape()[1]])
            } else {
                (view.data().to_vec(), view.shape().to_vec())
            };
            ts.insert(name, Tensor::from_vec(to_f32(&raw, dt), shape, &device)?);
        }
        drop(st); // unmap
        let vb = VarBuilder::from_tensors(ts, DType::F32, &device);
        BertModel::load(vb, &config(layers, used.len())).context("load bert")?
    };

    let mut out = Vec::with_capacity(texts.len());
    for chunk in ids.chunks(BATCH) {
        out.extend(forward(&model, chunk, &device)?);
    }
    Ok(out)
}

fn forward(model: &BertModel, batch: &[Vec<u32>], device: &Device) -> anyhow::Result<Vec<Vec<f32>>> {
    let n = batch.len();
    let len = batch.iter().map(Vec::len).max().unwrap_or(0).max(1);
    let mut ids = vec![0u32; n * len];
    let mut mask = vec![0u32; n * len];
    for (i, row) in batch.iter().enumerate() {
        ids[i * len..i * len + row.len()].copy_from_slice(row);
        mask[i * len..i * len + row.len()].fill(1);
    }
    let ids = Tensor::from_vec(ids, (n, len), device)?;
    let mask = Tensor::from_vec(mask, (n, len), device)?;
    let types = ids.zeros_like()?;
    let hidden = model.forward(&ids, &types, Some(&mask))?; // (n, len, DIM)

    // Mean pool over real tokens, then L2 normalise.
    let m = mask.to_dtype(DType::F32)?.unsqueeze(2)?; // (n, len, 1)
    let summed = hidden.broadcast_mul(&m)?.sum(1)?; // (n, DIM)
    let counts = m.sum(1)?.clamp(1e-9, f32::MAX)?; // (n, 1)
    let mean = summed.broadcast_div(&counts)?;
    let norm = mean.sqr()?.sum_keepdim(1)?.sqrt()?.clamp(1e-12, f32::MAX)?;
    Ok(mean.broadcast_div(&norm)?.to_vec2::<f32>()?)
}

/// Dot product (cosine similarity for unit vectors).
pub(crate) fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod f16_tests {
    use super::f16_to_f32;

    #[test]
    fn software_f16_conversion() {
        assert_eq!(f16_to_f32(0x0000), 0.0);
        assert_eq!(f16_to_f32(0x8000).to_bits(), (-0.0f32).to_bits());
        assert_eq!(f16_to_f32(0x3c00), 1.0);
        assert_eq!(f16_to_f32(0xc000), -2.0);
        assert_eq!(f16_to_f32(0x7bff), 65504.0);
        assert_eq!(f16_to_f32(0x0001), 2f32.powi(-24));
        assert_eq!(f16_to_f32(0x0400), 2f32.powi(-14));
        assert_eq!(f16_to_f32(0x3555), 0.333_251_95);
        assert!(f16_to_f32(0x7c00).is_infinite());
        assert!(f16_to_f32(0x7e00).is_nan());
    }
}
