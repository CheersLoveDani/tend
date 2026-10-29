// Synthesised natural sounds — woodblock, marimba, wind chimes, a bird.
// Nothing is loaded from disk; the audio context is created lazily on first use
// and suspended again after a few idle seconds so it never costs battery.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic — every combination sounds kind

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let wet: GainNode | null = null;
let idleTimer: number | undefined;
let volume = 0.7;
let enabled = true;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
  if (master) master.gain.value = volume;
}

function impulse(ac: AudioContext, seconds: number) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp).connect(ctx.destination);
    // A small room so the wood rings like it's outside on a porch.
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 1.6);
    wet = ctx.createGain();
    wet.gain.value = 0.22;
    wet.connect(verb).connect(master);
  }
  if (ctx.state === "suspended") void ctx.resume();
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => void ctx?.suspend(), 4000);
  return ctx;
}

function out(ac: AudioContext, gain: number, at: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.connect(master!);
  g.connect(wet!);
  return g;
}

const hz = (semitone: number, base = 523.25) => base * Math.pow(2, semitone / 12);

function woodblock(ac: AudioContext, freq: number, at: number, level = 0.5) {
  const g = out(ac, 0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0008, at + 0.18);
  for (const [mult, amp] of [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.12],
  ] as const) {
    if (freq * mult * 1.04 >= ac.sampleRate / 2) continue; // above what can be heard or played
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * mult * 1.04, at);
    o.frequency.exponentialRampToValueAtTime(freq * mult, at + 0.03);
    og.gain.value = amp;
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + 0.22);
  }
  // The "knock": a tiny burst of band-passed noise.
  const n = ac.createBufferSource();
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.02), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 3;
  bp.Q.value = 2;
  const ng = ac.createGain();
  ng.gain.value = level * 0.5;
  n.connect(bp).connect(ng).connect(master!);
  n.start(at);
}

function marimba(ac: AudioContext, freq: number, at: number, level = 0.35, length = 0.9) {
  const g = out(ac, 0, at);
  g.gain.linearRampToValueAtTime(level, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0005, at + length);
  const partials: [number, number, number][] = [
    [1, 1, length],
    [4, 0.25, length * 0.3],
    [9.8, 0.06, 0.06],
  ];
  for (const [mult, amp, len] of partials) {
    if (freq * mult >= ac.sampleRate / 2) continue;
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq * mult;
    og.gain.setValueAtTime(amp, at);
    og.gain.exponentialRampToValueAtTime(0.0005, at + len);
    o.connect(og).connect(g);
    o.start(at);
    o.stop(at + length + 0.05);
  }
}

function chimes(ac: AudioContext, at: number, count = 5, level = 0.08) {
  for (let i = 0; i < count; i++) {
    const t = at + i * (0.07 + Math.random() * 0.09);
    const f = hz(PENTA[Math.floor(Math.random() * 5)] + 24 + (Math.random() < 0.3 ? 12 : 0));
    const g = out(ac, 0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 2.2);
    for (const mult of [1, 2.01, 3.98]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mult;
      const og = ac.createGain();
      og.gain.value = 1 / (mult * mult);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.3);
    }
  }
}

function chirp(ac: AudioContext, at: number) {
  for (let i = 0; i < 2; i++) {
    const t = at + i * 0.16;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(4200, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(3000, t + 0.1);
    const g = out(ac, 0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.14);
  }
}

export const sounds = {
  /** Quiet tick for ordinary taps. */
  tap() {
    const ac = audio();
    if (ac) woodblock(ac, 1400, ac.currentTime, 0.08);
  },
  /** A step: one woodblock note that climbs as more steps get done. */
  step(index = 0) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const deg = PENTA[index % 5] + 12 * Math.floor(index / 5);
    woodblock(ac, hz(deg, 659.25), t, 0.45);
    marimba(ac, hz(deg, 659.25), t + 0.01, 0.12, 0.5);
  },
  /** "Did a bit": a soft double knock. */
  bit() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    woodblock(ac, 880, t, 0.35);
    woodblock(ac, 1175, t + 0.09, 0.3);
  },
  /** Finishing a whole reminder: a rising marimba run and wind chimes. */
  finish() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    [0, 4, 7, 9, 12].forEach((s, i) => marimba(ac, hz(s), t + i * 0.075, 0.32, 1.2));
    marimba(ac, hz(-12), t, 0.25, 1.4);
    chimes(ac, t + 0.35, 6);
  },
  bonus() {
    const ac = audio();
    if (ac) chirp(ac, ac.currentTime + 0.5);
  },
  /** Level up: a deep wooden thunk, a rolled chord, a long shimmer. */
  levelUp() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    woodblock(ac, 196, t, 0.6);
    [-12, 0, 4, 7, 12, 16].forEach((s, i) => marimba(ac, hz(s, 392), t + 0.12 + i * 0.06, 0.25, 1.8));
    chimes(ac, t + 0.6, 10, 0.07);
    chirp(ac, t + 1.2);
  },
  undo() {
    const ac = audio();
    if (ac) woodblock(ac, 520, ac.currentTime, 0.18);
  },
};
