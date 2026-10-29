//! Reward maths. Seeds are the currency; levels are stages of a growing tree.
//! Seeds never go down except when the user un-ticks something they ticked.

use crate::model::{LevelInfo, Reminder};

/// Portion of a reminder's reward paid out across its steps; the rest is the finish.
const STEP_SHARE: f64 = 0.6;
/// Max number of "did a bit" bumps on a reminder without steps.
pub const MAX_BITS: i64 = 3;

pub fn step_value(r: &Reminder) -> i64 {
    let n = r.steps.len().max(1) as f64;
    ((r.reward as f64 * STEP_SHARE / n).floor() as i64).max(1)
}

pub fn bit_value(r: &Reminder) -> i64 {
    ((r.reward as f64 * 0.12).round() as i64).max(1)
}

/// Seeds still earnable on a reminder given what is already paid.
pub fn finish_value(r: &Reminder, paid: i64) -> i64 {
    (r.reward - paid).max((r.reward as f64 * 0.25).ceil() as i64)
}

/// Seeds needed to go from `level` to `level + 1`.
pub fn level_size(level: i64) -> i64 {
    60 + 25 * (level - 1)
}

const STAGES: [&str; 10] = [
    "Seed", "Sprout", "Seedling", "Sapling", "Young tree", "Leafy tree", "Blossoming tree",
    "Fruit tree", "Old oak", "Grove",
];

pub fn stage_for(level: i64) -> &'static str {
    let idx = ((level - 1) / 3).clamp(0, STAGES.len() as i64 - 1);
    STAGES[idx as usize]
}

pub fn level_info(xp: i64) -> LevelInfo {
    let mut level = 1;
    let mut rest = xp.max(0);
    while rest >= level_size(level) {
        rest -= level_size(level);
        level += 1;
    }
    LevelInfo {
        level,
        xp,
        into_level: rest,
        level_size: level_size(level),
        stage: stage_for(level).to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_progress() {
        assert_eq!(level_info(0).level, 1);
        assert_eq!(level_info(59).level, 1);
        assert_eq!(level_info(60).level, 2);
        assert_eq!(level_info(60 + 85).level, 3);
        assert_eq!(level_info(60 + 85).into_level, 0);
    }
}
