//! Reward suggestions: the tiny on-device model (or a heuristic) scores effort 1–10,
//! personalised by the user's past rewards and how they nudged earlier suggestions.

use anyhow::Result;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

use crate::db::Db;

/// Seeds per effort point.
const SEEDS_PER_EFFORT: f32 = 5.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub reward: i64,
    pub effort: f32,
    pub source: String,
    pub millis: u64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub present: bool,
    pub size: u64,
}

pub fn status(dir: &Path) -> ModelStatus {
    ModelStatus { present: tend_llm::model_present(dir), size: tend_llm::model_size_hint() }
}

pub fn download(dir: &Path, mut progress: impl FnMut(u64, u64)) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    tend_llm::download_model(dir, &mut progress)
}

fn words(s: &str) -> Vec<String> {
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 2)
        .map(String::from)
        .collect()
}

/// Only one model run at a time: a second request while one is running is dropped,
/// so fast typing can never stack up CPU work.
static RUNNING: Mutex<()> = Mutex::new(());

pub fn suggest(
    db: &Mutex<Db>,
    dir: &Path,
    title: String,
    notes: String,
    steps: Vec<String>,
    use_model: bool,
) -> Result<Suggestion> {
    let _guard = RUNNING.try_lock().map_err(|_| anyhow::anyhow!("busy"))?;
    let history = db.lock().unwrap().reward_history(300)?;
    let lower = title.trim().to_lowercase();
    let examples: Vec<tend_llm::Example> = history
        .iter()
        .filter(|r| r.title.trim().to_lowercase() != lower || r.suggested.is_some())
        .map(|r| tend_llm::Example { title: r.title.clone(), effort: r.reward as f32 / SEEDS_PER_EFFORT })
        .collect();
    // Average nudge (in effort points) over recent suggestions the user adjusted or accepted.
    let nudges: Vec<f32> = history
        .iter()
        .filter_map(|r| r.suggested.map(|s| (r.reward - s) as f32 / SEEDS_PER_EFFORT))
        .take(30)
        .collect();
    let bias = if nudges.is_empty() { 0.0 } else { nudges.iter().sum::<f32>() / nudges.len() as f32 };

    // Exact repeats: trust what the user settled on last time.
    if let Some(same) = history.iter().find(|r| r.title.trim().to_lowercase() == lower) {
        return Ok(Suggestion {
            reward: same.reward,
            effort: same.reward as f32 / SEEDS_PER_EFFORT,
            source: "memory".into(),
            millis: 0,
            reason: "Same as last time you did this".into(),
        });
    }

    let task = tend_llm::TaskInput { title: title.clone(), notes, steps };
    let s = if use_model {
        tend_llm::suggest(dir, &task, &examples, bias)?
    } else {
        tend_llm::Suggestion {
            effort: (tend_llm::heuristic_effort(&task) + bias).clamp(1.0, 10.0),
            argmax: 0,
            confidence: 0.0,
            source: "heuristic",
            millis: 0,
        }
    };
    let reward = ((s.effort * SEEDS_PER_EFFORT).round() as i64).clamp(5, 50);

    let mine = words(&title);
    let closest = history
        .iter()
        .map(|r| (words(&r.title).iter().filter(|w| mine.contains(w)).count(), r))
        .filter(|(n, _)| *n > 0)
        .max_by_key(|(n, _)| *n)
        .map(|(_, r)| r);
    let reason = match closest {
        Some(r) => format!("Close to \"{}\" ({} seeds)", r.title, r.reward),
        None if s.effort <= 3.0 => "Looks quick — a small win".into(),
        None if s.effort >= 7.0 => "Looks like a big one — worth a lot".into(),
        None => "A medium-sized task".into(),
    };
    Ok(Suggestion { reward, effort: s.effort, source: s.source.to_string(), millis: s.millis, reason })
}

/// Step breakdowns from the user's own past reminders (preferred) and the built-in library.
pub fn steps(db: &Mutex<Db>, dir: &Path, title: String) -> Result<Vec<tend_llm::StepIdea>> {
    let _guard = RUNNING.try_lock().map_err(|_| anyhow::anyhow!("busy"))?;
    let history: Vec<tend_llm::PastTask> = db
        .lock()
        .unwrap()
        .reward_history(300)?
        .into_iter()
        .filter(|r| !r.steps.is_empty())
        .map(|r| tend_llm::PastTask { title: r.title, steps: r.steps.into_iter().map(|s| s.title).collect() })
        .collect();
    tend_llm::suggest_steps(dir, &title, &history, 3)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{actions, model::ReminderInput};

    /// Downloads the tiny model into TEND_MODEL_DIR if needed: cargo test --release -- --ignored
    #[test]
    #[ignore]
    fn model_suggests_and_learns_from_nudges() {
        let dir = std::path::PathBuf::from(std::env::var("TEND_MODEL_DIR").unwrap());
        if !tend_llm::model_present(&dir) {
            download(&dir, |_, _| {}).unwrap();
        }
        let db = Mutex::new(Db::open(Path::new(":memory:")).unwrap());
        let ask = |t: &str| suggest(&db, &dir, t.into(), String::new(), vec![], true).unwrap();
        let small = ask("take out the bin");
        let big = ask("do my tax return");
        println!("{small:?}\n{big:?}");
        assert_eq!(small.source, "llm");
        assert!(big.reward > small.reward);

        // The user keeps nudging suggestions up by 10 seeds; later suggestions should rise.
        for (t, s) in [("wash the car", 15), ("call the bank", 10), ("sort the post", 10)] {
            let i = ReminderInput {
                id: None,
                title: t.into(),
                notes: String::new(),
                date: actions::today(),
                time: None,
                steps: vec![],
                reward: s + 10,
                suggested: Some(s),
                repeat: None,
            };
            actions::upsert(&db.lock().unwrap(), i).unwrap();
        }
        let nudged = ask("take out the bin");
        println!("after nudges: {nudged:?}");
        assert!(nudged.reward > small.reward);

        let t = std::time::Instant::now();
        let ideas = steps(&db, &dir, "clean the bathroom".into()).unwrap();
        println!("step ideas in {:?}: {ideas:?}", t.elapsed());
        assert!(!ideas.is_empty());
    }
}
