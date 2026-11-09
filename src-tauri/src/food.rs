//! Food log: what was eaten, with an optional calorie number. Stored as synced `items`.
//!
//! - `food` items are the log itself, keyed by local day.
//! - `foodlib` items are foods eaten before (keyed by barcode, or by name), so they can be logged
//!   again in one tap and keep what's known about them (calories per 100 g / per portion).
//!
//! Calories can come from Open Food Facts (a free, open database: barcode lookups and name
//! search), from a photo of the nutrition label (the phone reads the text; `parse_label` finds the
//! numbers), from a rough built-in estimate (frontend), or typed by hand. Every number is shown
//! to the person to check before it's saved.

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::db::{Db, now_ms};
use crate::meds::{entry_day, event, ledger, parse, put};
use crate::model::RewardEvent;

const FOOD: &str = "food";
const LIB: &str = "foodlib";
/// Seeds for noting a meal or snack: eating is looking after yourself.
pub const FOOD_REWARD: i64 = 2;
/// A sanity cap: pure fat is ~900 kcal per 100 g, so anything above this is a misread.
const MAX_KCAL_100: f64 = 950.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Food {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub emoji: String,
    /// `breakfast` | `lunch` | `dinner` | `snack` | "" (not said)
    #[serde(default)]
    pub meal: String,
    /// Calories for what was eaten; `None` when there's no number (that's fine).
    #[serde(default)]
    pub kcal: Option<f64>,
    /// How much, in words: "1 bowl", "150 g", "half a pack".
    #[serde(default)]
    pub amount: String,
    #[serde(default)]
    pub grams: Option<f64>,
    /// Where the number came from: `barcode` | `label` | `search` | `estimate` | `manual` | "".
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub barcode: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub at: i64,
    /// Counts toward the fruit & veg goal; `None` = guessed from the name on the device.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fruit_veg: Option<bool>,
}

/// What's known about a food product (Open Food Facts, a label, or a past log).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FoodInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub brand: String,
    #[serde(default)]
    pub barcode: String,
    #[serde(default)]
    pub kcal100: Option<f64>,
    #[serde(default)]
    pub kcal_serving: Option<f64>,
    /// Grams (or ml) in one portion, as the package states it.
    #[serde(default)]
    pub serving_g: Option<f64>,
    #[serde(default)]
    pub serving_text: String,
    /// Grams (or ml) in the whole pack.
    #[serde(default)]
    pub pack_g: Option<f64>,
    /// "ml" for drinks, else "g".
    #[serde(default)]
    pub unit: String,
}

/// A food eaten before, for logging again.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedFood {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub emoji: String,
    #[serde(default)]
    pub info: Option<FoodInfo>,
    #[serde(default)]
    pub last_kcal: Option<f64>,
    #[serde(default)]
    pub last_amount: String,
    #[serde(default)]
    pub last_grams: Option<f64>,
    #[serde(default)]
    pub uses: i64,
    #[serde(default)]
    pub last_used: i64,
}

fn clean_kcal(k: Option<f64>) -> Option<f64> {
    k.filter(|k| k.is_finite() && *k >= 0.0).map(|k| (k * 10.0).round() / 10.0)
}

fn lib_id(food: &Food) -> String {
    if !food.barcode.trim().is_empty() {
        return food.barcode.trim().to_string();
    }
    format!("n:{}", food.name.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join(" "))
}

fn save_food_item(db: &Db, f: &Food, deleted: bool) -> Result<()> {
    put(db, FOOD, &f.id, "", &entry_day(f.at), f, deleted)
}

/// The log since `since_date` (YYYY-MM-DD), newest first.
pub fn foods(db: &Db, since_date: &str) -> Result<Vec<Food>> {
    let mut out: Vec<Food> = db.items(FOOD, None, Some((since_date, "9999")))?.iter().filter_map(parse).collect();
    out.sort_by(|a, b| b.at.cmp(&a.at));
    Ok(out)
}

