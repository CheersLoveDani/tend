//! Emoji for a mood-check-in reason ("Sleep" -> 😴, "Deadline at work" -> 💼).
//!
//! With the model: embed the reason and take the nearest phrase of a built-in labelled
//! table ([`EMOJI_ANCHORS`]). The table's embeddings are cached in the model dir
//! (`tend-mini-emoji.bin`, keyed by a hash of the table + model key), so a call normally
//! only embeds the reason itself. Below [`MIN_SIM`], or without the model, word overlap
//! with the table and a small synonym list decides; failing that, [`DEFAULT_EMOJI`].

use crate::embed::{dot, embed_texts};
use crate::similarity::words;
use crate::tiny::{ModelSpec, fnv, normalize, read_vec_cache, write_vec_cache};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Shown when nothing matches.
pub const DEFAULT_EMOJI: &str = "💭";

/// Below this cosine similarity the nearest phrase is not trusted (bge-micro gives
/// unrelated short phrases ~0.5-0.65).
pub(crate) const MIN_SIM: f32 = 0.72;

/// A suggested emoji for a reason.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EmojiPick {
    pub emoji: String,
    /// `"llm"` (nearest phrase by embedding), `"keyword"` (word overlap) or `"default"`.
    #[serde(skip_deserializing, default = "default_source")]
    pub source: &'static str,
    /// Cosine similarity for `"llm"`; overlap score (0..1) for `"keyword"`; 0 for default.
    pub similarity: f32,
}

fn default_source() -> &'static str {
    "keyword"
}

