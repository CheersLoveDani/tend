//! Model-free effort estimate.

use crate::TaskInput;
use crate::similarity::words;

/// (stem, weight). Matched against word stems (see `similarity::words`), prefix match.
const KEYWORDS: &[(&str, f32)] = &[
    // big / heavy
    ("tax", 4.0), ("move", 3.5), ("moving", 3.5), ("renovat", 4.0), ("deep", 2.0),
    ("declutter", 3.0), ("project", 3.0), ("report", 2.5), ("essay", 3.0), ("thesis", 4.0),
    ("assignment", 2.5), ("exam", 3.0), ("revis", 2.5), ("study", 2.0), ("application", 2.5),
    ("apply", 2.0), ("paperwork", 2.5), ("form", 1.0), ("organi", 2.0), ("clean", 1.5),
    ("tidy", 1.0), ("laundry", 1.0), ("cook", 1.0), ("build", 2.5), ("fix", 1.5),
    ("repair", 2.0), ("research", 2.0), ("prepare", 1.5), ("plan", 1.0), ("write", 1.5),
    ("presentation", 3.0), ("garden", 1.5), ("garage", 2.5), ("budget", 2.0), ("interview", 2.5),
    ("pack", 1.5), ("shop", 1.0), ("grocer", 1.0), ("workout", 1.5), ("gym", 1.5),
    ("whole", 1.0), ("entire", 1.0), ("all", 0.5),
    // small / quick
    ("reply", -1.5), ("text", -1.5), ("message", -1.5), ("call", -1.0), ("phone", -1.0),
    ("email", -1.0), ("bin", -2.0), ("trash", -2.0), ("rubbish", -2.0), ("feed", -1.5),
    ("water", -1.5), ("pill", -2.5), ("med", -2.0), ("vitamin", -2.5), ("book", -1.0),
    ("pay", -1.0), ("buy", -0.5), ("order", -1.0), ("send", -1.0), ("check", -1.0),
    ("remind", -1.0), ("charge", -2.0), ("brush", -1.5), ("drink", -2.0), ("quick", -1.5),
    ("post", -0.5), ("sign", -0.5), ("renew", -0.5),
];

/// Heuristic effort in 1..=10 from keywords, step count and text length. No model needed.
pub fn heuristic_effort(task: &TaskInput) -> f32 {
    let title_words = words(&task.title);
    let mut kw = 0.0f32;
    for w in &title_words {
        if let Some((_, s)) = KEYWORDS.iter().find(|(k, _)| w.starts_with(k)) {
            kw += s;
        }
    }
    let kw = kw.clamp(-3.0, 5.0);

    let steps = task.steps.iter().filter(|s| !s.trim().is_empty()).count() as f32;
    let step_score = (steps * 0.6).min(3.0);

    let text_words = (task.title.split_whitespace().count()
        + task.notes.split_whitespace().count()) as f32;
    let len_score = ((text_words - 4.0).max(0.0) / 25.0).min(1.5);

    (3.0 + kw + step_score + len_score).clamp(1.0, 10.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(s: &str) -> TaskInput {
        TaskInput { title: s.into(), ..Default::default() }
    }

    #[test]
    fn ordering() {
        assert!(heuristic_effort(&t("take out the bin")) < 2.5);
        assert!(heuristic_effort(&t("do tax return")) > 6.0);
        assert!(heuristic_effort(&t("reply to mum's text")) < heuristic_effort(&t("deep clean kitchen")));
    }
}
