//! Downloads the tiny model (to a temp dir, or the dir given as first arg), then reports
//! size, load/score timings, agreement with hand labels, the effect of user nudges and
//! step ideas.
//!
//! `cargo run --release --example score [model_dir]`
//! `cargo run --release --features large --example score [model_dir]` also scores the
//! hand labels with the old 360M model (downloads it, ~386 MB, if missing).
//! `... --example score [model_dir] --pause` waits for Enter at the end (to read peak memory).
use std::time::Instant;
use tend_llm::*;

fn task(title: &str, notes: &str, steps: &[&str]) -> TaskInput {
    TaskInput { title: title.into(), notes: notes.into(), steps: steps.iter().map(|s| s.to_string()).collect() }
}

/// Hand-labelled effort for everyday tasks (not copied from the built-in anchors).
fn labelled() -> Vec<(TaskInput, f32)> {
    vec![
        (task("take out the bin", "", &[]), 1.0),
        (task("reply to mum's text", "", &[]), 1.0),
        (task("take my meds", "", &[]), 1.0),
        (task("book dentist appointment", "", &[]), 2.0),
        (task("buy milk", "", &[]), 2.0),
        (task("hoover the living room", "", &[]), 3.0),
        (task("call the bank about a weird charge", "", &[]), 3.0),
        (task("do laundry", "", &["wash", "dry", "fold", "put away"]), 4.0),
        (task("make spaghetti bolognese for dinner", "", &[]), 4.0),
        (task("sort out car insurance renewal", "", &[]), 4.0),
        (task("plan Jake's birthday party", "", &[]), 5.0),
        (task("clean out the shed", "", &[]), 6.0),
        (task("revise for maths exam", "chapters 3 to 7", &[]), 7.0),
        (task("deep clean kitchen", "", &["clear counters", "clean oven", "mop floor", "wipe cupboards"]), 7.0),
        (task("declutter the garage", "", &[]), 7.0),
        (task("do tax return", "self assessment, find P60 and receipts", &[]), 9.0),
        (task("write essay for uni", "2000 words on climate policy", &["research", "outline", "draft", "edit"]), 9.0),
        (task("renovate the bathroom", "", &[]), 10.0),
    ]
}

fn pearson(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len() as f32;
    let (ma, mb) = (a.iter().sum::<f32>() / n, b.iter().sum::<f32>() / n);
    let cov: f32 = a.iter().zip(b).map(|(x, y)| (x - ma) * (y - mb)).sum();
    let va: f32 = a.iter().map(|x| (x - ma).powi(2)).sum();
    let vb: f32 = b.iter().map(|y| (y - mb).powi(2)).sum();
    cov / (va * vb).sqrt()
}

fn mae(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(x, y)| (x - y).abs()).sum::<f32>() / a.len() as f32
}

type Downloader = fn(&std::path::Path, &mut dyn FnMut(u64, u64)) -> anyhow::Result<()>;

