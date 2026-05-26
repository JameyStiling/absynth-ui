<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps<{
  modMode: number;      // 0: LFO, 1: DRAW (Custom MSEG)
  rate: number;         // LFO rate in Hz
  isNoteActive: boolean;
}>();

// Source of Truth states for the timeline, managed locally and synced reactively
const timeMode = ref<'sync' | 'sec'>('sync');
const syncDivision = ref<string>('1/4');
const secDuration = ref<number>(2.0);
const projectBpm = ref<number>(120);

// Divisions mapped to beat durations (1/1 is a full 4-beat bar)
const DIVISIONS_MAP: Record<string, number> = {
  '1/1': 4.0,   // 4 beats
  '1/2': 2.0,   // 2 beats
  '1/4': 1.0,   // 1 beat
  '1/8': 0.5,   // 0.5 beats
  '1/16': 0.25, // 0.25 beats
  '1/32': 0.125 // 0.125 beats
};

const getLoopDuration = () => {
  if (timeMode.value === 'sync') {
    const beats = DIVISIONS_MAP[syncDivision.value] ?? 1.0;
    return beats * (60.0 / projectBpm.value);
  } else {
    return secDuration.value;
  }
};

const getVerticalGridLines = () => {
  if (timeMode.value === 'sync') {
    const division = syncDivision.value;
    if (division === '1/1') {
      return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `Beat ${Math.round(v * 4) + 1}` }));
    }
    if (division === '1/2') {
      return [0.5].map(v => ({ xPct: v, label: 'Beat 2' }));
    }
    if (division === '1/4') {
      return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `${Math.round(v * 4) * 25}%` }));
    }
    if (division === '1/8') {
      return [0.5].map(v => ({ xPct: v, label: '50%' }));
    }
    if (division === '1/16') {
      return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `${Math.round(v * 4) * 25}%` }));
    }
    return [0.5].map(v => ({ xPct: v, label: '50%' }));
  } else {
    const duration = secDuration.value;
    if (duration === 0.5) {
      return [0.2, 0.4, 0.6, 0.8].map(v => ({ xPct: v, label: `${(v * duration).toFixed(1)}s` }));
    }
    if (duration === 1.0) {
      return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `${(v * duration).toFixed(2)}s` }));
    }
    if (duration === 2.0) {
      return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `${(v * duration).toFixed(1)}s` }));
    }
    return [0.25, 0.5, 0.75].map(v => ({ xPct: v, label: `${(v * duration).toFixed(0)}s` }));
  }
};

// ─── Custom MSEG Points State ────────────────────────────────────────────────
interface ControlPoint {
  x: number;     // 0.0 to 1.0 (normalized time position)
  y: number;     // 0.0 to 1.0 (normalized modulation value)
  curve: number; // curve tension parameter (-2.0 to +2.0), default 0 (linear)
}

const points = ref<ControlPoint[]>([
  { x: 0.0, y: 0.5, curve: -0.7 },
  { x: 0.25, y: 1.0, curve: 0.7 },
  { x: 0.5, y: 0.5, curve: -0.7 },
  { x: 0.75, y: 0.0, curve: 0.7 },
  { x: 1.0, y: 0.5, curve: 0.0 }
]);

const PADDING_X = 12; // Margin on left side inside canvas to render nodes safely
const PADDING_Y_TOP = 16; // Padding at top of canvas to prevent clipping upper peak
const PADDING_Y_BOTTOM = 26; // Padding at bottom of canvas to prevent overlap with timeline text!
const RIGHT_PADDING = 52; // Padding on the right for Y-axis percentage labels

const getPointPixelCoords = (p: ControlPoint, W: number, H: number) => {
  const drawWidth = W - PADDING_X - RIGHT_PADDING;
  const drawHeight = H - PADDING_Y_TOP - PADDING_Y_BOTTOM;
  return {
    px: PADDING_X + p.x * drawWidth,
    py: PADDING_Y_TOP + (1.0 - p.y) * drawHeight
  };
};

