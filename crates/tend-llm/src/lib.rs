//! `tend-llm`: a tiny on-device language model that suggests an effort / reward value
//! (1-10) for a reminder.
//!
//! Default scorer (`suggest`): a 17M-parameter sentence-embedding BERT (bge-micro-v2,
//! 35 MB f16) embeds the task title; effort is a similarity-weighted kNN vote over a
//! built-in labelled anchor set plus the user's own past tasks (weighted higher, so the
//! values the user nudged to dominate for similar tasks), with a small adjustment for
//! steps / notes and the user's average nudge added on top.
//!
//! [`suggest_steps`] reuses the same embeddings to offer step breakdowns from the closest
//! tasks (the user's own history first, then the built-in library); [`suggest_all`] does
//! both with one model load.
//!
//! The model is loaded per call (~25 ms total on desktop) and dropped before returning,
//! so nothing stays resident. Embeddings of the anchors and of the user's past titles
//! are cached in the model directory, so a call normally only embeds the new title.
//!
//! The previous 360M LLM scorer is kept behind the `large` cargo feature ([`large`]).

mod anchors;
mod download;
mod embed;
mod heuristic;
#[cfg(feature = "large")]
mod llm;
mod similarity;
mod tiny;

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;

pub use download::{download_model, model_present, model_size_hint};
pub use heuristic::heuristic_effort;

/// The old SmolLM2-360M scorer (~386 MB, ~1.3 s per call). Same contract as the crate
/// root functions; its files use different names, so both can share one directory.
#[cfg(feature = "large")]
pub mod large {
    pub use crate::llm::{download_model, model_present, model_size_hint, suggest};
}

/// A task to score.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TaskInput {
    pub title: String,
    pub notes: String,
    pub steps: Vec<String>,
}

/// A past task with the user's final (adjusted) effort value, used as a neighbour.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Example {
    pub title: String,
    pub effort: f32,
}

/// Suggested effort.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Suggestion {
    /// Similarity-weighted effort plus `user_bias`, clamped to 1..=10.
    pub effort: f32,
    /// The neighbours' most voted (rounded) value plus rounded `user_bias`, clamped.
    pub argmax: u8,
    /// Share of the neighbour vote that `argmax` got (0..1). For the heuristic a fixed 0.3.
    pub confidence: f32,
    /// `"llm"` or `"heuristic"`.
    #[serde(skip_deserializing, default = "default_source")]
    pub source: &'static str,
    /// Wall time of the call (load + score + unload).
    pub millis: u64,
}

fn default_source() -> &'static str {
    "heuristic"
}

/// A past task of the user's with the steps they used, for [`suggest_steps`].
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PastTask {
    pub title: String,
    pub steps: Vec<String>,
}

/// One suggested breakdown into steps.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepIdea {
    pub steps: Vec<String>,
    /// Title of the matched task.
    pub from: String,
    /// `"yours"` (from the user's history) or `"library"` (built in).
    #[serde(skip_deserializing, default = "default_idea_source")]
    pub source: &'static str,
    /// Cosine similarity of the titles (0..1); word-overlap score without the model.
    pub similarity: f32,
}

fn default_idea_source() -> &'static str {
    "library"
}

/// Loads the tiny model, scores, drops everything before returning. Falls back to the
/// heuristic if the model is missing.
///
/// `examples` are the user's past tasks with the effort they settled on (any number; their
/// embeddings are cached on disk in `dir`). `user_bias` (mean of the user's nudges) is
/// added to the result.
pub fn suggest(dir: &Path, task: &TaskInput, examples: &[Example], user_bias: f32) -> anyhow::Result<Suggestion> {
    Ok(suggest_all(dir, task, examples, user_bias, &[], 0)?.0)
}

/// Loads the tiny model, finds the closest tasks that have steps (the user's own
/// `history` ranked above the built-in library), drops the model. Returns up to `max`
/// distinct breakdowns, best first; empty if nothing is similar enough. History items
/// without steps are skipped. Without the model, falls back to word overlap.
pub fn suggest_steps(dir: &Path, title: &str, history: &[PastTask], max: usize) -> anyhow::Result<Vec<StepIdea>> {
    if max == 0 || title.trim().is_empty() {
        return Ok(Vec::new());
    }
    if !model_present(dir) {
        return Ok(tiny::step_ideas_keyword(title, history, max));
    }
    let e = tiny::embed(&mini_spec(dir), title, &tiny::user_titles(&[], history))?;
    Ok(tiny::step_ideas(&e, history, max))
}