/// Foods eaten before, most recently used first.
pub fn library(db: &Db, limit: usize) -> Result<Vec<SavedFood>> {
    let mut out: Vec<SavedFood> = db.items(LIB, None, None)?.iter().filter_map(parse).collect();
    out.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    out.truncate(limit);
    Ok(out)
}

pub fn save_food(db: &Db, mut f: Food, info: Option<FoodInfo>) -> Result<RewardEvent> {
    let xp_before = db.total_xp()?;
    f.name = f.name.trim().into();
    if f.name.is_empty() {
        return Err(anyhow!("What did you have? A name is enough."));
    }
    if !["breakfast", "lunch", "dinner", "snack", ""].contains(&f.meal.as_str()) {
        f.meal = String::new();
    }
    f.kcal = clean_kcal(f.kcal);
    f.grams = f.grams.filter(|g| g.is_finite() && *g > 0.0);
    if f.id.is_empty() {
        f.id = uuid::Uuid::new_v4().to_string();
    }
    if f.at == 0 {
        f.at = now_ms();
    }
    // Moving it to another day changes its lookup key: clear the old copy first.
    let old = db.get_item(FOOD, &f.id)?.filter(|it| !it.deleted).and_then(|it| parse::<Food>(&it));
    if let Some(old) = &old {
        if entry_day(old.at) != entry_day(f.at) {
            save_food_item(db, old, true)?;
        }
    }
    save_food_item(db, &f, false)?;
    remember(db, &f, info, old.is_none())?;

    let paid = db.ledger_for(&f.id)?.iter().any(|l| !l.void);
    if paid {
        return event(db, "none", 0, 0, xp_before, &f.id, &f.name);
    }
    db.put_ledger(ledger(&f.id, "log", FOOD_REWARD, false))?;
    event(db, "bit", FOOD_REWARD, 0, xp_before, &f.id, &f.name)
}

/// Keeps the food in the "had before" list, with the freshest numbers.
fn remember(db: &Db, f: &Food, info: Option<FoodInfo>, new_log: bool) -> Result<()> {
    let id = lib_id(f);
    let mut saved = db
        .get_item(LIB, &id)?
        .filter(|it| !it.deleted)
        .and_then(|it| parse::<SavedFood>(&it))
        .unwrap_or_else(|| SavedFood { id: id.clone(), ..Default::default() });
    saved.name = f.name.clone();
    if !f.emoji.is_empty() {
        saved.emoji = f.emoji.clone();
    }
    if let Some(mut info) = info {
        info.kcal100 = clean_kcal(info.kcal100).filter(|k| *k <= MAX_KCAL_100);
        info.kcal_serving = clean_kcal(info.kcal_serving);
        saved.info = Some(info);
    }
    saved.last_kcal = f.kcal;
    saved.last_amount = f.amount.clone();
    saved.last_grams = f.grams;
    if new_log {
        saved.uses += 1;
    }
    saved.last_used = now_ms();
    put(db, LIB, &id, "", "", &saved, false)
}

pub fn delete_food(db: &Db, id: &str) -> Result<()> {
    let it = db.get_item(FOOD, id)?.ok_or_else(|| anyhow!("That's already gone"))?;
    let f: Food = parse(&it).ok_or_else(|| anyhow!("That's already gone"))?;
    save_food_item(db, &f, true)?;
    if db.ledger_for(id)?.iter().any(|l| !l.void) {
        db.put_ledger(ledger(id, "log", 0, true))?;
    }
    Ok(())
}

/// Takes a food off the "had before" list. The log keeps it.
pub fn forget_saved(db: &Db, id: &str) -> Result<()> {
    if let Some(it) = db.get_item(LIB, id)?.filter(|it| !it.deleted) {
        if let Some(s) = parse::<SavedFood>(&it) {
            put(db, LIB, id, "", "", &s, true)?;
        }
    }
    Ok(())
}