/// `(phrase, emoji)`. Editing phrases invalidates the embedding cache automatically.
pub(crate) const EMOJI_ANCHORS: &[(&str, &str)] = &[
    // sleep / energy
    ("sleep", "😴"),
    ("tired", "😴"),
    ("slept badly", "😴"),
    ("bad night's sleep", "😴"),
    ("insomnia, couldn't sleep", "😴"),
    ("exhausted", "😴"),
    ("nap", "😴"),
    ("good night's sleep", "😴"),
    ("woke up too early", "⏰"),
    ("overslept", "⏰"),
    ("low energy", "🪫"),
    ("burnout", "🔥"),
    ("burnt out", "🔥"),
    // work / study
    ("work", "💼"),
    ("my job", "💼"),
    ("deadline at work", "💼"),
    ("meeting", "💼"),
    ("my boss", "💼"),
    ("colleagues", "💼"),
    ("job interview", "💼"),
    ("looking for a job", "💼"),
    ("got a promotion", "🏆"),
    ("emails", "📧"),
    ("school", "📚"),
    ("university", "🎓"),
    ("homework", "📚"),
    ("studying", "📚"),
    ("exam", "📝"),
    ("test results", "📝"),
    ("assignment", "📝"),
    ("graduation", "🎓"),
    ("teacher", "📚"),
    // money
    ("money", "💸"),
    ("bills", "💸"),
    ("debt", "💸"),
    ("rent", "🏠"),
    ("payday", "💰"),
    ("finances", "💸"),
    ("bought something nice", "🛍️"),
    // people
    ("friends", "👯"),
    ("saw a friend", "👯"),
    ("argument with a friend", "👯"),
    ("family", "👨‍👩‍👧"),
    ("my parents", "👨‍👩‍👧"),
    ("mum", "👩"),
    ("dad", "👨"),
    ("siblings", "👨‍👩‍👧"),
    ("partner", "❤️"),
    ("relationship", "❤️"),
    ("date night", "❤️"),
    ("love", "❤️"),
    ("breakup", "💔"),
    ("heartbreak", "💔"),
    ("argument", "😤"),
    ("conflict", "😤"),
    ("kids", "🧒"),
    ("my children", "🧒"),
    ("baby", "👶"),
    ("parenting", "🧒"),
    ("loneliness", "🫂"),
    ("feeling lonely", "🫂"),
    ("missing someone", "🫂"),
    ("hug", "🫂"),
    ("socialising", "🗣️"),
    ("party", "🎉"),
    ("talking to people", "🗣️"),
    ("phone call", "📞"),
    ("grief", "🕯️"),
    ("someone died", "🕯️"),
    ("sex", "🔥"),
    ("intimacy", "💞"),
    // pets
    ("dog", "🐶"),
    ("walked the dog", "🐶"),
    ("cat", "🐱"),
    ("pets", "🐾"),
    // body / movement
    ("exercise", "🏋️"),
    ("gym", "🏋️"),
    ("workout", "🏋️"),
    ("went for a walk", "🚶"),
    ("walking", "🚶"),
    ("running", "🏃"),
    ("went for a run", "🏃"),
    ("swimming", "🏊"),
    ("cycling", "🚴"),
    ("yoga", "🧘"),
    ("sport", "⚽"),
    ("football", "⚽"),
    ("dancing", "💃"),
    ("stretching", "🧘"),
    // outdoors / weather
    ("outdoors", "🌳"),
    ("nature", "🌳"),
    ("fresh air", "🌳"),
    ("park", "🌳"),
    ("beach", "🏖️"),
    ("sunshine", "☀️"),
    ("sunny weather", "☀️"),
    ("rain", "🌧️"),
    ("rainy weather", "🌧️"),
    ("grey weather", "☁️"),
    ("cold weather", "🥶"),
    ("heatwave", "🥵"),
    ("snow", "❄️"),
    ("winter darkness", "🌑"),
    ("gardening", "🌱"),
    ("plants", "🌱"),
    // food / drink
    ("food", "🍽️"),
    ("eating", "🍽️"),
    ("ate well", "🥗"),
    ("skipped meals", "🍽️"),
    ("forgot to eat", "🍽️"),
    ("hungry", "🍽️"),
    ("cooking", "🍳"),
    ("baking", "🧁"),
    ("takeaway", "🍕"),
    ("junk food", "🍔"),
    ("sugar", "🍬"),
    ("chocolate", "🍫"),
    ("coffee", "☕"),
    ("caffeine", "☕"),
    ("tea", "🍵"),
    ("drank enough water", "💧"),
    ("dehydrated", "💧"),
    ("alcohol", "🍷"),
    ("drinking", "🍷"),
    ("hangover", "🥴"),
    ("smoking", "🚬"),
    // health
    ("health", "🩺"),
    ("feeling sick", "🤒"),
    ("ill", "🤒"),
    ("cold or flu", "🤧"),
    ("pain", "🤕"),
    ("chronic pain", "🤕"),
    ("back pain", "🤕"),
    ("injury", "🤕"),
    ("headache", "🤯"),
    ("migraine", "🤯"),
    ("period", "🩸"),
    ("period cramps", "🩸"),
    ("hormones", "🌗"),
    ("pms", "🌗"),
    ("pregnancy", "🤰"),
    ("medication", "💊"),
    ("forgot my meds", "💊"),
    ("side effects", "💊"),
    ("doctor's appointment", "🩺"),
    ("hospital", "🏥"),
    ("dentist", "🦷"),
    ("stomach ache", "🤢"),
    ("nausea", "🤢"),
    // mind
    ("therapy", "🛋️"),
    ("counselling", "🛋️"),
    ("anxiety", "😰"),
    ("anxious", "😰"),
    ("worried", "😰"),
    ("panic attack", "😰"),
    ("stress", "😵‍💫"),
    ("stressed out", "😵‍💫"),
    ("overwhelmed", "😵‍💫"),
    ("too much to do", "😵‍💫"),
    ("overstimulated", "🔊"),
    ("sensory overload", "🔊"),
    ("noise", "🔊"),
    ("adhd", "🧠"),
    ("brain fog", "🌫️"),
    ("couldn't focus", "🌫️"),
    ("productive day", "✅"),
    ("got things done", "✅"),
    ("procrastinating", "🐌"),
    ("bored", "🥱"),
    ("sad", "😢"),
    ("crying", "😢"),
    ("angry", "😠"),
    ("frustrated", "😤"),
    ("calm", "😌"),
    ("relaxing", "😌"),
    ("rest day", "😌"),
    ("self care", "🛁"),
    ("bath", "🛁"),
    ("meditation", "🧘"),
    ("mindfulness", "🧘"),
    ("journaling", "📓"),
    ("gratitude", "🙏"),
    ("faith", "🙏"),
    ("church", "🙏"),
    ("self esteem", "🪞"),
    ("body image", "🪞"),
    ("motivation", "💪"),
    ("proud of myself", "🏆"),
    ("achievement", "🏆"),
    ("small win", "🏆"),
    ("good news", "🥳"),
    ("bad news", "😞"),
    ("routine change", "🔄"),
    ("change of plans", "🔄"),
    ("uncertainty", "❓"),
    ("waiting for news", "⏳"),
    // leisure
    ("music", "🎵"),
    ("concert", "🎤"),
    ("singing", "🎤"),
    ("playing an instrument", "🎸"),
    ("gaming", "🎮"),
    ("video games", "🎮"),
    ("board games", "🎲"),
    ("reading", "📖"),
    ("a good book", "📖"),
    ("tv", "📺"),
    ("watched a film", "🎬"),
    ("movie", "🎬"),
    ("podcast", "🎧"),
    ("art", "🎨"),
    ("drawing", "🎨"),
    ("painting", "🎨"),
    ("creativity", "🎨"),
    ("writing", "✍️"),
    ("crafts", "🧶"),
    ("knitting", "🧶"),
    ("photography", "📷"),
    ("hobby", "🧩"),
    ("puzzle", "🧩"),
    ("coding", "💻"),
    ("computer", "💻"),
    // home / errands
    ("cleaning", "🧹"),
    ("tidying up", "🧹"),
    ("chores", "🧹"),
    ("laundry", "🧺"),
    ("washing up", "🧽"),
    ("messy house", "🧹"),
    ("home", "🏠"),
    ("moving house", "📦"),
    ("diy", "🔨"),
    ("shopping", "🛍️"),
    ("groceries", "🛒"),
    ("errands", "📋"),
    ("admin", "📋"),
    ("paperwork", "📋"),
    ("to-do list", "📋"),
    ("appointment", "📅"),
    ("busy day", "📅"),
    ("plans", "📅"),
    // travel / time
    ("travel", "✈️"),
    ("holiday", "🏝️"),
    ("vacation", "🏝️"),
    ("trip away", "🧳"),
    ("day out", "🎡"),
    ("commute", "🚌"),
    ("traffic", "🚗"),
    ("driving", "🚗"),
    ("train", "🚆"),
    ("public transport", "🚌"),
    ("weekend", "🎉"),
    ("day off", "🎉"),
    ("monday", "📅"),
    ("birthday", "🎂"),
    ("christmas", "🎄"),
    ("celebration", "🎉"),
    ("wedding", "💍"),
    ("anniversary", "💞"),
    // screens / world
    ("news", "📰"),
    ("politics", "📰"),
    ("phone", "📱"),
    ("social media", "📱"),
    ("doomscrolling", "📱"),
    ("screen time", "📱"),
    ("internet", "🌐"),
    ("volunteering", "🤝"),
    ("helping someone", "🤝"),
    ("community", "🤝"),
];

