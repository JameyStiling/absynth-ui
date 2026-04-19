<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  center: number; // in Hz
  depth: number;  // 0-1
  rate: number;   // in Hz
  active: boolean;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let animId = 0;
let phase = 0;

const draw = () => {
  const cvs = canvas.value;
  if (!cvs) return;
  const ctx = cvs.getContext('2d')!;

  // Dynamic sizing
  const rect = cvs.getBoundingClientRect();
  if (cvs.width !== Math.floor(rect.width) || cvs.height !== Math.floor(rect.height)) {
    cvs.width = Math.floor(rect.width);
    cvs.height = Math.floor(rect.height);
  }

  const W = cvs.width, H = cvs.height;
  if (W === 0 || H === 0) return;

  ctx.clearRect(0, 0, W, H);
  
  if (!props.active) {
    ctx.strokeStyle = 'rgba(0, 140, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2);
    ctx.lineTo(W, H/2);
    ctx.stroke();
    animId = requestAnimationFrame(draw);
    return;
  }

  // Draw background grid lines (logarithmic-ish)
  ctx.strokeStyle = 'rgba(0, 100, 255, 0.05)';
  for (let i = 1; i < 10; i++) {
    const x = (i / 10) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Update phase based on rate
  phase += (props.rate / 60) * Math.PI * 2;
  
  // Calculate sweep range in "log" space for display
  const lfo = Math.sin(phase);
  
  // Center is freq. Mapping 20Hz-20kHz to 0-W
  const freqToX = (f: number) => (Math.log10(f / 20) / Math.log10(20000 / 20)) * W;
  
  const minFreq = props.center * Math.pow(2, -props.depth * 2);
  const maxFreq = props.center * Math.pow(2, props.depth * 2);
  const currentFreq = props.center * Math.pow(2, lfo * props.depth * 2);

  const xMin = freqToX(minFreq);
  const xMax = freqToX(maxFreq);
  const xCurrent = freqToX(currentFreq);

  // Helper for note conversion
  const getNote = (freq: number) => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
  };

  // Draw range shadow
  ctx.fillStyle = 'rgba(0, 140, 255, 0.05)';
  ctx.fillRect(xMin, 0, xMax - xMin, H);

  // Draw peak curve (bell-like for the wub)
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(0, 140, 255, 0.5)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x++) {
    const dist = Math.abs(x - xCurrent);
    const y = H - (Math.exp(-dist / 30) * (H - 10) + 5);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw moving dot
  ctx.fillStyle = '#33AAFF';
  ctx.beginPath();
  ctx.arc(xCurrent, H - 5, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw label
  ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
  ctx.font = '700 9px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(currentFreq)}Hz`, xCurrent, H - 28);
  ctx.fillStyle = 'rgba(0, 140, 255, 0.5)';
  ctx.fillText(getNote(currentFreq), xCurrent, H - 18);

  ctx.shadowBlur = 10;
  ctx.shadowColor = '#0088FF';
  ctx.fill();
  ctx.shadowBlur = 0;

  animId = requestAnimationFrame(draw);
};

onMounted(() => { animId = requestAnimationFrame(draw); });
onUnmounted(() => { cancelAnimationFrame(animId); });
</script>

<template>
  <div class="w-full h-12 rounded bg-[#02050a] border border-[rgba(0,140,255,0.1)] relative overflow-hidden">
    <canvas ref="canvas" class="w-full h-full opacity-80" />
    <div class="absolute top-1 left-2 text-[8px] uppercase tracking-tighter text-[#335577] pointer-events-none">Wub Spectrum</div>
  </div>
</template>
