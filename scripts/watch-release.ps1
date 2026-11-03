<#
  Watches a GitHub release build: a live card with a progress bar and the current step.

    pwsh scripts/watch-release.ps1                # the latest release run
    pwsh scripts/watch-release.ps1 v0.2.3         # the run for a tag
    pwsh scripts/watch-release.ps1 v0.2.3 -Once   # print one frame and exit (for testing)

  Progress is estimated from how long each step took in recent successful releases,
  because one step (the actual build) is most of the time. Press q to stop watching;
  the build itself keeps going.
#>
param([string]$Target = "", [switch]$Once)

$ErrorActionPreference = "Stop"
$Workflow = "release.yml"
$PollSeconds = 8
$e = [char]27

# ---- look ---------------------------------------------------------------------------------
function Rgb($r, $g, $b) { "$e[38;2;${r};${g};${b}m" }
$Reset = "$e[0m"; $Bold = "$e[1m"
$Moss = Rgb 126 186 112; $Pollen = Rgb 240 198 92; $Sky = Rgb 120 178 228
$Ink = Rgb 232 230 222; $Dim = Rgb 128 132 138; $Faint = Rgb 78 82 88; $Red = Rgb 232 104 92
$Spinner = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏".ToCharArray()

function Dur([double]$s) {
  $t = [TimeSpan]::FromSeconds([math]::Max(0, [math]::Round($s)))
  if ($t.TotalHours -ge 1) { $t.ToString("h\:mm\:ss") } else { $t.ToString("m\:ss") }
}
function Visible([string]$s) { ($s -replace "$e\[[0-9;?]*[a-zA-Z]", "").Length }

# Friendlier names for the workflow's steps; Post/Complete steps are folded into "cleaning up".
function Friendly([string]$name) {
  switch -Regex ($name) {
    '^Set up job$' { "Starting up"; break }
    'checkout' { "Getting the code"; break }
    'setup-node' { "Setting up Node"; break }
    'setup-java' { "Setting up Java"; break }
    'rust-toolchain' { "Setting up Rust"; break }
    'rust-cache' { "Restoring the build cache"; break }
    'npm ci' { "Installing packages"; break }
    'tauri-action' { "Building and signing the Windows installer"; break }
    'Install NDK' { "Installing Android build tools"; break }
    'Set up signing' { "Unlocking the signing key"; break }
    'android build' { "Building the Android app"; break }
    'Attach APK' { "Uploading the APK to the release"; break }
    default { $name -replace '^Run ', '' }
  }
}
function IsCleanup([string]$name) { $name -match '^(Post |Complete job)' }

# ---- GitHub -------------------------------------------------------------------------------
# Named so it can't shadow `gh` itself (PowerShell ignores case). Field lists must be quoted
# by callers, or PowerShell splits "a,b" into separate arguments.
function Invoke-GitHub { $out = & gh.exe @args 2>$null; if ($LASTEXITCODE -ne 0) { return $null }; $out }

$runs = Invoke-GitHub run list --workflow $Workflow -L 20 --json "databaseId,headBranch,status,conclusion" | ConvertFrom-Json
if (-not $runs) { Write-Host "No release runs found. Is gh logged in?"; if (-not $Once) { Read-Host "Enter to close" }; exit 1 }
$run = if ($Target -match '^\d+$') { $runs | Where-Object databaseId -eq ([long]$Target) | Select-Object -First 1 }
       elseif ($Target) { $runs | Where-Object headBranch -eq $Target | Select-Object -First 1 }
       else { $runs | Select-Object -First 1 }
if (-not $run) { Write-Host "No release run for '$Target'."; if (-not $Once) { Read-Host "Enter to close" }; exit 1 }
$RunId = $run.databaseId
$Tag = $run.headBranch
$Host.UI.RawUI.WindowTitle = "Tend $Tag"

