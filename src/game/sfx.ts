// Tiny synthesized sound effects — no audio files needed.

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Paint shotgun blast — burst of filtered noise + low thump */
export function sfxShot() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  // noise burst
  const len = Math.floor(a.sampleRate * 0.22);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = "lowpass"; bp.frequency.value = 1800;
  const g = a.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
  src.connect(bp).connect(g).connect(a.destination); src.start(t);
  // thump
  const o = a.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const g2 = a.createGain(); g2.gain.setValueAtTime(0.5, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 0.16);
  o.connect(g2).connect(a.destination); o.start(t); o.stop(t + 0.18);
}

/** Someone got hit — splat! */
export function sfxHit() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
  const g = a.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.28);
}

/** Whistle — two rising chirps (key 1) */
export function sfxWhistle() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = a.createOscillator(); o.type = "sine";
    const st = t + i * 0.18;
    o.frequency.setValueAtTime(880, st); o.frequency.linearRampToValueAtTime(1420, st + 0.12);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, st);
    g.gain.linearRampToValueAtTime(0.3, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.01, st + 0.15);
    o.connect(g).connect(a.destination); o.start(st); o.stop(st + 0.17);
  }
}

/** Eyedropper pick — soft click */
export function sfxPick() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.06);
  const g = a.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.1);
}

/** Full-body paint — swish */
export function sfxFill() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  const len = Math.floor(a.sampleRate * 0.3);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
  const src = a.createBufferSource(); src.buffer = buf;
  const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(800, t);
  bp.frequency.linearRampToValueAtTime(3200, t + 0.28);
  const g = a.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.linearRampToValueAtTime(0.001, t + 0.3);
  src.connect(bp).connect(g).connect(a.destination); src.start(t);
}

/** Phase change — ding */
export function sfxDing() {
  const a = ac(); if (!a) return;
  const t = a.currentTime;
  for (const [f, d] of [[660, 0], [990, 0.12]] as [number, number][]) {
    const o = a.createOscillator(); o.type = "triangle";
    o.frequency.value = f;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.linearRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.01, t + d + 0.4);
    o.connect(g).connect(a.destination); o.start(t + d); o.stop(t + d + 0.45);
  }
}