/// Extra single words -> emoji for the keyword fallback (stemmed like [`words`]).
const SYNONYMS: &[(&str, &str)] = &[
    ("sleepy", "😴"),
    ("slept", "😴"),
    ("bed", "😴"),
    ("rest", "😌"),
    ("nightmare", "😴"),
    ("fatigue", "😴"),
    ("office", "💼"),
    ("career", "💼"),
    ("shift", "💼"),
    ("manager", "💼"),
    ("client", "💼"),
    ("project", "💼"),
    ("deadline", "💼"),
    ("college", "🎓"),
    ("uni", "🎓"),
    ("class", "📚"),
    ("lesson", "📚"),
    ("revision", "📚"),
    ("essay", "📝"),
    ("cash", "💸"),
    ("salary", "💰"),
    ("bank", "💸"),
    ("budget", "💸"),
    ("bf", "❤️"),
    ("gf", "❤️"),
    ("boyfriend", "❤️"),
    ("girlfriend", "❤️"),
    ("husband", "❤️"),
    ("wife", "❤️"),
    ("crush", "❤️"),
    ("mom", "👩"),
    ("mother", "👩"),
    ("father", "👨"),
    ("brother", "👨‍👩‍👧"),
    ("sister", "👨‍👩‍👧"),
    ("grandma", "👨‍👩‍👧"),
    ("grandad", "👨‍👩‍👧"),
    ("son", "🧒"),
    ("daughter", "🧒"),
    ("toddler", "🧒"),
    ("puppy", "🐶"),
    ("kitten", "🐱"),
    ("pet", "🐾"),
    ("hike", "🥾"),
    ("hiking", "🥾"),
    ("jog", "🏃"),
    ("bike", "🚴"),
    ("swim", "🏊"),
    ("sun", "☀️"),
    ("hot", "🥵"),
    ("storm", "⛈️"),
    ("weather", "🌦️"),
    ("dinner", "🍽️"),
    ("lunch", "🍽️"),
    ("breakfast", "🍽️"),
    ("meal", "🍽️"),
    ("snack", "🍪"),
    ("pizza", "🍕"),
    ("wine", "🍷"),
    ("beer", "🍺"),
    ("drunk", "🥴"),
    ("sick", "🤒"),
    ("flu", "🤧"),
    ("covid", "🤒"),
    ("fever", "🤒"),
    ("ache", "🤕"),
    ("hurt", "🤕"),
    ("cramp", "🩸"),
    ("menstrual", "🩸"),
    ("meds", "💊"),
    ("pill", "💊"),
    ("tablet", "💊"),
    ("doctor", "🩺"),
    ("gp", "🩺"),
    ("therapist", "🛋️"),
    ("panic", "😰"),
    ("nervous", "😰"),
    ("scared", "😰"),
    ("fear", "😰"),
    ("pressure", "😵‍💫"),
    ("busy", "😵‍💫"),
    ("loud", "🔊"),
    ("lonely", "🫂"),
    ("alone", "🫂"),
    ("isolated", "🫂"),
    ("chat", "🗣️"),
    ("social", "🗣️"),
    ("song", "🎵"),
    ("spotify", "🎵"),
    ("guitar", "🎸"),
    ("piano", "🎹"),
    ("game", "🎮"),
    ("book", "📖"),
    ("novel", "📖"),
    ("film", "🎬"),
    ("netflix", "📺"),
    ("show", "📺"),
    ("series", "📺"),
    ("sketch", "🎨"),
    ("clean", "🧹"),
    ("tidy", "🧹"),
    ("hoover", "🧹"),
    ("vacuum", "🧹"),
    ("dishes", "🧽"),
    ("house", "🏠"),
    ("flat", "🏠"),
    ("apartment", "🏠"),
    ("landlord", "🏠"),
    ("shop", "🛍️"),
    ("supermarket", "🛒"),
    ("flight", "✈️"),
    ("airport", "✈️"),
    ("bus", "🚌"),
    ("car", "🚗"),
    ("saturday", "🎉"),
    ("sunday", "🎉"),
    ("friday", "🎉"),
    ("bday", "🎂"),
    ("instagram", "📱"),
    ("tiktok", "📱"),
    ("twitter", "📱"),
    ("scrolling", "📱"),
    ("meditate", "🧘"),
    ("pray", "🙏"),
    ("prayer", "🙏"),
    ("win", "🏆"),
    ("success", "🏆"),
    ("passed", "🏆"),
    ("garden", "🌱"),
    ("overstimulation", "🔊"),
    ("sensory", "🔊"),
    ("autism", "🧠"),
    ("focus", "🌫️"),
    ("hormonal", "🌗"),
    ("cry", "😢"),
    ("mad", "😠"),
    ("annoyed", "😤"),
    ("revise", "📝"),
    ("revising", "📝"),
    ("finals", "📝"),
    ("tax", "💸"),
    ("taxes", "💸"),
    ("ex", "💔"),
    ("hayfever", "🤧"),
    ("allergy", "🤧"),
    ("allergies", "🤧"),
    ("haircut", "💇"),
    ("moon", "🌙"),
    ("neighbour", "🏠"),
    ("neighbor", "🏠"),
];