if (-not $Once) { Write-Host "$Dim  Reading recent releases to estimate timings…$Reset" }
$expect = @{}                 # "job|step" -> typical seconds
$plan = [ordered]@{}          # job -> step names, for jobs that haven't started yet
$samples = @{}
foreach ($h in ($runs | Where-Object { $_.conclusion -eq "success" -and $_.databaseId -ne $RunId } | Select-Object -First 3)) {
  foreach ($j in (Invoke-GitHub run view $h.databaseId --json "jobs" | ConvertFrom-Json).jobs) {
    if (-not $plan.Contains($j.name)) { $plan[$j.name] = @($j.steps | ForEach-Object name) }
    foreach ($s in $j.steps) {
      if (-not $s.startedAt -or -not $s.completedAt) { continue }
      $k = "$($j.name)|$($s.name)"
      if (-not $samples[$k]) { $samples[$k] = @() }
      $samples[$k] += ([datetime]$s.completedAt - [datetime]$s.startedAt).TotalSeconds
    }
  }
}
foreach ($k in $samples.Keys) { $expect[$k] = [math]::Max(1, ($samples[$k] | Measure-Object -Average).Average) }

# A soft chime (sine notes with a gentle fade), about half as loud as Console.Beep,
# which can't be turned down.
function Chime([int[]]$notes, [double]$volume = 0.22) {
  $rate = 22050; $noteLen = 0.16; $tail = 0.45
  $n = [int]($rate * ($noteLen * ($notes.Count - 1) + $tail))
  $mix = New-Object double[] $n
  for ($k = 0; $k -lt $notes.Count; $k++) {
    $start = [int]($rate * $noteLen * $k)
    $len = [math]::Min([int]($rate * $tail), $n - $start)
    $w = 2 * [math]::PI * $notes[$k] / $rate
    for ($i = 0; $i -lt $len; $i++) {
      $env = [math]::Min(1, $i / 200) * [math]::Exp(-5.0 * $i / $len)
      $mix[$start + $i] += [math]::Sin($w * $i) * $env
    }
  }
  $ms = [System.IO.MemoryStream]::new()
  $bw = [System.IO.BinaryWriter]::new($ms)
  $bw.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $bw.Write([int](36 + $n * 2))
  $bw.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt ")); $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
  $bw.Write([int]$rate); $bw.Write([int]($rate * 2)); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([Text.Encoding]::ASCII.GetBytes("data")); $bw.Write([int]($n * 2))
  foreach ($v in $mix) { $bw.Write([int16]([math]::Max(-1, [math]::Min(1, $v * $volume)) * 32767)) }
  $ms.Position = 0
  try { [System.Media.SoundPlayer]::new($ms).PlaySync() } catch { }
}

function Fetch { Invoke-GitHub run view $RunId --json "status,conclusion,jobs,createdAt,url" | ConvertFrom-Json }
function Started($t) { $t -and ([datetime]$t).Year -gt 2000 }