const getNormalizedCoords = (px: number, py: number, W: number, H: number) => {
  const drawWidth = W - PADDING_X - RIGHT_PADDING;
  const drawHeight = H - PADDING_Y_TOP - PADDING_Y_BOTTOM;
  return {
    nx: Math.max(0.0, Math.min(1.0, (px - PADDING_X) / drawWidth)),
    ny: Math.max(0.0, Math.min(1.0, 1.0 - (py - PADDING_Y_TOP) / drawHeight))
  };
};

// Emits to share custom points & timeline config to parent (so visualizer can sync)
const emit = defineEmits(['points-change', 'timeline-change']);

// Watchers to propagate updates reactively
watch(points, () => {
  emit('points-change', points.value);
}, { deep: true, immediate: true });

watch([timeMode, syncDivision, secDuration, projectBpm], () => {
  emit('timeline-change', {
    timeMode: timeMode.value,
    syncDivision: syncDivision.value,
    secDuration: secDuration.value,
    projectBpm: projectBpm.value,
    loopDuration: getLoopDuration()
  });
}, { immediate: true });

const canvas = ref<HTMLCanvasElement | null>(null);
let animId = 0;

// Interaction states
const hoveredPointIndex = ref<number | null>(null);
const draggedPointIndex = ref<number | null>(null);
const hoveredSegmentIndex = ref<number | null>(null);
const draggedCurveSegmentIndex = ref<number | null>(null);
const isAltKeyHeld = ref(false);

const dragStartPos = { x: 0, y: 0 };
let dragStartCurve = 0;

// Mouse Handlers
const onMouseMove = (e: MouseEvent) => {
  const cvs = canvas.value;
  if (!cvs) return;
  const rect = cvs.getBoundingClientRect();
  const W = cvs.width;
  const H = cvs.height;

  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  isAltKeyHeld.value = e.altKey;

  if (props.modMode !== 1) return;

  // 1. Dragging Node Point
  if (draggedPointIndex.value !== null) {
    const { nx, ny } = getNormalizedCoords(mouseX, mouseY, W, H);
    const idx = draggedPointIndex.value;
    const pt = points.value[idx];
    
    if (pt) {
      pt.y = ny;
      
      if (idx > 0 && idx < points.value.length - 1) {
        const prev = points.value[idx - 1];
        const next = points.value[idx + 1];
        if (prev && next) {
          const minX = prev.x + 0.02;
          const maxX = next.x - 0.02;
          pt.x = Math.max(minX, Math.min(maxX, nx));
        }
      }
    }
    return;
  }

  // 2. Dragging Segment Curve Tension
  if (draggedCurveSegmentIndex.value !== null) {
    const deltaY = mouseY - dragStartPos.y;
    const sensitivity = 0.015;
    const nextCurve = dragStartCurve - deltaY * sensitivity;
    const pt = points.value[draggedCurveSegmentIndex.value];
    if (pt) {
      pt.curve = Math.max(-2.0, Math.min(2.0, nextCurve));
    }
    return;
  }

  // 3. Normal Hover Detection
  let foundPointIdx: number | null = null;
  for (let i = 0; i < points.value.length; i++) {
    const pt = points.value[i];
    if (pt) {
      const { px, py } = getPointPixelCoords(pt, W, H);
      const dist = Math.hypot(mouseX - px, mouseY - py);
      if (dist < 10) {
        foundPointIdx = i;
        break;
      }
    }
  }

  hoveredPointIndex.value = foundPointIdx;

  if (hoveredPointIndex.value !== null) {
    hoveredSegmentIndex.value = null;
    return;
  }

  // Check if hovering over a curve segment
  let foundSegmentIdx: number | null = null;
  const { nx } = getNormalizedCoords(mouseX, mouseY, W, H);

  for (let i = 0; i < points.value.length - 1; i++) {
    const prev = points.value[i];
    const next = points.value[i + 1];
    
    if (prev && next) {
      if (nx >= prev.x && nx <= next.x) {
        const u = (nx - prev.x) / (next.x - prev.x);
        
        let cu = u;
        const c = prev.curve;
        if (c > 0) cu = Math.pow(u, 1 + c);
        else if (c < 0) cu = 1 - Math.pow(1 - u, 1 - c);
        
        const nyCurve = prev.y + (next.y - prev.y) * cu;
        const { py } = getPointPixelCoords({ x: nx, y: nyCurve, curve: 0 }, W, H);

        if (Math.abs(mouseY - py) < 14) {
          foundSegmentIdx = i;
          break;
        }
      }
    }
  }
  hoveredSegmentIndex.value = foundSegmentIdx;
};

