//! The default scorer: a tiny sentence-embedding model + retrieval.
//!
//! 1. Embeddings of the built-in anchors come from an on-disk cache in the model dir
//!    (computed on first use); user titles (examples and history) come from a second
//!    cache keyed by title hash, so normally only the query title needs embedding.
//! 2. Load the embedder (35 MB f16 BERT, 3 layers), embed whatever is missing plus the
//!    query in one go, drop the model ([`embed`]).
//! 3. Effort ([`effort`]): the K most similar neighbours (anchors and user examples; user
//!    examples weighted `user_weight`x) vote with weight `exp(sim / temp)`. Their weighted
//!    mean, stretched a little away from the middle (averaging compresses it), plus a
//!    small step/notes adjustment, is the effort.
//! 4. Step ideas ([`step_ideas`]): the closest tasks that have a breakdown, the user's
//!    own history ranked above the library.

use crate::anchors::{ANCHORS, Anchor};
use crate::embed::{DIM, dot, embed_texts};
use crate::similarity::words;
use crate::{Example, PastTask, StepIdea, TaskInput};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Where the model files and caches live, plus a key that ties caches to the weights.
pub(crate) struct ModelSpec {
    pub weights: PathBuf,
    /// WordPiece `vocab.txt`.
    pub vocab: PathBuf,
    pub layers: usize,
    pub cache_dir: PathBuf,
    /// Identifies the weights; changing it invalidates both caches.
    pub key: &'static str,
}

/// Effort tunables. `Default` is what `suggest` uses.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Params {
    /// Number of neighbours that vote.
    pub k: usize,
    /// Softmax temperature over cosine similarity (smaller = nearest neighbour dominates).
    pub temp: f32,
    /// Multiplier on a user example's vote vs an anchor's.
    pub user_weight: f32,
    /// Stretch of the kNN mean away from `CENTER`.
    pub stretch: f32,
    /// Effort added per step beyond the first (capped at `MAX_STEP_ADJ`).
    pub per_step: f32,
    /// Effort added for long notes (scaled by notes length, up to this).
    pub notes: f32,
}

impl Default for Params {
    fn default() -> Self {
        Self { k: 10, temp: 0.05, user_weight: 11.0, stretch: 1.25, per_step: 0.3, notes: 0.6 }
    }
}

const CENTER: f32 = 4.5;
const MAX_STEP_ADJ: f32 = 2.0;

pub(crate) struct Score {
    pub effort: f32,
    pub argmax: u8,
    pub confidence: f32,
}

/// Everything the scorers need, with the model already dropped.
pub(crate) struct Embedded {
    anchors: Vec<Vec<f32>>,
    user: HashMap<u64, Vec<f32>>,
    query: Vec<f32>,
}

impl Embedded {
    fn user_vec(&self, normalized_title: &str) -> Option<&Vec<f32>> {
        self.user.get(&fnv(normalized_title.as_bytes()))
    }
}

/// Embeds `query` and any of `user_titles` (normalised, unique) not yet cached, plus the
/// anchors if their cache is missing — one model load, dropped before returning.
pub(crate) fn embed(spec: &ModelSpec, query: &str, user_titles: &[String]) -> anyhow::Result<Embedded> {
    let anchor_key = anchors_key(spec.key);
    let anchor_path = spec.cache_dir.join("tend-mini-anchors.bin");
    let user_path = spec.cache_dir.join("tend-mini-user.bin");
    let user_key = fnv(spec.key.as_bytes());

    let mut anchors = read_anchor_cache(&anchor_path, anchor_key);
    let mut user = read_user_cache(&user_path, user_key);
    let missing: Vec<&String> = user_titles.iter().filter(|t| !user.contains_key(&fnv(t.as_bytes()))).collect();

    let mut texts: Vec<String> = Vec::new();
    if anchors.is_none() {
        texts.extend(ANCHORS.iter().map(|a| a.0.to_string()));
    }
    texts.extend(missing.iter().map(|t| t.to_string()));
    texts.push(normalize(query));
    let mut vecs = embed_texts(&spec.weights, &spec.vocab, spec.layers, &texts)?; // model dropped inside
    let query = vecs.pop().unwrap_or_default();
    if !missing.is_empty() {
        let tail = vecs.split_off(vecs.len() - missing.len());
        let new: Vec<(u64, Vec<f32>)> = missing.iter().map(|t| fnv(t.as_bytes())).zip(tail).collect();
        write_user_cache(&user_path, user_key, &user, &new, user_titles);
        user.extend(new);
    }
    if anchors.is_none() {
        write_anchor_cache(&anchor_path, anchor_key, &vecs);
        anchors = Some(vecs);
    }
    Ok(Embedded { anchors: anchors.unwrap_or_default(), user, query })
}

