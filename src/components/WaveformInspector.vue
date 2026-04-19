<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  oscillators: Array<{ active: boolean; type: number; level: number }>;
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
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
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

  phase += 0.01;
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const t = (x / W) * Math.PI * 4 + phase;
    let y = 0;
    for (const osc of activeOscs) {
      const amp = (osc.level / 100) * 0.85;
      if (osc.type === 0) {
        y += Math.sin(t) * amp;
      } else if (osc.type === 1) {
        const p = ((t / (Math.PI * 2)) % 1 + 1) % 1;
        y += (2 * p - 1) * amp;
      } else {
        y += (Math.sin(t) >= 0 ? 1 : -1) * amp;
      }
    }
    y /= activeOscs.length;
    const py = H / 2 - y * (H / 2 - 10);
    x === 0 ? ctx.moveTo(x, py) : ctx.lineTo(x, py);
  }

  // Glow pass
  ctx.shadowColor = '#0088FF';
  ctx.shadowBlur = 10;
  ctx.strokeStyle = '#33AAFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

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