/// Filler words ignored by the keyword match (on top of [`words`]' stopwords).
const FILLER: &[&str] = &[
    "new", "feel", "feeling", "today", "really", "very", "bit", "so", "not", "too", "much", "got",
    "had", "have", "been", "was", "lot", "just", "all", "again", "still", "little", "kind", "of",
];

fn kw_words(text: &str) -> HashSet<String> {
    let mut w = words(text);
    w.retain(|x| !FILLER.contains(&x.as_str()));
    w
}

/// Emoji for `text` from word overlap with the anchor phrases and synonyms, or
/// [`DEFAULT_EMOJI`].
pub fn emoji_keyword(text: &str) -> String {
    keyword_pick(text).map_or_else(|| DEFAULT_EMOJI.to_string(), |p| p.emoji)
}

/// Best word-overlap match. Scores: an anchor phrase whose content words are all in the
/// query beats a partial one; a synonym hit counts like a one-word phrase.
pub(crate) fn keyword_pick(text: &str) -> Option<EmojiPick> {
    let q = kw_words(text);
    if q.is_empty() {
        return None;
    }
    let mut best: Option<(f32, &str)> = None;
    let mut consider = |score: f32, emoji: &'static str| {
        if score > 0.0 && best.is_none_or(|(s, _)| score > s) {
            best = Some((score, emoji));
        }
    };
    for (phrase, emoji) in EMOJI_ANCHORS {
        let a = kw_words(phrase);
        if a.is_empty() {
            continue;
        }
        let hit: f32 = a.iter().map(|w| q.iter().map(|x| word_match(x, w)).fold(0.0, f32::max)).sum();
        // Dice coefficient, so a short exact phrase beats a long partial one.
        consider(2.0 * hit / (a.len() + q.len()) as f32, emoji);
    }
    for (w, emoji) in SYNONYMS {
        let w = kw_words(w);
        let hit = q.iter().flat_map(|x| w.iter().map(move |s| word_match(x, s))).fold(0.0, f32::max);
        consider(2.0 * hit / (1 + q.len()) as f32 - 0.01, emoji);
    }
    best.map(|(s, e)| EmojiPick { emoji: e.to_string(), source: "keyword", similarity: s.min(1.0) })
}