/// Normalised unique titles of examples and of history items with steps (what `embed`
/// needs in the user cache).
pub(crate) fn user_titles(examples: &[Example], history: &[PastTask]) -> Vec<String> {
    let mut seen = HashSet::new();
    examples
        .iter()
        .filter(|e| e.effort.is_finite())
        .map(|e| &e.title)
        .chain(history.iter().filter(|h| h.steps.iter().any(|s| !s.trim().is_empty())).map(|h| &h.title))
        .map(|t| normalize(t))
        .filter(|t| !t.is_empty() && seen.insert(t.clone()))
        .collect()
}

/// Similarity-weighted kNN effort for `task` (already embedded as `e.query`).
pub(crate) fn effort(e: &Embedded, task: &TaskInput, examples: &[Example], p: Params) -> Score {
    let user = dedupe(examples);
    // Candidates: (log vote weight, label).
    let mut cands: Vec<(f32, f32)> = Vec::with_capacity(e.anchors.len() + user.len());
    for (v, a) in e.anchors.iter().zip(ANCHORS) {
        cands.push((dot(&e.query, v) / p.temp, a.1 as f32));
    }
    let uw = p.user_weight.max(1e-3).ln();
    for (t, label) in &user {
        if let Some(v) = e.user_vec(t) {
            cands.push((dot(&e.query, v) / p.temp + uw, *label));
        }
    }
    knn(cands, task, p)
}

/// Library matches need at least this cosine similarity.
pub(crate) const STEPS_MIN_SIM_LIBRARY: f32 = 0.72;
/// The user's own history is trusted a little more loosely.
pub(crate) const STEPS_MIN_SIM_YOURS: f32 = 0.68;
/// Ranking bonus for the user's own breakdowns over the library's.
pub(crate) const STEPS_YOURS_BONUS: f32 = 0.08;

/// Up to `max` distinct breakdowns from the closest tasks, best first.
pub(crate) fn step_ideas(e: &Embedded, history: &[PastTask], max: usize) -> Vec<StepIdea> {
    let mut cands: Vec<(f32, StepIdea)> = Vec::new();
    for h in history {
        let steps = clean_steps(&h.steps);
        if steps.is_empty() {
            continue;
        }
        if let Some(v) = e.user_vec(&normalize(&h.title)) {
            let sim = dot(&e.query, v);
            if sim >= STEPS_MIN_SIM_YOURS {
                cands.push((sim + STEPS_YOURS_BONUS, yours(h, steps, sim)));
            }
        }
    }
    for (v, a) in e.anchors.iter().zip(ANCHORS) {
        if a.2.is_empty() {
            continue;
        }
        let sim = dot(&e.query, v);
        if sim >= STEPS_MIN_SIM_LIBRARY {
            cands.push((sim, library_idea(a, sim)));
        }
    }
    rank(cands, max)
}

/// Model-free fallback: word overlap (Dice) against library and history titles.
pub(crate) fn step_ideas_keyword(title: &str, history: &[PastTask], max: usize) -> Vec<StepIdea> {
    const MIN_DICE: f32 = 0.5;
    let q = words(title);
    let dice = |t: &str| {
        let w = words(t);
        if q.is_empty() || w.is_empty() { 0.0 } else { 2.0 * q.intersection(&w).count() as f32 / (q.len() + w.len()) as f32 }
    };
    let mut cands: Vec<(f32, StepIdea)> = Vec::new();
    for h in history {
        let steps = clean_steps(&h.steps);
        let sim = dice(&h.title);
        if !steps.is_empty() && sim >= MIN_DICE {
            cands.push((sim + STEPS_YOURS_BONUS, yours(h, steps, sim)));
        }
    }
    for a in ANCHORS.iter().filter(|a| !a.2.is_empty()) {
        let sim = dice(a.0);
        if sim >= MIN_DICE {
            cands.push((sim, library_idea(a, sim)));
        }
    }
    rank(cands, max)
}

fn yours(h: &PastTask, steps: Vec<String>, sim: f32) -> StepIdea {
    StepIdea { steps, from: h.title.trim().to_string(), source: "yours", similarity: sim }
}

fn library_idea(a: &Anchor, sim: f32) -> StepIdea {
    StepIdea { steps: a.2.iter().map(|s| s.to_string()).collect(), from: a.0.to_string(), source: "library", similarity: sim }
}

fn clean_steps(steps: &[String]) -> Vec<String> {
    steps.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).map(String::from).collect()
}

/// Sorts by rank score and drops breakdowns identical (case/space-insensitive) to a
/// better-ranked one.
fn rank(mut cands: Vec<(f32, StepIdea)>, max: usize) -> Vec<StepIdea> {
    cands.sort_by(|a, b| b.0.total_cmp(&a.0));
    let mut seen = HashSet::new();
    cands
        .into_iter()
        .map(|c| c.1)
        .filter(|i| seen.insert(i.steps.iter().map(|s| normalize(s)).collect::<Vec<_>>().join("\n")))
        .take(max)
        .collect()
}

