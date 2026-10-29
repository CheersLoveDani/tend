//! Word sets (used by the heuristic) and word-overlap few-shot selection (`large` scorer).

#[cfg(feature = "large")]
use crate::{Example, TaskInput};
use std::collections::HashSet;

const STOPWORDS: &[&str] = &[
    "a", "an", "the", "to", "of", "and", "or", "for", "in", "on", "at", "my", "me", "i", "is",
    "it", "do", "get", "with", "up", "by", "from", "about", "some", "this", "that", "be", "go",
    "your", "our", "s", "need", "needs", "make",
];

/// Lowercased content words with a crude plural/possessive strip.
pub(crate) fn words(text: &str) -> HashSet<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| {
            let w = w.to_lowercase();
            match w.strip_suffix('s') {
                Some(stem) if stem.len() >= 3 && !stem.ends_with('s') => stem.to_string(),
                _ => w,
            }
        })
        .filter(|w| !STOPWORDS.contains(&w.as_str()))
        .collect()
}

/// Jaccard similarity of word sets.
#[cfg(feature = "large")]
fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count() as f32;
    inter / (a.len() + b.len()) as f32 * 2.0 // Dice coefficient (kinder to short titles)
}

/// Picks up to `k` past examples with any word overlap, most similar **last**
/// (closest to the query in the prompt). Ties favour later (more recent) entries.
#[cfg(feature = "large")]
pub(crate) fn select_examples(task: &TaskInput, examples: &[Example], k: usize) -> Vec<Example> {
    let q = words(&format!("{} {}", task.title, task.steps.join(" ")));
    let mut scored: Vec<(f32, usize)> = examples
        .iter()
        .enumerate()
        .filter(|(_, e)| !e.title.trim().is_empty() && e.effort.is_finite())
        .map(|(i, e)| (jaccard(&q, &words(&e.title)), i))
        .filter(|(s, _)| *s > 0.0)
        .collect();
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(b.1.cmp(&a.1)));
    scored.truncate(k);
    scored.reverse();
    scored.into_iter().map(|(_, i)| examples[i].clone()).collect()
}

#[cfg(all(test, feature = "large"))]
mod tests {
    use super::*;

    #[test]
    fn picks_overlapping() {
        let ex = vec![
            Example { title: "Clean the bathroom".into(), effort: 6.0 },
            Example { title: "Call grandma".into(), effort: 2.0 },
            Example { title: "Clean kitchen floor".into(), effort: 5.0 },
        ];
        let t = TaskInput { title: "Deep clean kitchen".into(), ..Default::default() };
        let s = select_examples(&t, &ex, 6);
        assert_eq!(s.len(), 2);
        assert_eq!(s.last().unwrap().title, "Clean kitchen floor");
    }
}