// ---- Open Food Facts -----------------------------------------------------------------------

const USER_AGENT: &str = concat!("Tend/", env!("CARGO_PKG_VERSION"), " (https://github.com/CheersLoveDani/tend)");
const FIELDS: &str = "code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,product_quantity,quantity";

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .http_status_as_error(false)
        .user_agent(USER_AGENT)
        .build()
        .into()
}

fn num(v: &serde_json::Value) -> Option<f64> {
    match v {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => s.trim().replace(',', ".").parse().ok(),
        _ => None,
    }
    .filter(|n: &f64| n.is_finite() && *n > 0.0)
}

fn text(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.trim().to_string(),
        serde_json::Value::Array(a) => a.iter().filter_map(|x| x.as_str()).next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    }
}

/// Reads one Open Food Facts product. `None` when it has no name to show.
pub fn info_from_off(p: &serde_json::Value) -> Option<FoodInfo> {
    let name = ["product_name", "product_name_en", "generic_name"].iter().map(|k| text(&p[k])).find(|s| !s.is_empty())?;
    let brand = text(&p["brands"]).split(',').next().unwrap_or("").trim().to_string();
    let n = &p["nutriments"];
    let kj_to_kcal = |kj: f64| kj / 4.184;
    let kcal100 = num(&n["energy-kcal_100g"])
        .or_else(|| num(&n["energy-kj_100g"]).map(kj_to_kcal))
        .or_else(|| num(&n["energy_100g"]).map(kj_to_kcal))
        .filter(|k| *k <= MAX_KCAL_100);
    let serving_g = num(&p["serving_quantity"]);
    let kcal_serving = num(&n["energy-kcal_serving"])
        .or_else(|| num(&n["energy-kj_serving"]).map(kj_to_kcal))
        .or_else(|| Some(kcal100? * serving_g? / 100.0));
    let quantity = text(&p["quantity"]).to_lowercase();
    let unit = if quantity.contains("ml") || quantity.contains("cl") || quantity.ends_with('l') { "ml" } else { "g" };
    Some(FoodInfo {
        name,
        brand,
        barcode: text(&p["code"]),
        kcal100: clean_kcal(kcal100),
        kcal_serving: clean_kcal(kcal_serving),
        serving_g,
        serving_text: text(&p["serving_size"]),
        pack_g: num(&p["product_quantity"]),
        unit: unit.into(),
    })
}

fn get_json(url: &str) -> Result<serde_json::Value> {
    let mut res = agent().get(url).call().map_err(|_| anyhow!("Couldn't reach Open Food Facts. Check the internet connection."))?;
    if res.status().as_u16() == 404 {
        return Ok(serde_json::Value::Null);
    }
    if !res.status().is_success() {
        return Err(anyhow!("Open Food Facts is busy right now. Try again in a moment."));
    }
    res.body_mut().read_json().map_err(|_| anyhow!("Open Food Facts sent something Tend couldn't read."))
}

/// Looks up a barcode (EAN / UPC digits). `None` when the product isn't known.
pub fn lookup_barcode(code: &str) -> Result<Option<FoodInfo>> {
    let code: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if code.len() < 6 || code.len() > 14 {
        return Err(anyhow!("That doesn't look like a barcode number."));
    }
    let v = get_json(&format!("https://world.openfoodfacts.org/api/v2/product/{code}.json?fields={FIELDS}"))?;
    if v["status"].as_i64() == Some(0) || v.is_null() {
        return Ok(None);
    }
    Ok(info_from_off(&v["product"]).map(|mut i| {
        if i.barcode.is_empty() {
            i.barcode = code;
        }
        i
    }))
}