/// [`suggest`] and [`suggest_steps`] (for `task.title`) with a single model load, for an
/// editor that wants both. `max_steps = 0` skips step ideas.
pub fn suggest_all(
    dir: &Path,
    task: &TaskInput,
    examples: &[Example],
    user_bias: f32,
    history: &[PastTask],
    max_steps: usize,
) -> anyhow::Result<(Suggestion, Vec<StepIdea>)> {
    let start = Instant::now();
    let bias = if user_bias.is_finite() { user_bias } else { 0.0 };
    let want_steps = max_steps > 0 && !task.title.trim().is_empty();

    if !model_present(dir) {
        let h = heuristic_effort(task);
        let ideas = if want_steps { tiny::step_ideas_keyword(&task.title, history, max_steps) } else { Vec::new() };
        let s = Suggestion {
            effort: clamp(h + bias),
            argmax: clamp((h + bias).round()) as u8,
            confidence: 0.3,
            source: "heuristic",
            millis: start.elapsed().as_millis() as u64,
        };
        return Ok((s, ideas));
    }

    let history = if want_steps { history } else { &[] };
    let e = tiny::embed(&mini_spec(dir), &tiny::query_text(task), &tiny::user_titles(examples, history))?;
    let s = tiny::effort(&e, task, examples, tiny::Params::default());
    let ideas = if want_steps { tiny::step_ideas(&e, history, max_steps) } else { Vec::new() };
    let s = Suggestion {
        effort: clamp(s.effort + bias),
        argmax: clamp(s.argmax as f32 + bias.round()) as u8,
        confidence: s.confidence,
        source: "llm",
        millis: start.elapsed().as_millis() as u64,
    };
    Ok((s, ideas))
}

/// Fills the anchor embedding cache. Best effort (it is rebuilt on demand anyway).
pub(crate) fn warm_up(dir: &Path) {
    let _ = tiny::embed(&mini_spec(dir), "warm up", &[]);
}

fn mini_spec(dir: &Path) -> tiny::ModelSpec {
    tiny::ModelSpec {
        weights: dir.join(download::MINI_WEIGHTS.name),
        vocab: dir.join(download::MINI_VOCAB.name),
        layers: download::MINI_LAYERS,
        cache_dir: dir.to_path_buf(),
        key: download::MINI_KEY,
    }
}

pub(crate) fn clamp(x: f32) -> f32 {
    if x.is_nan() { 5.0 } else { x.clamp(1.0, 10.0) }
}

/// candle sizes its global CPU pools from `CANDLE_NUM_THREADS` / `RAYON_NUM_THREADS` on first
/// use (default: physical core count) and keeps them for the process lifetime (workers park
/// when idle, so they cost no CPU). On Android we cap this at 4 so the little cores don't
/// stall the barrier-synchronised matmuls. To avoid the `set_var` here, the host app can set
/// `CANDLE_NUM_THREADS` itself at startup.
pub(crate) fn limit_threads() {
    #[cfg(target_os = "android")]
    {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            if std::env::var_os("CANDLE_NUM_THREADS").is_none() && std::env::var_os("RAYON_NUM_THREADS").is_none() {
                let n = std::thread::available_parallelism().map_or(4, |n| n.get()).min(4).to_string();
                // SAFETY: runs once, before candle first reads these; only races with
                // concurrent env access from other threads at this exact moment.
                unsafe {
                    std::env::set_var("CANDLE_NUM_THREADS", &n);
                    std::env::set_var("RAYON_NUM_THREADS", &n);
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heuristic_without_model() {
        let dir = std::env::temp_dir().join("tend-llm-test-no-model");
        let s = suggest(&dir, &TaskInput { title: "do tax return".into(), ..Default::default() }, &[], 0.5).unwrap();
        assert_eq!(s.source, "heuristic");
        assert!((1.0..=10.0).contains(&s.effort));
    }
}