fn get(dir: &std::path::Path, present: fn(&std::path::Path) -> bool, dl: Downloader, size: u64) -> anyhow::Result<()> {
    if present(dir) {
        return Ok(());
    }
    let t = Instant::now();
    let mut last = 0;
    dl(dir, &mut |d, total| {
        let pct = d * 100 / total.max(1);
        if pct >= last + 25 {
            last = pct;
            println!("  {pct}% ({d}/{total})");
        }
    })?;
    println!("downloaded {size} bytes in {:?}", t.elapsed());
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let pause = args.iter().any(|a| a == "--pause");
    let dir = args.iter().find(|a| !a.starts_with("--")).map(Into::into).unwrap_or_else(|| std::env::temp_dir().join("tend-llm-model"));
    println!("model dir: {} (present: {})", dir.display(), model_present(&dir));
    println!("download size: {} bytes ({:.1} MB)", model_size_hint(), model_size_hint() as f64 / 1e6);
    get(&dir, model_present, download_model, model_size_hint())?;

    // ---- timings
    let probe = task("water the garden", "", &[]);
    let t = Instant::now();
    let s = suggest(&dir, &probe, &[], 0.0)?;
    println!("\nfirst call (anchor cache may be warm from download): {:?} -> {:.2}", t.elapsed(), s.effort);
    let n = 20;
    let t = Instant::now();
    for _ in 0..n {
        suggest(&dir, &probe, &[], 0.0)?;
    }
    println!("per call (load + embed + score + drop), mean of {n}: {:?}", t.elapsed() / n);

    // ---- hand labels
    let lab = labelled();
    let labels: Vec<f32> = lab.iter().map(|x| x.1).collect();
    let tiny: Vec<Suggestion> = lab.iter().map(|(t, _)| suggest(&dir, t, &[], 0.0)).collect::<Result<_, _>>()?;
    let tiny_e: Vec<f32> = tiny.iter().map(|s| s.effort).collect();
    let heur: Vec<f32> = lab.iter().map(|(t, _)| heuristic_effort(t)).collect();

    #[cfg(feature = "large")]
    let large_e: Option<Vec<f32>> = {
        let d = std::env::temp_dir().join("tend-llm-model");
        get(&d, large::model_present, large::download_model, large::model_size_hint())?;
        let t = Instant::now();
        let v: Vec<f32> = lab.iter().map(|(t, _)| large::suggest(&d, t, &[], 0.0).map(|s| s.effort)).collect::<Result<_, _>>()?;
        println!("360M: {:?} per call", t.elapsed() / lab.len() as u32);
        Some(v)
    };
    #[cfg(not(feature = "large"))]
    let large_e: Option<Vec<f32>> = None;

    println!("\n== hand labels (no history)");
    println!("{:<38} {:>5} {:>6} {:>4} {:>5} {:>6} {:>6} {:>5}", "task", "label", "tiny", "max", "conf", "heur", "360M", "ms");
    for (i, ((t, l), s)) in lab.iter().zip(&tiny).enumerate() {
        let big = large_e.as_ref().map_or("-".into(), |v| format!("{:.2}", v[i]));
        println!("{:<38} {:>5} {:>6.2} {:>4} {:>5.2} {:>6.2} {:>6} {:>5}", t.title, l, s.effort, s.argmax, s.confidence, heur[i], big, s.millis);
    }
    println!("tiny:      r = {:.3}, MAE = {:.2}", pearson(&tiny_e, &labels), mae(&tiny_e, &labels));
    println!("heuristic: r = {:.3}, MAE = {:.2}", pearson(&heur, &labels), mae(&heur, &labels));
    if let Some(v) = &large_e {
        println!("360M:      r = {:.3}, MAE = {:.2}", pearson(v, &labels), mae(v, &labels));
    }

    // ---- nudges: the user's own values dominate for similar tasks
    println!("\n== user nudges");
    let history = vec![
        Example { title: "put the bins out".into(), effort: 2.0 },
        Example { title: "clean the bathroom".into(), effort: 6.0 },
        Example { title: "text Sarah back".into(), effort: 2.0 },
        Example { title: "book GP appointment".into(), effort: 4.0 },
        Example { title: "write cover letter".into(), effort: 8.0 },
        Example { title: "buy bread".into(), effort: 1.0 },
    ];
    let mut nudged = history.clone();
    nudged.push(Example { title: "take out the recycling".into(), effort: 5.0 });
    nudged.push(Example { title: "phone the dentist".into(), effort: 5.0 });
    let only: Vec<Example> = nudged[history.len()..].to_vec();
    println!("{:<26} {:>6} {:>11} {:>9} {:>14} {:>10}", "task", "none", "nudges only", "history", "history+nudges", "+bias 0.5");
    for t in [task("take out the bin", "", &[]), task("book dentist appointment", "", &[]), task("renovate the bathroom", "", &[])] {
        let a = suggest(&dir, &t, &[], 0.0)?.effort;
        let o = suggest(&dir, &t, &only, 0.0)?.effort;
        let b = suggest(&dir, &t, &history, 0.0)?.effort;
        let c = suggest(&dir, &t, &nudged, 0.0)?.effort;
        let d = suggest(&dir, &t, &nudged, 0.5)?.effort;
        println!("{:<26} {a:>6.2} {o:>11.2} {b:>9.2} {c:>14.2} {d:>10.2}", t.title);
    }
    println!("(nudges: \"take out the recycling\" = 5, \"phone the dentist\" = 5)");
    // 300 history items: first call embeds and caches them, later calls are cache hits.
    let run = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis();
    let big: Vec<Example> = (0..300).map(|i| Example { title: format!("history task {i} of run {run}"), effort: (i % 10 + 1) as f32 }).collect();
    let t = Instant::now();
    suggest(&dir, &probe, &big, 0.0)?;
    let cold = t.elapsed();
    let t = Instant::now();
    suggest(&dir, &probe, &big, 0.0)?;
    println!("300 history items: first call {cold:?} (embeds + caches them), next call {:?}", t.elapsed());

    // ---- step ideas
    println!("\n== step ideas");
    let past = vec![
        PastTask { title: "Clean the bathroom".into(), steps: vec!["Put on a podcast".into(), "Spray everything".into(), "Toilet".into(), "Shower".into()] },
        PastTask { title: "Go for a run".into(), steps: vec![] },
        PastTask { title: "Answer emails".into(), steps: vec!["Open inbox".into(), "Reply to 3".into()] },
    ];
    for title in ["clean the bathroom", "do the tax return", "book a doctor's appointment", "pack for holiday", "reply to emails", "go for a run", "feed the fish"] {
        let t = Instant::now();
        let ideas = suggest_steps(&dir, title, &past, 3)?;
        println!("{title:?} ({:?}):", t.elapsed());
        if ideas.is_empty() {
            println!("    (nothing similar enough)");
        }
        for i in ideas {
            println!("    [{} {:.2} \"{}\"] {}", i.source, i.similarity, i.from, i.steps.join(" / "));
        }
    }
    let t = Instant::now();
    let (s, ideas) = suggest_all(&dir, &task("clean the bathroom", "", &[]), &history, 0.0, &past, 3)?;
    println!("suggest_all(\"clean the bathroom\"): effort {:.2}, {} ideas, {:?} total (one model load)", s.effort, ideas.len(), t.elapsed());

    if pause {
        println!("\npaused; press Enter");
        let _ = std::io::stdin().read_line(&mut String::new());
    }
    Ok(())
}