/// 1 if equal; 0.9 if one is the other plus a short ending ("rain" / "rainy",
/// "exhaust" / "exhausted", but not "pain" / "painting"); else 0.
fn word_match(a: &str, b: &str) -> f32 {
    let (short, long) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    if a == b {
        1.0
    } else if short.len() >= 4 && long.len() - short.len() <= 3 && long.starts_with(short) {
        0.9
    } else {
        0.0
    }
}

const EMOJI_MAGIC: &[u8; 8] = b"TENDEMO1";

fn table_key(model_key: &str) -> u64 {
    let mut s = String::from(model_key);
    for (p, _) in EMOJI_ANCHORS {
        s.push('\n');
        s.push_str(p);
    }
    fnv(s.as_bytes())
}

/// Nearest anchor phrase by embedding: `(similarity, emoji)`. One model load, dropped
/// before returning; the table's embeddings come from / go to the on-disk cache.
pub(crate) fn nearest(spec: &ModelSpec, text: &str) -> anyhow::Result<(f32, &'static str)> {
    let path = spec.cache_dir.join("tend-mini-emoji.bin");
    let key = table_key(spec.key);
    let cached = read_vec_cache(&path, EMOJI_MAGIC, key, EMOJI_ANCHORS.len());
    let mut texts: Vec<String> = Vec::new();
    if cached.is_none() {
        texts.extend(EMOJI_ANCHORS.iter().map(|a| a.0.to_string()));
    }
    texts.push(normalize(text));
    let mut vecs = embed_texts(&spec.weights, &spec.vocab, spec.layers, &texts)?;
    let query = vecs.pop().unwrap_or_default();
    let table = match cached {
        Some(t) => t,
        None => {
            write_vec_cache(&path, EMOJI_MAGIC, key, &vecs);
            vecs
        }
    };
    let mut best = (f32::MIN, DEFAULT_EMOJI);
    for (v, (_, emoji)) in table.iter().zip(EMOJI_ANCHORS) {
        let s = dot(&query, v);
        if s > best.0 {
            best = (s, emoji);
        }
    }
    Ok(best)
}