# ---- one frame ----------------------------------------------------------------------------
function Frame($view, [int]$tick, [datetime]$fetchedAt) {
  $now = [datetime]::UtcNow
  $cols = try { [Console]::WindowWidth } catch { 80 }
  if ($cols -le 0) { $cols = 80 }
  $W = [math]::Max(34, $cols - 2)   # the card fills the window, like Claude Code
  $inner = $W - 4

  # Progress per job, from typical step times.
  $jobNames = @($plan.Keys) + @($view.jobs | ForEach-Object name | Where-Object { -not $plan.Contains($_) })
  $jobs = foreach ($name in $jobNames) {
    $job = $view.jobs | Where-Object name -eq $name | Select-Object -First 1
    $names = if ($job -and $job.steps.Count) { @($job.steps | ForEach-Object name) } elseif ($plan.Contains($name)) { @($plan[$name]) } else { @() }
    $state = if (-not $job) { "waiting" } elseif ($job.status -eq "completed") { $job.conclusion } elseif ($job.status -eq "in_progress") { "running" } else { "waiting" }
    $total = 0.0; $done = 0.0; $steps = @()
    foreach ($sn in $names) {
      $step = if ($job) { $job.steps | Where-Object name -eq $sn | Select-Object -First 1 }
      $exp = $expect["$name|$sn"]; if (-not $exp) { $exp = 3 }
      $total += $exp
      $st = if ($state -eq "skipped" -or $state -eq "success") { "done" }
            elseif ($step -and $step.status -eq "completed") { if ($step.conclusion -eq "failure") { "failed" } else { "done" } }
            elseif ($step -and $step.status -eq "in_progress") { "running" } else { "todo" }
      $secs = if ($step -and (Started $step.startedAt)) {
        $end = if ($step.status -eq "completed" -and (Started $step.completedAt)) { [datetime]$step.completedAt } else { $now }
        ($end - [datetime]$step.startedAt).TotalSeconds
      } else { 0 }
      $done += switch ($st) { "done" { $exp } "failed" { $exp } "running" { [math]::Min($secs, $exp * 0.95) } default { 0 } }
      $steps += [pscustomobject]@{ Name = $sn; State = $st; Secs = $secs; Expect = $exp; Cleanup = (IsCleanup $sn) }
    }
    [pscustomobject]@{ Name = $name; State = $state; Total = $total; Done = $done; Steps = $steps }
  }

  $finished = $view.status -eq "completed"
  $ok = $view.conclusion -eq "success"
  $total = ($jobs | Measure-Object Total -Sum).Sum
  $done = ($jobs | Measure-Object Done -Sum).Sum
  $pct = if ($finished -and $ok) { 1.0 } elseif ($total -gt 0) { [math]::Min(0.99, $done / $total) } else { 0 }
  $elapsed = ($now - [datetime]$view.createdAt).TotalSeconds
  $spin = $Spinner[$tick % $Spinner.Length]

  $out = [System.Collections.Generic.List[string]]::new()
  function Line([string]$s = "") {
    $pad = [math]::Max(0, $inner - (Visible $s))
    $out.Add("$Faint│$Reset $s$(' ' * $pad) $Faint│$Reset")
  }
  function Split([string]$left, [string]$right) {
    $gap = [math]::Max(1, $inner - (Visible $left) - (Visible $right))
    Line "$left$(' ' * $gap)$right"
  }

  # Header
  $status = if (-not $finished) { "$Sky$spin building$Reset" } elseif ($ok) { "$Moss✓ released$Reset" } else { "$Red✗ $($view.conclusion)$Reset" }
  $out.Add("$Faint╭$('─' * ($W - 2))╮$Reset")
  Split "$Moss❀$Reset $Bold${Ink}Tend $Tag$Reset" "$status  $Dim$(Dur $elapsed)$Reset"
  Line

  # Progress bar: a pollen-to-moss gradient with eighth-block precision.
  $pctText = "{0,4:P0}" -f $pct
  $eta = if ($finished) { "" } elseif ($done -gt 0) { "~$(Dur ($total - $done)) left" } else { "" }
  $barW = [math]::Max(8, $inner - 6 - [math]::Max(12, $eta.Length + 2))
  $cells = $pct * $barW
  $full = [math]::Floor($cells)
  $eighths = " ▏▎▍▌▋▊▉".ToCharArray()
  $bar = ""
  for ($i = 0; $i -lt $barW; $i++) {
    $t = if ($barW -gt 1) { $i / ($barW - 1) } else { 0 }
    $c = if ($finished -and -not $ok) { $Red } else { Rgb ([int](240 + (126 - 240) * $t)) ([int](198 + (186 - 198) * $t)) ([int](92 + (112 - 92) * $t)) }
    if ($i -lt $full) { $bar += "$c█" }
    elseif ($i -eq $full -and $cells -gt $full) { $bar += "$c$($eighths[[int][math]::Floor(($cells - $full) * 8)])" }
    else { $bar += "$Faint─" }
  }
  Split "$bar$Reset $Bold$Ink$pctText$Reset" "$Dim$eta$Reset"
  Line

  # Pipeline: each job, then the release going live.
  $nodes = @()
  foreach ($j in $jobs) {
    $icon = switch ($j.State) {
      "success" { "$Moss●" } "skipped" { "$Dim○" } "failure" { "$Red✗" } "cancelled" { "$Pollen■" }
      "running" { "$Sky$spin" } default { "$Faint○" }
    }
    $color = if ($j.State -eq "running") { $Ink } else { $Dim }
    $fill = if ($j.Total) { $j.Done / $j.Total } else { 0 }
    $nodes += [pscustomobject]@{ Text = "$icon $color$($j.Name)$Reset"; Fill = $fill; Done = ($j.State -in "success", "skipped") }
  }
  $liveText = if ($finished -and $ok) { "$Moss● ${Ink}Live$Reset" } else { "$Faint○ ${Dim}Live$Reset" }
  $nodes += [pscustomobject]@{ Text = $liveText; Fill = 0; Done = $false }
  $textW = ($nodes | ForEach-Object { Visible $_.Text } | Measure-Object -Sum).Sum
  # Too narrow for names and links: just the icons.
  if ($textW + 5 * ($nodes.Count - 1) -gt $inner) {
    foreach ($n in $nodes) { $n.Text = ($n.Text -split ' ')[0] + $Reset }
    $textW = ($nodes | ForEach-Object { Visible $_.Text } | Measure-Object -Sum).Sum
  }
  $linkW = [math]::Max(3, [math]::Floor(($inner - $textW - 2 * ($nodes.Count - 1)) / [math]::Max(1, $nodes.Count - 1)))
  $row = ""
  for ($i = 0; $i -lt $nodes.Count; $i++) {
    $row += $nodes[$i].Text
    if ($i -lt $nodes.Count - 1) {
      $lit = if ($nodes[$i].Done) { $linkW } else { [math]::Floor($nodes[$i].Fill * $linkW) }
      $row += " $Moss$('━' * $lit)$Faint$('┄' * ($linkW - $lit))$Reset "
    }
  }
  Line $row
  Line

  # Detail: the job that matters now, a few steps either side of where it is.
  $focus = $jobs | Where-Object State -in "failure", "cancelled" | Select-Object -First 1
  if (-not $focus) { $focus = $jobs | Where-Object State -eq "running" | Select-Object -First 1 }
  if (-not $focus) { $focus = $jobs | Where-Object State -ne "waiting" | Select-Object -Last 1 }
  if ($focus) {
    $main = @($focus.Steps | Where-Object { -not $_.Cleanup })
    $cur = -1
    for ($i = 0; $i -lt $main.Count; $i++) { if ($main[$i].State -in "running", "failed") { $cur = $i; break } }
    if ($cur -lt 0) { for ($i = 0; $i -lt $main.Count; $i++) { if ($main[$i].State -eq "todo") { $cur = $i; break } } }
    $inCleanup = $cur -lt 0 -and $focus.State -eq "running"
    if ($cur -lt 0) { $cur = $main.Count }
    $from = [math]::Max(0, $cur - 3); $to = [math]::Min($main.Count - 1, $cur + 2)
    if ($from -gt 0) { Line "  $Faint⋮ $from earlier steps done$Reset" }
    for ($i = $from; $i -le $to; $i++) {
      $s = $main[$i]
      $name = Friendly $s.Name
      $maxName = [math]::Max(8, $inner - 18)
      if ($name.Length -gt $maxName) { $name = $name.Substring(0, $maxName - 1) + "…" }
      switch ($s.State) {
        "done" { Split "  $Moss✓ $Dim$name$Reset" "$Faint$(Dur $s.Secs)$Reset" }
        "failed" { Split "  $Red✗ $Ink$name$Reset" "$Red$(Dur $s.Secs)$Reset" }
        "running" {
          $tc = if ($s.Secs -gt $s.Expect * 1.25) { $Pollen } else { $Ink }
          Split "  $Sky$spin $Bold$Ink$name$Reset" "$tc$(Dur $s.Secs)$Dim / ~$(Dur $s.Expect)$Reset"
        }
        default { Line "  $Faint· $name$Reset" }
      }
    }
    $later = $main.Count - 1 - $to
    if ($later -gt 0) { Line "  $Faint⋮ $later more$Reset" }
    if ($inCleanup) { Line "  $Sky$spin ${Ink}Cleaning up$Reset" }
    Line
  }

  # Footer
  if ($finished) {
    if ($ok) {
      Line "$Moss${Bold}Released.$Reset$Ink Installed copies will offer the update.$Reset"
      foreach ($a in @($script:Assets)) { if ($a) { Line "  $Dim↳ $a$Reset" } }
    } else {
      Line "$Red${Bold}The build $($view.conclusion).$Reset$Ink The log is at the link below.$Reset"
    }
    Line
  }
  $ago = [math]::Round(($now - $fetchedAt).TotalSeconds)
  $url = $view.url -replace '^https://', ''
  $hint = if ($finished) { "q to close" } elseif ($inner -lt 50) { "q quits" } else { "updated ${ago}s ago · q quits" }
  if ((Visible $url) -gt $inner - (Visible $hint) - 2) { $url = if ($inner -lt 50) { "" } else { "GitHub run $RunId" } }
  Split "$Faint$url$Reset" "$Faint$hint$Reset"
  $out.Add("$Faint╰$('─' * ($W - 2))╯$Reset")
  $out.ToArray()
}