/// `cands` are (log-weight, label). Picks top-k, softmax-weights them, stretches, adjusts.
fn knn(mut cands: Vec<(f32, f32)>, task: &TaskInput, p: Params) -> Score {
    cands.sort_by(|a, b| b.0.total_cmp(&a.0));
    cands.truncate(p.k.max(1));
    let top = cands.first().map_or(0.0, |c| c.0);
    let w: Vec<f32> = cands.iter().map(|c| (c.0 - top).exp()).collect();
    let sum: f32 = w.iter().sum::<f32>().max(1e-12);
    let mean = cands.iter().zip(&w).map(|(c, w)| c.1 * w).sum::<f32>() / sum;

    // Weighted vote over rounded labels for argmax / confidence.
    let mut votes = [0f32; 10];
    for (c, w) in cands.iter().zip(&w) {
        votes[(c.1.round().clamp(1.0, 10.0) as usize) - 1] += w / sum;
    }
    let (best, conf) = votes.iter().copied().enumerate().fold((4, 0.0), |a, (i, v)| if v > a.1 { (i, v) } else { a });

    let effort = CENTER + (mean - CENTER) * p.stretch + adjustment(task, p);
    Score { effort, argmax: best as u8 + 1, confidence: conf }
}

/// Extra effort for many steps / long notes (neighbours are bare titles).
fn adjustment(task: &TaskInput, p: Params) -> f32 {
    let steps = task.steps.iter().filter(|s| !s.trim().is_empty()).count() as f32;
    let step_adj = ((steps - 1.0).max(0.0) * p.per_step).min(MAX_STEP_ADJ);
    let notes_words = task.notes.split_whitespace().count() as f32;
    let notes_adj = (notes_words / 20.0).min(1.0) * p.notes;
    step_adj + notes_adj
}

/// What gets embedded for the query: the title only (anchors and history are titles too).
pub(crate) fn query_text(task: &TaskInput) -> String {
    let t = normalize(&task.title);
    if t.is_empty() { normalize(&task.notes) } else { t }
}

pub(crate) fn normalize(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase().chars().take(200).collect()
}

/// Normalised title -> mean effort, in first-seen order.
fn dedupe(examples: &[Example]) -> Vec<(String, f32)> {
    let mut acc: Vec<(String, f32, u32)> = Vec::new();
    let mut idx: HashMap<String, usize> = HashMap::new();
    for e in examples {
        let t = normalize(&e.title);
        if t.is_empty() || !e.effort.is_finite() {
            continue;
        }
        let v = e.effort.clamp(1.0, 10.0);
        match idx.get(&t) {
            Some(&i) => {
                acc[i].1 += v;
                acc[i].2 += 1;
            }
            None => {
                idx.insert(t.clone(), acc.len());
                acc.push((t, v, 1));
            }
        }
    }
    acc.into_iter().map(|(t, s, n)| (t, s / n as f32)).collect()
}

// ---------------------------------------------------------------- caches