const onMouseDown = (e: MouseEvent) => {
  if (props.modMode !== 1) return;
  const cvs = canvas.value;
  if (!cvs) return;
  const rect = cvs.getBoundingClientRect();
  const W = cvs.width;
  const H = cvs.height;

  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  isAltKeyHeld.value = e.altKey;

  // 1. Clicked on a hovered node point
  if (hoveredPointIndex.value !== null) {
    draggedPointIndex.value = hoveredPointIndex.value;
    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);
    return;
  }

  // 2. Clicked on a hovered segment with Option/Alt key -> Start curve bending!
  if (hoveredSegmentIndex.value !== null && isAltKeyHeld.value) {
    const pt = points.value[hoveredSegmentIndex.value];
    if (pt) {
      draggedCurveSegmentIndex.value = hoveredSegmentIndex.value;
      dragStartPos.x = mouseX;
      dragStartPos.y = mouseY;
      dragStartCurve = pt.curve;
      window.addEventListener('mousemove', onGlobalMouseMove);
      window.addEventListener('mouseup', onGlobalMouseUp);
    }
    return;
  }

  // 3. Clicked on an empty segment space (WITHOUT Alt/Option key) -> Insert a new point!
  if (hoveredSegmentIndex.value !== null && !isAltKeyHeld.value) {
    const { nx, ny } = getNormalizedCoords(mouseX, mouseY, W, H);
    const newPt = { x: nx, y: ny, curve: 0.0 };
    const idx = hoveredSegmentIndex.value;
    
    if (points.value.length < 10) {
      points.value.splice(idx + 1, 0, newPt);
      draggedPointIndex.value = idx + 1;
      hoveredPointIndex.value = idx + 1;
      hoveredSegmentIndex.value = null;
      window.addEventListener('mousemove', onGlobalMouseMove);
      window.addEventListener('mouseup', onGlobalMouseUp);
    }
  }
};

const onGlobalMouseMove = (e: MouseEvent) => {
  onMouseMove(e);
};

const onGlobalMouseUp = () => {
  draggedPointIndex.value = null;
  draggedCurveSegmentIndex.value = null;
  window.removeEventListener('mousemove', onGlobalMouseMove);
  window.removeEventListener('mouseup', onGlobalMouseUp);
};

const onDoubleClick = () => {
  if (props.modMode !== 1) return;
  if (hoveredPointIndex.value !== null) {
    const idx = hoveredPointIndex.value;
    if (idx > 0 && idx < points.value.length - 1) {
      points.value.splice(idx, 1);
      hoveredPointIndex.value = null;
    }
  }
};

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    isAltKeyHeld.value = true;
  }
};

const onKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    isAltKeyHeld.value = false;
  }
};

let lastTime = Date.now();
let timeElapsed = 0.0; // High-precision frame timing inside the graph
let phaseLfo = 0.0;