# ---- run ----------------------------------------------------------------------------------
$view = Fetch
if (-not $view) { Write-Host "Couldn't read run $RunId."; if (-not $Once) { Read-Host "Enter to close" }; exit 1 }
$fetchedAt = [datetime]::UtcNow
$script:Assets = @()
$script:Rang = $false

if ($Once) {
  foreach ($l in (Frame $view 0 $fetchedAt)) { Write-Host $l }
  exit 0
}

# A separate screen, like htop: redrawing never scrolls, and the terminal is left as it was.
[Console]::Write("$e[?1049h$e[?25l")
$pending = $null
$tick = 0
$lastSize = ""
try {
  while ($true) {
    $finished = $view.status -eq "completed"
    if (-not $finished -and -not $pending -and ([datetime]::UtcNow - $fetchedAt).TotalSeconds -ge $PollSeconds) {
      # Fetch in the background so the spinner and timers keep moving.
      $pending = Start-ThreadJob -ArgumentList $RunId -ScriptBlock {
        param($id)
        $j = & gh.exe run view $id --json "status,conclusion,jobs,createdAt,url" 2>$null
        if ($LASTEXITCODE -eq 0) { $j -join "`n" }
      }
    }
    if ($pending -and $pending.State -ne "Running" -and $pending.State -ne "NotStarted") {
      $json = Receive-Job $pending -ErrorAction SilentlyContinue
      Remove-Job $pending -Force
      $pending = $null
      $fetchedAt = [datetime]::UtcNow
      if ($json) {
        $view = $json | ConvertFrom-Json
        if ($view.status -eq "completed" -and $view.conclusion -eq "success") {
          $script:Assets = @(Invoke-GitHub release view $Tag --json "assets" -q ".assets[].name")
        }
      }
    }

    $lines = Frame $view $tick $fetchedAt
    $rows = try { [Console]::WindowHeight } catch { 40 }
    $size = "$([Console]::WindowWidth)x$rows"
    if ($size -ne $lastSize) { [Console]::Write("$e[2J"); $lastSize = $size }
    $top = [math]::Max(0, [math]::Floor(($rows - $lines.Count) / 3))
    $sb = [System.Text.StringBuilder]::new("$e[H")
    for ($i = 0; $i -lt $top; $i++) { [void]$sb.Append("$e[K`n") }
    foreach ($l in ($lines | Select-Object -First ([math]::Max(1, $rows - $top - 1)))) { [void]$sb.Append(" $l$e[K`n") }
    [void]$sb.Append("$e[J")
    [Console]::Write($sb.ToString())

    if ($view.status -eq "completed" -and -not $script:Rang) {
      $script:Rang = $true
      if ($view.conclusion -eq "success") { Chime 784, 988, 1319 } else { Chime 392, 330 }
    }
    if ([Console]::KeyAvailable) {
      $k = [Console]::ReadKey($true)
      if ($k.Key -in "Q", "Escape" -or ($view.status -eq "completed" -and $k.Key -eq "Enter")) { break }
    }
    Start-Sleep -Milliseconds 120
    $tick++
  }
} finally {
  if ($pending) { Remove-Job $pending -Force -ErrorAction SilentlyContinue }
  [Console]::Write("$e[?25h$e[?1049l")
}
# Leave the final card in the normal terminal, so it's still there after the live view closes.
foreach ($l in (Frame $view 0 $fetchedAt)) { Write-Host " $l" }