/// Unique emoji used by the table (for tests / UI pickers).
#[allow(dead_code)]
pub(crate) fn table_emoji() -> Vec<&'static str> {
    let mut seen = HashSet::new();
    EMOJI_ANCHORS.iter().map(|a| a.1).chain(SYNONYMS.iter().map(|s| s.1)).filter(|e| seen.insert(*e)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyword_basics() {
        assert_eq!(emoji_keyword("Sleep"), "😴");
        assert_eq!(emoji_keyword("slept badly"), "😴");
        assert_eq!(emoji_keyword("Work"), "💼");
        assert_eq!(emoji_keyword("deadline"), "💼");
        assert_eq!(emoji_keyword("Exams"), "📝");
        assert_eq!(emoji_keyword("my dog"), "🐶");
        assert_eq!(emoji_keyword("the cats"), "🐱");
        assert_eq!(emoji_keyword("Gym"), "🏋️");
        assert_eq!(emoji_keyword("rainy"), "🌧️");
        assert_eq!(emoji_keyword("Coffee"), "☕");
        assert_eq!(emoji_keyword("headaches"), "🤯");
        assert_eq!(emoji_keyword("boyfriend"), "❤️");
        assert_eq!(emoji_keyword("social media"), "📱");
        assert_eq!(emoji_keyword("Therapy session"), "🛋️");
        assert_eq!(emoji_keyword("my birthday"), "🎂");
        assert_eq!(emoji_keyword("painting"), "🎨");
        assert_eq!(emoji_keyword("new haircut"), "💇");
        assert_eq!(emoji_keyword("feeling lonely"), "🫂");
        assert_eq!(emoji_keyword("exhausted"), "😴");
    }

    #[test]
    fn keyword_default_and_empty() {
        assert_eq!(emoji_keyword(""), DEFAULT_EMOJI);
        assert_eq!(emoji_keyword("   "), DEFAULT_EMOJI);
        assert_eq!(emoji_keyword("zxqv"), DEFAULT_EMOJI);
        assert!(keyword_pick("zxqv").is_none());
    }

    #[test]
    fn table_is_sane() {
        assert!((120..=320).contains(&EMOJI_ANCHORS.len()), "{}", EMOJI_ANCHORS.len());
        let mut seen = HashSet::new();
        for (p, e) in EMOJI_ANCHORS {
            assert!(!e.is_empty() && !p.trim().is_empty());
            assert!(seen.insert(normalize(p)), "duplicate phrase {p}");
        }
        assert!(table_emoji().len() > 60);
    }

    #[test]
    fn missing_model_falls_back() {
        let dir = std::env::temp_dir().join("tend-llm-test-no-model");
        let p = crate::suggest_emoji(&dir, "Work stress").unwrap();
        assert_eq!(p.source, "keyword");
        assert!(!p.emoji.is_empty());
        let p = crate::suggest_emoji(&dir, "qqq").unwrap();
        assert_eq!(p.source, "default");
        assert_eq!(p.emoji, DEFAULT_EMOJI);
    }

    /// TEND_MODEL_DIR=<dir with the mini model> cargo test --release -- --ignored --nocapture
    #[test]
    #[ignore]
    fn model_picks_emoji() {
        let dir = std::path::PathBuf::from(std::env::var("TEND_MODEL_DIR").unwrap());
        if !crate::model_present(&dir) {
            crate::download_model(&dir, &mut |_, _| {}).unwrap();
        }
        for (text, want) in [
            ("couldn't sleep last night", "😴"),
            ("my manager", "💼"),
            ("revising for finals", "📝"),
            ("walk in the woods", "🌳"),
            ("my girlfriend", "❤️"),
            ("too much caffeine", "☕"),
            ("cramps", "🩸"),
            ("played video games", "🎮"),
        ] {
            let t = std::time::Instant::now();
            let p = crate::suggest_emoji(&dir, text).unwrap();
            println!("{text:>28} -> {} {:>8} {:.3} ({:?})", p.emoji, p.source, p.similarity, t.elapsed());
            let _ = want;
        }
        for text in ["xylophone repair", "the", "asdf", "revising for finals", "taxes", "my ex", "dentist tomorrow", "grandma", "new haircut", "lost my keys", "car broke down", "hayfever", "full moon", "noisy neighbours", "pms", "nothing", "football match", "cuddles with my cat"] {
            let (sim, e) = nearest(&crate::mini_spec(&dir), text).unwrap();
            let p = crate::suggest_emoji(&dir, text).unwrap();
            println!("{text:>28} -> {} {:>8} {:.3}   (nearest {e} {sim:.3})", p.emoji, p.source, p.similarity);
        }
    }
}