/// Products whose name matches, with calories known.
pub fn search(q: &str) -> Result<Vec<FoodInfo>> {
    let q = q.trim();
    if q.chars().count() < 2 {
        return Ok(vec![]);
    }
    let enc: String = q
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            b' ' => "+".into(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    let v = get_json(&format!("https://search.openfoodfacts.org/search?q={enc}&page_size=20&fields={FIELDS}"))?;
    let mut out: Vec<FoodInfo> = v["hits"].as_array().into_iter().flatten().filter_map(info_from_off).filter(|i| i.kcal100.is_some()).collect();
    out.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name) && a.brand.eq_ignore_ascii_case(&b.brand));
    out.truncate(12);
    Ok(out)
}

// ---- nutrition labels ----------------------------------------------------------------------

/// What a photo of a nutrition label seems to say. Every field is a guess to be checked.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LabelGuess {
    pub kcal100: Option<f64>,
    pub kcal_serving: Option<f64>,
    pub serving_g: Option<f64>,
    pub serving_text: String,
    pub unit: String,
    /// Any calorie numbers seen, in reading order (for "pick the right one").
    pub seen: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Num(f64),
    Word(String),
    Pct,
}

fn tokens(line: &str) -> Vec<Tok> {
    let mut out = vec![];
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_digit() {
            let mut s = String::new();
            while i < chars.len() && (chars[i].is_ascii_digit() || ((chars[i] == '.' || chars[i] == ',') && chars.get(i + 1).is_some_and(|n| n.is_ascii_digit()))) {
                // "1,046" is a thousands comma when three digits follow; "2,5" is a decimal.
                if chars[i] == ',' {
                    let rest: String = chars[i + 1..].iter().take_while(|c| c.is_ascii_digit()).collect();
                    if rest.len() == 3 {
                        i += 1;
                        continue;
                    }
                    s.push('.');
                } else {
                    s.push(chars[i]);
                }
                i += 1;
            }
            if let Ok(n) = s.parse() {
                out.push(Tok::Num(n));
            }
        } else if c.is_alphabetic() {
            let mut s = String::new();
            while i < chars.len() && chars[i].is_alphabetic() {
                s.extend(chars[i].to_lowercase());
                i += 1;
            }
            out.push(Tok::Word(s));
        } else {
            if c == '%' {
                out.push(Tok::Pct);
            }
            i += 1;
        }
    }
    out
}

fn is_kcal(w: &str) -> bool {
    // OCR often turns the l into an i or 1.
    matches!(w, "kcal" | "kcai" | "kca" | "kcals" | "cal" | "calories" | "calorie" | "kilocalories" | "calorías" | "calorias")
}
fn is_kj(w: &str) -> bool {
    matches!(w, "kj" | "kilojoules")
}
fn is_mass(w: &str) -> bool {
    matches!(w, "g" | "ml" | "gr" | "grams")
}

