<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as Juce from 'juce-framework-frontend';

const props = defineProps<{
  oscillators: Array<{ active: boolean; type: number; level: number }>;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let animId = 0;
let phase = 0;

// ─── Pull live parameter values from the JUCE bridge ──────────────────────────
const getParam = (id: string, fallback: number) => {
  try {
    return Juce.getSliderState(id).getScaledValue();
  } catch { return fallback; }
};
const getToggle = (id: string, fallback: boolean) => {
  try {
    return Juce.getToggleState(id).getValue();
  } catch { return fallback; }
};

// ─── Simple biquad low-pass for waveform preview ──────────────────────────────
class SimpleLPF {
  private x1 = 0; private x2 = 0;
  private y1 = 0; private y2 = 0;
  private b0 = 1; private b1 = 0; private b2 = 0;
  private a1 = 0; private a2 = 0;

  setCutoff(freq: number, sampleRate: number, Q: number = 0.707) {
    const w0 = 2 * Math.PI * Math.max(20, Math.min(freq, sampleRate * 0.49)) / sampleRate;
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
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
              - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
}

// Persistent filter instances for smooth animation between frames
const voiceFilter = new SimpleLPF();
const wubFilter = new SimpleLPF();

const draw = () => {
  const cvs = canvas.value;
  if (!cvs) return;
  const ctx = cvs.getContext('2d')!;

  // Dynamic sizing
  const rect = cvs.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.floor(rect.width * dpr);
  const H = Math.floor(rect.height * dpr);
  if (cvs.width !== W || cvs.height !== H) {
    cvs.width = W;
    cvs.height = H;
  }
  if (W === 0 || H === 0) { animId = requestAnimationFrame(draw); return; }

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);

  // ── Grid ──
  ctx.strokeStyle = 'rgba(0, 100, 200, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (H / 4) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = 1; i < 12; i++) {
    const x = (W / 12) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Center line
  ctx.strokeStyle = 'rgba(0, 120, 220, 0.15)';
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

  const activeOscs = props.oscillators.filter(o => o.active);
  if (activeOscs.length === 0) {
    ctx.strokeStyle = 'rgba(0, 140, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    animId = requestAnimationFrame(draw);
    return;
  }

  // ── Pull live parameters ──
  const cutoff    = getParam('cutoff', 2000);
  const resonance = getParam('resonance', 0.1);
  const attack    = getParam('attack', 0.01);
  const sustain   = getParam('sustain', 1.0);

  const wubEnabled = getToggle('wubEnabled', false);
  const wubRate    = getParam('wubRate', 2.0);
  const wubDepth   = getParam('wubDepth', 0.8);
  const wubCenter  = getParam('wubCenter', 500);
  const wubReson   = getParam('wubResonance', 0.5);

  // ── Simulation parameters ──
  // We render ~4 cycles of a ~220Hz tone across the canvas width
  const simSampleRate = 44100;
  const simDuration = 4 / 220; // ~4 cycles
  const samplesPerPixel = (simSampleRate * simDuration) / W;

  // Setup voice filter
  const Q = 0.707 + resonance * 10; // Map 0-1 resonance to Q
  voiceFilter.setCutoff(cutoff, simSampleRate, Q);
  voiceFilter.reset();

  // Setup wub filter
  if (wubEnabled) {
    const wubQ = 0.707 + wubReson * 10;
    wubFilter.setCutoff(wubCenter, simSampleRate, wubQ);
    wubFilter.reset();
  }

  phase += 0.008;

  // ── Generate waveform samples ──
  const samples: number[] = new Array(W);
  let wubLfoPhase = phase * wubRate;

  for (let px = 0; px < W; px++) {
    const sampleIdx = px * samplesPerPixel;
    const t = (sampleIdx / simSampleRate) * 2 * Math.PI * 220 + phase * 10;
    
    // ── 1. Mix oscillators ──
    let mixed = 0;
    for (const osc of activeOscs) {
      const amp = (osc.level / 100) * 0.85;
      if (osc.type === 0) {        // Sine
        mixed += Math.sin(t) * amp;
      } else if (osc.type === 1) { // Saw
        const p = ((t / (Math.PI * 2)) % 1 + 1) % 1;
        mixed += (2 * p - 1) * amp;
      } else {                     // Square
        mixed += (Math.sin(t) >= 0 ? 1 : -1) * amp;
      }
    }
    mixed /= activeOscs.length;

    // ── 2. Voice filter (per-voice cutoff) ──
    let filtered = voiceFilter.process(mixed);

    // ── 3. ADSR envelope (simple approximation: sustain level) ──
    // For the preview, we show the sustained portion of the waveform
    filtered *= sustain;

    // ── 4. Wub LFO filter (post-synth) ──
    if (wubEnabled) {
      const lfo = Math.sin(2 * Math.PI * wubLfoPhase);
      wubLfoPhase += (wubRate / simSampleRate) * samplesPerPixel;
      const halfRange = wubCenter * wubDepth;
      const wubCutoff = Math.max(20, Math.min(20000, wubCenter + lfo * halfRange));
      const wQ = 0.707 + wubReson * 10;
      wubFilter.setCutoff(wubCutoff, simSampleRate, wQ);
      filtered = wubFilter.process(filtered);
    }

    samples[px] = filtered;
  }

  // ── Find peak for normalization ──
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak < 0.001) peak = 1;

  // ── Draw the waveform ──
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const normalized = samples[x] / peak;
    const py = H / 2 - normalized * (H / 2 - 8);
    x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
  }

  // Glow pass
  ctx.shadowColor = '#0088FF';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#33AAFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Second pass for brighter core
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  animId = requestAnimationFrame(draw);
};

onMounted(() => { animId = requestAnimationFrame(draw); });
onUnmounted(() => { cancelAnimationFrame(animId); });
</script>

<template>
  <div class="w-full overflow-hidden rounded-xl border border-[rgba(0,140,255,0.2)] bg-[#030308]" style="height:90px;">
    <canvas ref="canvas" class="w-full h-full" />
  </div>
</template>