const draw = () => {
  const cvs = canvas.value;
  if (!cvs) return;
  const ctx = cvs.getContext('2d')!;

  // Dynamic canvas sizing
  const rect = cvs.getBoundingClientRect();
  if (cvs.width !== Math.floor(rect.width) || cvs.height !== Math.floor(rect.height)) {
    cvs.width = Math.floor(rect.width);
    cvs.height = Math.floor(rect.height);
  }

  const W = cvs.width, H = cvs.height;
  if (W === 0 || H === 0) return;

  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000.0);
  lastTime = now;

  timeElapsed += dt;
  phaseLfo += (props.rate / 60.0) * Math.PI * 2;

  ctx.clearRect(0, 0, W, H);

  const drawWidth = W - PADDING_X - RIGHT_PADDING;
  const drawHeight = H - PADDING_Y_TOP - PADDING_Y_BOTTOM;

  // ─── Render dynamic vertical grid timeline units ───────────────────────────
  ctx.lineWidth = 1;
  
  if (props.modMode === 1) {
    // DRAW Mode Time Grid Lines (Beats or Seconds)
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.05)';
    ctx.font = '900 10px JetBrains Mono, Inter, monospace';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.85)'; // Premium visible text
    ctx.textAlign = 'center';
    
    const timeLines = getVerticalGridLines();
    timeLines.forEach(line => {
      const x = PADDING_X + line.xPct * drawWidth;
      ctx.beginPath();
      ctx.moveTo(x, PADDING_Y_TOP);
      ctx.lineTo(x, H - PADDING_Y_BOTTOM);
      ctx.stroke();
      
      ctx.fillText(line.label, x, H - 8);
    });
  } else {
    // LFO Mode divisions lines
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.05)';
    ctx.font = '900 10px JetBrains Mono, Inter, monospace';
    ctx.fillStyle = 'rgba(99, 102, 241, 0.85)'; // Premium visible text
    ctx.textAlign = 'center';
    
    const cycles = [0.25, 0.5, 0.75];
    cycles.forEach(c => {
      const x = PADDING_X + c * drawWidth;
      ctx.beginPath();
      ctx.moveTo(x, PADDING_Y_TOP);
      ctx.lineTo(x, H - PADDING_Y_BOTTOM);
      ctx.stroke();
      
      ctx.fillText(`${c * 100}%`, x, H - 8);
    });
  }

  // ─── Render Y-Axis Modulation units (-100% to +100%) ───────────────────────
  ctx.strokeStyle = props.modMode === 1 ? 'rgba(168, 85, 247, 0.04)' : 'rgba(99, 102, 241, 0.04)';
  ctx.font = '900 10px JetBrains Mono, Inter, monospace';
  ctx.fillStyle = props.modMode === 1 ? 'rgba(168, 85, 247, 0.85)' : 'rgba(99, 102, 241, 0.85)';
  ctx.textAlign = 'left';

  const yTicks = [
    { yVal: 1.0, label: '+100%' },
    { yVal: 0.75, label: '+50%' },
    { yVal: 0.5, label: '  0%' },
    { yVal: 0.25, label: '-50%' },
    { yVal: 0.0, label: '-100%' }
  ];

  yTicks.forEach(tick => {
    const y = PADDING_Y_TOP + (1.0 - tick.yVal) * drawHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(drawWidth + PADDING_X, y);
    ctx.stroke();
    
    ctx.fillText(tick.label, drawWidth + PADDING_X + 8, y + 3);
  });

  // ─── Render LFO Waveform (Scrolling Sine Wave) ─────────────────────────────
  if (props.modMode === 0) {
    ctx.beginPath();
    for (let x = 0; x <= drawWidth; x += 2) {
      const nx = x / drawWidth;
      const sinVal = Math.sin(nx * Math.PI * 2);
      const ny = 0.5 + sinVal * 0.4; // Map LFO Sine to visual height
      const py = PADDING_Y_TOP + (1.0 - ny) * drawHeight;
      if (x === 0) ctx.moveTo(PADDING_X + x, py);
      else ctx.lineTo(PADDING_X + x, py);
    }
    ctx.strokeStyle = '#6366f1'; // Premium Indigo LFO line
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(99, 102, 241, 0.6)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Running playhead (LFO-synced)
    const lfoT = (phaseLfo / (Math.PI * 2)) % 1.0;
    const playheadX = PADDING_X + lfoT * drawWidth;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, PADDING_Y_TOP);
    ctx.lineTo(playheadX, H - PADDING_Y_BOTTOM);
    ctx.stroke();

    // Cursor bead
    const activeY = 0.5 + Math.sin(lfoT * Math.PI * 2) * 0.4;
    const playheadY = PADDING_Y_TOP + (1.0 - activeY) * drawHeight;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(playheadX, playheadY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ─── Render DRAW custom curve path (Electric Violet) ───────────────────────
  if (props.modMode === 1) {
    ctx.beginPath();
    for (let x = 0; x <= drawWidth; x += 2) {
      const nx = x / drawWidth;
      
      let val = 0.5;
      for (let i = 0; i < points.value.length - 1; i++) {
        const prev = points.value[i];
        const next = points.value[i + 1];
        
        if (prev && next && nx >= prev.x && nx <= next.x) {
          const u = (nx - prev.x) / (next.x - prev.x);
          
          let cu = u;
          const c = prev.curve;
          if (c > 0) cu = Math.pow(u, 1 + c);
          else if (c < 0) cu = 1 - Math.pow(1 - u, 1 - c);
          
          val = prev.y + (next.y - prev.y) * cu;
          break;
        }
      }
      
      const py = PADDING_Y_TOP + (1.0 - val) * drawHeight;
      if (x === 0) ctx.moveTo(PADDING_X + x, py);
      else ctx.lineTo(PADDING_X + x, py);
    }
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)'; // Electric violet neon line!
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // B. Draw playhead thin vertical line (BPM/seconds progress synced)
    const playheadT = (timeElapsed / getLoopDuration()) % 1.0;
    const playheadX = PADDING_X + playheadT * drawWidth;
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, PADDING_Y_TOP);
    ctx.lineTo(playheadX, H - PADDING_Y_BOTTOM);
    ctx.stroke();

    // C. Draw glowing playhead cursor bead on the curve path
    let ptVal = 0.5;
    for (let i = 0; i < points.value.length - 1; i++) {
      const prev = points.value[i];
      const next = points.value[i + 1];
      
      if (prev && next && playheadT >= prev.x && playheadT <= next.x) {
        const u = (playheadT - prev.x) / (next.x - prev.x);
        let cu = u;
        const c = prev.curve;
        if (c > 0) cu = Math.pow(u, 1 + c);
        else if (c < 0) cu = 1 - Math.pow(1 - u, 1 - c);
        ptVal = prev.y + (next.y - prev.y) * cu;
        break;
      }
    }
    const playheadY = PADDING_Y_TOP + (1.0 - ptVal) * drawHeight;
    
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffffff';
    ctx.beginPath();
    ctx.arc(playheadX, playheadY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // D. Draw interactive point nodes (electric violet cores with white centers)
    points.value.forEach((pt, idx) => {
      if (!pt) return;
      const { px, py } = getPointPixelCoords(pt, W, H);
      const isHovered = hoveredPointIndex.value === idx;
      const isDragged = draggedPointIndex.value === idx;
      
      // Node glowing halo ring
      ctx.fillStyle = isHovered || isDragged ? 'rgba(168, 85, 247, 0.35)' : 'rgba(168, 85, 247, 0.15)';
      ctx.beginPath();
      ctx.arc(px, py, isHovered || isDragged ? 8.5 : 5.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Node violet cap
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Node white center core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  animId = requestAnimationFrame(draw);
};

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  animId = requestAnimationFrame(draw);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  cancelAnimationFrame(animId);
});
</script>

<template>
  <div class="w-full flex flex-col rounded-xl bg-[#02050a]/95 border border-white/5 overflow-hidden shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)] min-h-[100px] flex-1">
    <!-- Visualizer header overlay (2-row stacked layout to prevent squishing) -->
    <div class="flex flex-col gap-2 px-4 py-2 border-b border-white/5 select-none shrink-0 bg-[#050914]/85">
      <!-- Row 1: Title -->
      <div class="flex items-center gap-2">
        <div class="w-1.5 h-1.5 rounded-full bg-[#c084fc] shadow-[0_0_8px_#c084fc]"></div>
        <span class="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">
          MSEG Envelope Editor
        </span>
      </div>

      <!-- Row 2: Compact Timeline Controls -->
      <div class="flex flex-wrap items-center justify-between gap-3 bg-black/25 px-2 py-1 rounded-md border border-white/5 pr-4">
        <!-- Sync / Sec Toggles -->
        <div class="flex items-center gap-1.5">
          <span class="text-[7.5px] font-black uppercase tracking-wider text-white/20">Grid</span>
          <div class="flex p-0.5 bg-black/50 rounded border border-white/5">
            <button 
              class="px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider transition-all border"
              :class="timeMode === 'sync' ? 'bg-[#7e22ce]/20 text-[#d8b4fe] border-[#a855f7]/30' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
              @click="timeMode = 'sync'"
            >
              Sync
            </button>
            <button 
              class="px-1.5 py-0.5 rounded text-[7.5px] font-black uppercase tracking-wider transition-all border"
              :class="timeMode === 'sec' ? 'bg-[#7e22ce]/20 text-[#d8b4fe] border-[#a855f7]/30' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
              @click="timeMode = 'sec'"
            >
              Sec
            </button>
          </div>
        </div>

        <!-- Dynamic Divisions / Duration Buttons -->
        <div class="flex items-center gap-1">
          <!-- Sync Divisions -->
          <div v-if="timeMode === 'sync'" class="flex items-center gap-1">
            <button 
              v-for="div in ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32']"
              :key="div"
              class="px-1 py-0.5 rounded text-[7.5px] font-black transition-all border w-8 text-center"
              :class="syncDivision === div ? 'bg-[#7e22ce]/20 text-[#d8b4fe] border-[#a855f7]/30 shadow-[0_0_8px_rgba(168,85,247,0.1)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
              @click="syncDivision = div"
            >
              {{ div }}
            </button>
          </div>

          <!-- Seconds Duration -->
          <div v-if="timeMode === 'sec'" class="flex items-center gap-1">
            <button 
              v-for="sec in [0.5, 1.0, 2.0, 4.0]"
              :key="sec"
              class="px-1.5 py-0.5 rounded text-[7.5px] font-black transition-all border w-10 text-center"
              :class="secDuration === sec ? 'bg-[#7e22ce]/20 text-[#d8b4fe] border-[#a855f7]/30 shadow-[0_0_8px_rgba(168,85,247,0.1)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
              @click="secDuration = sec"
            >
              {{ sec }}s
            </button>
          </div>
        </div>

        <!-- BPM Slider -->
        <div class="flex items-center gap-1.5 border-l border-white/5 pl-2">
          <span class="text-[7.5px] font-black uppercase tracking-wider text-white/20">BPM</span>
          <input 
            type="range" 
            min="60" 
            max="200" 
            step="1"
            v-model.number="projectBpm" 
            class="w-10 h-0.5 rounded bg-black/60 border border-white/5 accent-purple-500 cursor-pointer outline-none"
          />
          <span class="text-[7.5px] font-black text-purple-400 w-4 text-right font-mono">{{ projectBpm }}</span>
        </div>
      </div>
    </div>
    
    <!-- Canvas element filling the container -->
    <div class="flex-1 w-full relative min-h-0">
      <canvas 
        ref="canvas" 
        class="w-full h-full opacity-95 block"
        :class="{ 
          'cursor-pointer': props.modMode === 1 && hoveredPointIndex !== null, 
          'cursor-row-resize': props.modMode === 1 && hoveredSegmentIndex !== null && isAltKeyHeld,
          'cursor-crosshair': props.modMode === 1 && hoveredSegmentIndex !== null && !isAltKeyHeld 
        }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @dblclick="onDoubleClick"
      />
    </div>
  </div>
</template>