/// Finds calories per 100 g and per portion in text read off a nutrition label.
pub fn parse_label(text: &str) -> LabelGuess {
    let mut g = LabelGuess { unit: "g".into(), ..Default::default() };
    let low = text.to_lowercase();
    if low.contains("100ml") || low.contains("100 ml") {
        g.unit = "ml".into();
    }
    let has_100 = low.contains("100g") || low.contains("100 g") || low.contains("100ml") || low.contains("100 ml");

    let mut kcal: Vec<f64> = vec![];
    let mut kj: Vec<f64> = vec![];
    for line in low.lines() {
        let t = tokens(line);
        let mut line_kcal = vec![];
        let mut line_kj = vec![];
        // "250 kcal" / "1046 kJ": a number with its unit straight after.
        for (i, tok) in t.iter().enumerate() {
            if let (Tok::Num(n), Some(Tok::Word(w))) = (tok, t.get(i + 1)) {
                if is_kcal(w) && w != "calories" {
                    line_kcal.push(*n);
                } else if is_kj(w) {
                    line_kj.push(*n);
                }
            }
        }
        // "Calories 230" / "Energy (kcal) 250 125": the unit first, then bare numbers.
        if line_kcal.is_empty() {
            if let Some(at) = t.iter().position(|x| matches!(x, Tok::Word(w) if is_kcal(w))) {
                let mut j = at + 1;
                while j < t.len() {
                    match (&t[j], t.get(j + 1)) {
                        (Tok::Num(_), Some(Tok::Pct)) => j += 2,
                        (Tok::Num(_), Some(Tok::Word(w))) if is_mass(w) || is_kj(w) => j += 2,
                        (Tok::Num(n), _) => {
                            line_kcal.push(*n);
                            j += 1;
                        }
                        (Tok::Word(w), _) if is_kj(w) => break,
                        _ => j += 1,
                    }
                }
            }
        }
        if line_kj.is_empty() && line_kcal.is_empty() {
            if let Some(at) = t.iter().position(|x| matches!(x, Tok::Word(w) if is_kj(w))) {
                for x in &t[at + 1..] {
                    match x {
                        Tok::Num(n) => line_kj.push(*n),
                        Tok::Word(w) if is_kcal(w) => break,
                        _ => {}
                    }
                }
            }
        }
        kcal.extend(line_kcal.into_iter().filter(|n| *n > 0.0 && *n < 5000.0));
        kj.extend(line_kj.into_iter().filter(|n| *n > 0.0 && *n < 20000.0));

        // The portion: "Serving size 2/3 cup (55g)", "per 30g serving", "Portion (40 g)", "1 bar (45 g)".
        if g.serving_g.is_none() && ["serving", "portion", "per", "bar", "pot", "slice", "biscuit", "pack", "can", "bottle", "piece"].iter().any(|k| line.contains(k)) {
            for (i, tok) in t.iter().enumerate() {
                if let (Tok::Num(n), Some(Tok::Word(w))) = (tok, t.get(i + 1)) {
                    if is_mass(w) && (*n - 100.0).abs() > f64::EPSILON && *n > 0.0 && *n < 2000.0 {
                        g.serving_g = Some(*n);
                        if w == "ml" {
                            g.unit = "ml".into();
                        }
                        g.serving_text = line.trim().chars().take(60).collect();
                        break;
                    }
                }
            }
        }
    }

    let mut values = if kcal.is_empty() { kj.iter().map(|k| (k / 4.184).round()).collect() } else { kcal };
    values.dedup();
    g.seen = values.clone();
    if has_100 {
        g.kcal100 = values.first().copied().filter(|k| *k <= MAX_KCAL_100);
        g.kcal_serving = values.get(1).copied();
        // Only one number but we know the portion: work the portion out.
        if g.kcal_serving.is_none() {
            g.kcal_serving = g.kcal100.zip(g.serving_g).map(|(k, s)| (k * s / 100.0).round());
        }
    } else {
        g.kcal_serving = values.first().copied();
    }
    g.kcal100 = clean_kcal(g.kcal100);
    g.kcal_serving = clean_kcal(g.kcal_serving);
    g
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        Db::open(std::path::Path::new(":memory:")).unwrap()
    }

    fn food(name: &str) -> Food {
        Food { id: String::new(), name: name.into(), emoji: "🍎".into(), meal: "snack".into(), kcal: Some(95.0), amount: "1".into(), grams: None, source: "estimate".into(), barcode: String::new(), note: String::new(), at: 0, fruit_veg: None }
    }

    #[test]
    fn log_pays_once_and_remembers() {
        let db = db();
        let e = save_food(&db, food("Apple"), None).unwrap();
        assert_eq!(e.gained, FOOD_REWARD);
        let saved = foods(&db, "").unwrap();
        assert_eq!(saved.len(), 1);
        let again = save_food(&db, Food { kcal: Some(80.0), ..saved[0].clone() }, None).unwrap();
        assert_eq!(again.gained, 0, "editing doesn't pay twice");
        let lib = library(&db, 10).unwrap();
        assert_eq!(lib.len(), 1);
        assert_eq!(lib[0].last_kcal, Some(80.0));
        assert_eq!(lib[0].uses, 1);
        save_food(&db, food("apple "), None).unwrap();
        assert_eq!(library(&db, 10).unwrap()[0].uses, 2, "same name, same saved food");
        delete_food(&db, &saved[0].id).unwrap();
        assert_eq!(foods(&db, "").unwrap().len(), 1);
        assert_eq!(db.total_xp().unwrap(), FOOD_REWARD);
    }

    #[test]
    fn name_is_needed_and_kcal_cleaned() {
        let db = db();
        assert!(save_food(&db, food("  "), None).is_err());
        save_food(&db, Food { kcal: Some(-3.0), ..food("Toast") }, None).unwrap();
        assert_eq!(foods(&db, "").unwrap()[0].kcal, None);
    }

    #[test]
    fn reads_off_products() {
        let p = serde_json::json!({
            "code": "5000159484695", "product_name": "Twix", "brands": "Twix, Mars",
            "serving_quantity": "43", "quantity": "50 g",
            "nutriments": { "energy-kcal_100g": 280.74, "energy-kcal_serving": 121 }
        });
        let i = info_from_off(&p).unwrap();
        assert_eq!(i.brand, "Twix");
        assert_eq!(i.kcal100, Some(280.7));
        assert_eq!(i.kcal_serving, Some(121.0));
        assert_eq!(i.serving_g, Some(43.0));
        assert_eq!(i.unit, "g");
        // Only kJ, and a drink.
        let p = serde_json::json!({ "product_name": "Cola", "quantity": "330 ml", "nutriments": { "energy_100g": 180 } });
        let i = info_from_off(&p).unwrap();
        assert_eq!(i.kcal100, Some(43.0));
        assert_eq!(i.unit, "ml");
        assert!(info_from_off(&serde_json::json!({ "nutriments": {} })).is_none());
    }

    #[test]
    fn eu_label_two_columns() {
        let g = parse_label("NUTRITION\nTypical values Per 100g Per 30g portion\nEnergy 1046kJ/250kcal 314kJ/75kcal\nFat 3.1g 0.9g");
        assert_eq!(g.kcal100, Some(250.0));
        assert_eq!(g.kcal_serving, Some(75.0));
        assert_eq!(g.serving_g, Some(30.0));
    }

    #[test]
    fn uk_label_unit_first() {
        let g = parse_label("Each bar (45g) contains\nper 100g\nEnergy kJ 2156 970\nkcal 515 232\nFat 28g");
        assert_eq!(g.kcal100, Some(515.0));
        assert_eq!(g.kcal_serving, Some(232.0));
        assert_eq!(g.serving_g, Some(45.0));
    }

    #[test]
    fn us_label() {
        let g = parse_label("Nutrition Facts\n8 servings per container\nServing size 2/3 cup (55g)\nAmount per serving\nCalories 230\nTotal Fat 8g 10%");
        assert_eq!(g.kcal100, None);
        assert_eq!(g.kcal_serving, Some(230.0));
        assert_eq!(g.serving_g, Some(55.0));
    }

    #[test]
    fn kj_only_and_ocr_slips() {
        let g = parse_label("Average per 100 ml\nEnergy 180 kJ");
        assert_eq!(g.kcal100, Some(43.0));
        assert_eq!(g.unit, "ml");
        let g = parse_label("per 100g\nEnergy 1,046 kJ / 250 kcai");
        assert_eq!(g.kcal100, Some(250.0));
        let g = parse_label("per 100 g: energie 1046 kJ, 250,5 kcal");
        assert_eq!(g.kcal100, Some(250.5));
    }

    #[test]
    fn one_number_and_a_portion() {
        let g = parse_label("Per 100g: 400 kcal\nServing 25g");
        assert_eq!(g.kcal100, Some(400.0));
        assert_eq!(g.kcal_serving, Some(100.0));
    }

    #[test]
    fn nothing_found() {
        let g = parse_label("Ingredients: oats, honey, almonds (12%)");
        assert_eq!(g, LabelGuess { unit: "g".into(), ..Default::default() });
    }
}
