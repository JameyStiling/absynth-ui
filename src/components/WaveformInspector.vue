<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as Juce from 'juce-framework-frontend';

const props = defineProps<{
  oscillators: Array<{ active: boolean; type: number; level: number }>;
  isNoteActive: boolean;
  activeNotes?: number[];
  arpEnabled?: boolean;
  arpRateIndex?: number;
  arpMode?: number;
  arpSwing?: number;
  projectBpm?: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let animId = 0;
let phase = 0;

const arpRateIndexToBeatDiv = (rateIdx: number) => {
  switch (rateIdx) {
    case 0: return 1.0;
    case 1: return 0.5;
    case 2: return 0.25;
    case 3: return 0.125;
    case 4: return 1.5;
    case 5: return 0.75;
    case 6: return 0.375;
    case 7: return 2.0 / 3.0;
    case 8: return 1.0 / 3.0;
    case 9: return 0.5 / 3.0;
    default: return 0.5;
  }
};

const getDisplayNote = (tSec: number) => {
  const held = props.activeNotes ?? [];
  if (held.length === 0) return null;

  const arpEnabled = props.arpEnabled ?? false;
  if (!arpEnabled) return held[held.length - 1] ?? held[0] ?? null;

  const mode = props.arpMode ?? 0;
  if (mode === 0) return held[held.length - 1] ?? held[0] ?? null; // Repeat plays all; show latest

  const rateIdx = props.arpRateIndex ?? 1;
  const beatDiv = arpRateIndexToBeatDiv(rateIdx);
  const bpm = Math.max(30, props.projectBpm ?? 120);
  const baseStep = beatDiv * (60.0 / bpm);
  const swing = Math.max(0, Math.min(1, props.arpSwing ?? 0));
  const evenStep = baseStep * (1.0 - swing);
  const oddStep = baseStep * (1.0 + swing);
  const cycle = evenStep + oddStep;
  const within = ((tSec % cycle) + cycle) % cycle;
  const isEven = within < evenStep;
  const stepIndex = Math.floor(tSec / cycle) * 2 + (isEven ? 0 : 1);

  const notes = held.slice().sort((a, b) => a - b);
  const idx = stepIndex % Math.max(1, notes.length);
  if (mode === 1) return notes[idx] ?? null;
  if (mode === 2) return notes[(notes.length - 1 - idx) % notes.length] ?? null;
  if (mode === 3) {
    if (notes.length === 1) return notes[0] ?? null;
    const period = (notes.length - 1) * 2;
    const p = stepIndex % period;
    const bIdx = p <= (notes.length - 1) ? p : period - p;
    return notes[bIdx] ?? null;
  }
  return notes[idx] ?? null;
};

// ─── Pull live parameter values from the JUCE bridge ──────────────────────────
const getParam = (id: string, fallback: number): number => {
  try {
    const val = Juce.getSliderState(id).getScaledValue();
    if (val === undefined || val === null || !isFinite(val)) return fallback;
    return val;
  } catch { return fallback; }
};
const getToggle = (id: string, fallback: boolean): boolean => {
  try {
    const val = Juce.getToggleState(id).getValue();
    if (val === undefined || val === null) return fallback;
    return val;
  } catch { return fallback; }
};

// ─── Simple biquad filter for wub preview ─────────────────────────────────────
class Biquad {
  x1=0; x2=0; y1=0; y2=0;
  b0=1; b1=0; b2=0; a1=0; a2=0;

  setLPF(freq: number, sr: number, Q = 0.707) {
    freq = Math.max(20, Math.min(freq, sr * 0.49));
    const w0 = (2 * Math.PI * freq) / sr;
    const alpha = Math.sin(w0) / (2 * Q);
    const cosw0 = Math.cos(w0);
    const a0 = 1 + alpha;
    this.b0 = ((1 - cosw0) / 2) / a0;
    this.b1 = (1 - cosw0) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    if (!isFinite(x)) return 0;
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2
              - this.a1*this.y1 - this.a2*this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = isFinite(y) ? y : 0;
    return this.y1;
  }

  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

const voiceFilter = new Biquad();
const wubFilter = new Biquad();

const draw = () => {
  const cvs = canvas.value;
  if (!cvs) { animId = requestAnimationFrame(draw); return; }
  const ctx = cvs.getContext('2d')!;

  // Use getBoundingClientRect to read actual CSS-rendered size
  const rect = cvs.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(rect.width * dpr);
  const H = Math.round(rect.height * dpr);

  if (W < 2 || H < 2) { animId = requestAnimationFrame(draw); return; }
  // Only resize the backing canvas coordinate space if it differs by more than 2px
  // to prevent subpixel rounding jitter from clearing/resizing every frame in some WebViews
  if (Math.abs(cvs.width - W) > 2 || Math.abs(cvs.height - H) > 2) {
    cvs.width = W;
    cvs.height = H;
  }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(0,100,200,0.07)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = 1; i < 12; i++) {
    const x = (W / 12) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,120,220,0.12)';
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

  // Animate phase
  phase += props.isNoteActive ? 0.012 : 0.003;

  const activeOscs = props.oscillators.filter(o => o.active);

  // No active oscillators → draw dim idle sine
  if (activeOscs.length === 0) {
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const t = (x / W) * Math.PI * 4 + phase * 2;
      const py = H / 2 - Math.sin(t) * (H * 0.12);
      x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
    }
    ctx.strokeStyle = 'rgba(0,140,255,0.20)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    animId = requestAnimationFrame(draw);
    return;
  }

  // Pull JUCE bridge params (with safe fallbacks)
  const sustain    = getParam('sustain', 0.8);
  const cutoff     = getParam('cutoff', 2000);
  const resonance  = getParam('resonance', 0.1);
  const wubEnabled = getToggle('modEnabled', false);
  const wubRate    = getParam('modRate', 2.0);
  const wubDepth   = getParam('modDepth', 0.5);
  const wubCenter  = getParam('modCenter', 500);
  const wubReson   = getParam('modResonance', 0.5);

  const voiceQ = 0.707 + resonance * 10;
  voiceFilter.setLPF(cutoff, 44100, voiceQ);
  voiceFilter.reset();

  const effectiveWub = wubEnabled && props.isNoteActive;
  if (effectiveWub) {
    wubFilter.setLPF(wubCenter, 44100, 0.707 + wubReson * 10);
    wubFilter.reset();
  }

  // Generate waveform samples based on the currently played note (or arp step)
  const samples: number[] = new Array(W).fill(0);
  let wubPh = phase * wubRate * 0.1;

  const note = getDisplayNote(phase);
  const noteFreq = note != null ? (440 * Math.pow(2, (note - 69) / 12)) : 220;
  const sr = 44100;
  const cyclesAcross = 4;
  const durationSec = cyclesAcross / Math.max(20, noteFreq);
  const totalSamples = Math.max(1, Math.floor(durationSec * sr));

  for (let px = 0; px < W; px++) {
    const sIdx = Math.floor((px / W) * totalSamples);
    const ph = (sIdx * noteFreq) / sr; // cycles
    const frac = ph - Math.floor(ph);

    let mixed = 0;
    for (const osc of activeOscs) {
      const amp = Math.max(0, Math.min(1, osc.level / 100)) * 0.9;
      if (osc.type === 0) {
        mixed += Math.sin(frac * Math.PI * 2) * amp;
      } else if (osc.type === 1) {
        mixed += (2 * frac - 1) * amp; // saw
      } else {
        mixed += (frac < 0.5 ? 1 : -1) * amp; // square
      }
    }
    mixed /= activeOscs.length;

    // Use a minimum amplitude preview of 0.65 if note is inactive, and minimum of 0.3 if sustain is at 0,
    // so the visualizer waveform never flatlines completely and always renders a clean preview shape.
    const previewScale = props.isNoteActive ? Math.max(0.3, Math.min(1.0, sustain)) : 0.65;
    let s = voiceFilter.process(mixed * previewScale);

    if (effectiveWub) {
      wubPh += wubRate * 0.0001;
      const lfo = Math.sin(2 * Math.PI * wubPh);
      const fc = Math.max(20, Math.min(20000, wubCenter + lfo * wubCenter * wubDepth));
      wubFilter.setLPF(fc, 44100, 0.707 + wubReson * 10);
      s = wubFilter.process(s);
    }

    samples[px] = isFinite(s) ? s : 0;
  }

  // Normalize
  let peak = 0;
  for (const s of samples) if (Math.abs(s) > peak) peak = Math.abs(s);
  if (peak < 0.001) peak = 1;

  // Draw waveform
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const py = H / 2 - ((samples[x] ?? 0) / peak) * (H / 2 - 4);
    x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
  }
  ctx.shadowColor = '#0088FF';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#33AAFF';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(120,210,255,0.5)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  animId = requestAnimationFrame(draw);
};

onMounted(() => { animId = requestAnimationFrame(draw); });
onUnmounted(() => { cancelAnimationFrame(animId); });
</script>

<template>
  <div class="w-full bg-[#030308]" style="height:56px;">
    <canvas ref="canvas" style="display:block; width:100%; height:56px;" />
  </div>
</template>