/// FNV-1a 64: stable across Rust versions (unlike `DefaultHasher`), which matters for
/// on-disk keys.
pub(crate) fn fnv(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

fn anchors_key(model_key: &str) -> u64 {
    let mut s = String::from(model_key);
    for a in ANCHORS {
        s.push('\n');
        s.push_str(a.0);
    }
    fnv(s.as_bytes())
}

const ANCHOR_MAGIC: &[u8; 8] = b"TENDANC1";
const USER_MAGIC: &[u8; 8] = b"TENDUSR1";
const REC: usize = 8 + DIM * 4;
/// Rewrite the user cache (keeping only titles still in use) past this many records.
const MAX_USER_RECORDS: usize = 2000;

fn f32s(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect()
}

fn put_f32s(out: &mut Vec<u8>, v: &[f32]) {
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
}

fn read_anchor_cache(path: &Path, key: u64) -> Option<Vec<Vec<f32>>> {
    let b = fs::read(path).ok()?;
    let n = ANCHORS.len();
    if b.len() != 16 + n * DIM * 4 || &b[..8] != ANCHOR_MAGIC || b[8..16] != key.to_le_bytes() {
        return None;
    }
    Some(b[16..].chunks_exact(DIM * 4).map(f32s).collect())
}

/// Best effort: a failed write only means recomputing next time.
fn write_anchor_cache(path: &Path, key: u64, v: &[Vec<f32>]) {
    let mut out = Vec::with_capacity(16 + v.len() * DIM * 4);
    out.extend_from_slice(ANCHOR_MAGIC);
    out.extend_from_slice(&key.to_le_bytes());
    for e in v {
        put_f32s(&mut out, e);
    }
    let tmp = path.with_extension("tmp");
    if fs::write(&tmp, &out).is_ok() {
        let _ = fs::rename(&tmp, path);
    }
}

fn read_user_cache(path: &Path, key: u64) -> HashMap<u64, Vec<f32>> {
    let mut map = HashMap::new();
    let Ok(b) = fs::read(path) else { return map };
    if b.len() < 16 || &b[..8] != USER_MAGIC || b[8..16] != key.to_le_bytes() {
        return map;
    }
    // A torn final record (crash mid-append) is ignored by chunks_exact.
    for r in b[16..].chunks_exact(REC) {
        let h = u64::from_le_bytes(r[..8].try_into().unwrap());
        map.insert(h, f32s(&r[8..]));
    }
    map
}

/// Appends `new` records, or rewrites the file (header + records for titles still in
/// `keep`) if it is missing, invalid, torn or too big. Best effort.
fn write_user_cache(path: &Path, key: u64, old: &HashMap<u64, Vec<f32>>, new: &[(u64, Vec<f32>)], keep: &[String]) {
    let len = fs::metadata(path).map(|m| m.len() as usize).unwrap_or(0);
    let intact = len >= 16 && (len - 16).is_multiple_of(REC) && (len - 16) / REC == old.len();
    let rewrite = !intact || old.len() + new.len() > MAX_USER_RECORDS;
    let mut out = Vec::new();
    if rewrite {
        out.extend_from_slice(USER_MAGIC);
        out.extend_from_slice(&key.to_le_bytes());
        for t in keep {
            let h = fnv(t.as_bytes());
            if let Some(v) = old.get(&h) {
                out.extend_from_slice(&h.to_le_bytes());
                put_f32s(&mut out, v);
            }
        }
    }
    for (h, v) in new {
        out.extend_from_slice(&h.to_le_bytes());
        put_f32s(&mut out, v);
    }
    let _ = if rewrite {
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, &out).and_then(|_| fs::rename(&tmp, path))
    } else {
        fs::OpenOptions::new().append(true).open(path).and_then(|mut f| f.write_all(&out))
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(title: &str, steps: usize) -> TaskInput {
        TaskInput { title: title.into(), notes: String::new(), steps: vec!["x".into(); steps] }
    }

    #[test]
    fn knn_prefers_close_and_user() {
        let p = Params::default();
        // Anchor at sim 0.6 says 2; user example at sim 0.6 says 8 -> user wins clearly.
        let c = vec![(0.6 / p.temp, 2.0), (0.6 / p.temp + p.user_weight.ln(), 8.0)];
        let s = knn(c, &t("x", 0), p);
        assert!(s.effort > 6.0, "{}", s.effort);
        assert_eq!(s.argmax, 8);
    }

    #[test]
    fn steps_add_effort() {
        let p = Params::default();
        let c = vec![(1.0, 4.0)];
        assert!(knn(c.clone(), &t("x", 5), p).effort > knn(c, &t("x", 0), p).effort);
    }

    #[test]
    fn dedupe_averages() {
        let ex = vec![
            Example { title: "Bins ".into(), effort: 2.0 },
            Example { title: "bins".into(), effort: 4.0 },
            Example { title: " ".into(), effort: 4.0 },
        ];
        assert_eq!(dedupe(&ex), vec![("bins".to_string(), 3.0)]);
    }

    #[test]
    fn anchors_have_steps() {
        let with = ANCHORS.iter().filter(|a| !a.2.is_empty()).count();
        assert!(with >= 150, "{with} anchors with steps");
        for a in ANCHORS {
            assert!((1..=10).contains(&a.1), "{}", a.0);
            assert!(a.2.is_empty() || (2..=6).contains(&a.2.len()), "{}", a.0);
        }
        let mut titles: Vec<String> = ANCHORS.iter().map(|a| normalize(a.0)).collect();
        titles.sort();
        titles.dedup();
        assert_eq!(titles.len(), ANCHORS.len(), "duplicate anchor title");
    }

    #[test]
    fn keyword_steps_prefer_yours_and_dedupe() {
        let hist = vec![
            PastTask { title: "Clean the bathroom".into(), steps: vec!["Spray".into(), "Wipe".into()] },
            PastTask { title: "clean the bathroom".into(), steps: vec![" spray".into(), "wipe ".into()] },
            PastTask { title: "Clean the bathroom".into(), steps: vec![] },
        ];
        let ideas = step_ideas_keyword("clean bathroom", &hist, 3);
        assert_eq!(ideas[0].source, "yours");
        assert_eq!(ideas.iter().filter(|i| i.source == "yours").count(), 1);
        assert!(ideas.iter().any(|i| i.source == "library"));
    }

    #[test]
    fn fnv_stable() {
        assert_eq!(fnv(b"a"), 0xaf63dc4c8601ec8c);
    }
}
