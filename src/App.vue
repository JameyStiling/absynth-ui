<script setup lang="ts">
import { ref, reactive, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import * as Juce from 'juce-framework-frontend';
import JuceKnob from './components/JuceKnob.vue';
import JuceToggle from './components/JuceToggle.vue';
import WubVisualizer from './components/WubVisualizer.vue';
import MsegEditor from './components/MsegEditor.vue';
import WaveformInspector from './components/WaveformInspector.vue';
import VirtualKeyboard from './components/VirtualKeyboard.vue';

// ─── Wub Visualizer state ─────────────────────────────────────────────────────
const wub = reactive({
  active: true, // Enabled by default for better screenshots/demo
  rate: 45,
  depth: 60,
  depthMode: 2, // 0: Hz, 1: Semi, 2: Oct
  polarity: 1,  // 0: +, 1: +/-
  center: 440,
  reson: 0.5,
  filterType: 0, // 0: LPF, 1: HPF, 2: BPF
  modMode: 1, // 1: DRAW (Custom MSEG)
  slope: 1 // 0: 6 dB, 1: 12 dB, 2: 18 dB, 3: 24 dB
});

const arp = reactive({
  enabled: false,
  rate: 1,
  swing: 0.0,
  mode: 0
});

// ─── Oscillator state ─────────────────────────────────────────────────────────
const OSC_NAMES = ['Sine', 'Saw', 'Square'];
const FILTER_NAMES = ['LPF', 'HPF', 'BPF'];
const WAVE_ICONS = ['∿', '⊿', '⊓'];

const oscillators = reactive([
  { id: 1, active: true,  type: 0, level: 80, collapsed: false, visible: true },
  { id: 2, active: false, type: 1, level: 60, collapsed: false, visible: false },
  { id: 3, active: false, type: 2, level: 40, collapsed: false, visible: false },
]);

const addOscillator = () => {
  const next = oscillators.find(o => !o.visible);
  if (next) {
    next.visible = true;
    next.active = true;
  }
};

const removeOscillator = (index: number) => {
  const osc = oscillators[index];
  if (!osc) return;
  osc.visible = false;
  osc.active = false;
  // Clear any routing for this osc
  routing.delete(index);
};

const filters = reactive([
  { id: 1, active: true,  type: 0, collapsed: false, visible: true },
  { id: 2, active: false, type: 0, collapsed: false, visible: false },
  { id: 3, active: false, type: 1, collapsed: false, visible: false },
]);

const addFilter = () => {
  const next = filters.find(f => !f.visible);
  if (next) {
    next.visible = true;
    next.active = true;
  }
};

const removeFilter = (index: number) => {
  const filter = filters[index];
  if (!filter) return;
  filter.visible = false;
  filter.active = false;
  // Clear any routing to this filter
  for (const [, targets] of routing.entries()) {
    if (targets.has(index)) {
      targets.delete(index);
    }
  }
};

// ─── Routing ──────────────────────────────────────────────────────────────────
const routing = reactive<Map<number, Set<number>>>(
  new Map([[0, new Set([0])]])
);

const isConnected = (o: number, f: number) => routing.get(o)?.has(f) ?? false;

// Dragging state
const dragMode = ref<'connect' | 'disconnect' | null>(null);
const dragSourceOsc = ref<number | null>(null);
const dragSourceFilter = ref<number | null>(null);
const mousePos = reactive({ x: 0, y: 0 });
const routingContainer = ref<HTMLElement | null>(null);

// Force re-render of SVG paths when layout changes
const layoutVersion = ref(0);
watch([oscillators, filters], () => {
  nextTick(() => { layoutVersion.value++; });
}, { deep: true });

const getPortPos = (type: 'osc' | 'filter', index: number) => {
  if (!routingContainer.value) return { x: 0, y: 0 };
  
  const selector = type === 'osc' ? `[data-osc-port="${index}"]` : `[data-filter-port="${index}"]`;
  const portEl = routingContainer.value.querySelector(selector);
  if (!portEl) return { x: 0, y: 0 };

  const portRect = portEl.getBoundingClientRect();
  const containerRect = routingContainer.value.getBoundingClientRect();
  
  return {
    x: (portRect.left + portRect.width / 2) - containerRect.left,
    y: (portRect.top + portRect.height / 2) - containerRect.top
  };
};

const bumpRoutingLayout = () => {
  layoutVersion.value++;
};

let routingResizeObserver: ResizeObserver | null = null;

const startDragFromOsc = (e: MouseEvent, i: number) => {
  dragMode.value = 'connect';
  dragSourceOsc.value = i;
  updateMousePos(e);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
};

const startDragFromFilter = (e: MouseEvent, f: number) => {
  let connectedOsc = -1;
  for (let o = 0; o < oscillators.length; o++) {
    if (isConnected(o, f)) {
      connectedOsc = o;
      break;
    }
  }

  if (connectedOsc !== -1) {
    dragMode.value = 'disconnect';
    dragSourceOsc.value = connectedOsc;
    dragSourceFilter.value = f;
    updateMousePos(e);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }
};

const updateMousePos = (e: MouseEvent) => {
  if (!routingContainer.value) return;
  const rect = routingContainer.value.getBoundingClientRect();
  mousePos.x = e.clientX - rect.left;
  mousePos.y = e.clientY - rect.top;
};

const onDragMove = (e: MouseEvent) => {
  updateMousePos(e);
};

const onDragEnd = (e: MouseEvent) => {
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);

  const target = e.target as HTMLElement;
  const filterPort = target.closest('[data-filter-port]');
  
  if (filterPort) {
    const f = parseInt(filterPort.getAttribute('data-filter-port')!);
    const o = dragSourceOsc.value!;
    
    if (dragMode.value === 'connect') {
      if (!routing.has(o)) routing.set(o, new Set());
      routing.get(o)!.add(f);
    }
  } else if (dragMode.value === 'disconnect') {
    const o = dragSourceOsc.value!;
    const f = dragSourceFilter.value!;
    routing.get(o)?.delete(f);
  }

  dragMode.value = null;
  dragSourceOsc.value = null;
  dragSourceFilter.value = null;
  layoutVersion.value++;
};

// ─── ADSR Visualizer State ───────────────────────────────────────────────────
const adsr = reactive({
  attack: 0.1,
  decay: 0.5,
  sustain: 0.7,
  release: 1.5
});

const adsrPath = computed(() => {
  const W = 220;
  const H = 65;
  const padding = 10;
  const maxTime = 5.0;
  
  const aVal = Math.max(0.01, Math.min(maxTime, adsr.attack));
  const dVal = Math.max(0.01, Math.min(maxTime, adsr.decay));
  const sVal = Math.max(0.0, Math.min(1.0, adsr.sustain));
  const rVal = Math.max(0.01, Math.min(maxTime, adsr.release));
  
  const totalBudget = aVal + dVal + 1.2 + rVal;
  
  const x0 = padding;
  const y0 = H - padding;
  
  const x1 = padding + (aVal / totalBudget) * (W - 2 * padding);
  const y1 = padding;
  
  const x2 = x1 + (dVal / totalBudget) * (W - 2 * padding);
  const y2 = padding + (1.0 - sVal) * (H - 2 * padding);
  
  const x3 = x2 + (1.2 / totalBudget) * (W - 2 * padding);
  const y3 = y2;
  
  const x4 = x3 + (rVal / totalBudget) * (W - 2 * padding);
  const y4 = H - padding;
  
  return `M ${x0} ${y0} Q ${(x0+x1)/2} ${y1} ${x1} ${y1} C ${(x1+x2)/2} ${y1} ${(x1+x2)/2} ${y2} ${x2} ${y2} L ${x3} ${y3} Q ${(x3+x4)/2} ${y3} ${x4} ${y4}`;
});

const SVG_W = 90;

interface ControlPoint {
  x: number;
  y: number;
  curve: number;
}

const msegPoints = ref<ControlPoint[]>([
  { x: 0.0, y: 0.5, curve: 0.0 },
  { x: 1.0, y: 0.5, curve: 0.0 }
]);

const msegTimeline = ref({
  timeMode: 'sync' as 'sync' | 'sec',
  syncDivision: '1/4',
  secDuration: 2.0,
  projectBpm: 120,
  loopDuration: 0.5
});

const onMsegPointsChange = (pts: ControlPoint[]) => {
  msegPoints.value = pts;
};

const onMsegTimelineChange = (tl: any) => {
  msegTimeline.value = tl;
};

const isNoteActive = ref(false);
const activeMidiNotes = ref<number[]>([]);
const latchEnabled = ref(false);
const currentOctave = ref(4);

const onActiveNotesChange = (notes: number[]) => {
  activeMidiNotes.value = notes;
  isNoteActive.value = notes.length > 0;
};

// ─── Real-time ADSR Phase State Machine ───────────────────────────────────────
const activePhase = ref<'idle' | 'attack' | 'decay' | 'sustain' | 'release'>('idle');
let adsrTimer: any = null;

watch(isNoteActive, (active) => {
  if (adsrTimer) {
    clearTimeout(adsrTimer);
    adsrTimer = null;
  }
  
  if (active) {
    activePhase.value = 'attack';
    const attackMs = Math.max(20, adsr.attack * 1000);
    adsrTimer = setTimeout(() => {
      activePhase.value = 'decay';
      const decayMs = Math.max(20, adsr.decay * 1000);
      adsrTimer = setTimeout(() => {
        activePhase.value = 'sustain';
      }, decayMs);
    }, attackMs);
  } else {
    activePhase.value = 'release';
    const releaseMs = Math.max(20, adsr.release * 1000);
    adsrTimer = setTimeout(() => {
      activePhase.value = 'idle';
    }, releaseMs);
  }
});

// ─── Real-time Scrolling LFO Waves in between knobs ──────────────────────────
const miniWavePhase = ref(0);
let miniWaveTimer: any = null;

const updateMiniWave = () => {
  // Speed scales dynamically with wub rate
  miniWavePhase.value += (wub.rate / 60) * 0.16;
  miniWaveTimer = requestAnimationFrame(updateMiniWave);
};

onMounted(() => {
  miniWaveTimer = requestAnimationFrame(updateMiniWave);
});

onUnmounted(() => {
  if (miniWaveTimer) cancelAnimationFrame(miniWaveTimer);
});

const generateMiniWavePath = (idx: number) => {
  const w = 44;
  const h = 18;
  const points = [];
  const freq = 1.0 + (wub.rate / 10); // scale visual cycles with rate
  const amp = 5.5;
  const midY = h / 2;
  
  for (let x = 0; x <= w; x += 2) {
    const angle = (x / w) * Math.PI * 2 * freq - miniWavePhase.value * (1 + idx * 0.25);
    const y = midY + Math.sin(angle) * amp;
    points.push(`${x},${y}`);
  }
  
  return `M ${points.join(' L ')}`;
};

// ─── Formatting ───────────────────────────────────────────────────────────────
const formatWubDepth = (val: number) => {
  if (wub.depthMode === 0) {
    const hz = val * 16000.0;
    return hz < 1000 ? `${hz.toFixed(0)} Hz` : `${(hz / 1000).toFixed(1)}k Hz`;
  }
  if (wub.depthMode === 1) {
    const semi = val * 60.0;
    return `${semi.toFixed(1)} Semi`;
  }
  const oct = val * 5.0;
  return `${oct.toFixed(2)} Oct`;
};

// ─── JUCE bridge ──────────────────────────────────────────────────────────────
let isUpdating = false;

onMounted(() => {
  if ((window as any).__JUCE__) {
    // Keep routing SVG paths stable across resizes/collapses.
    // We bump `layoutVersion` on resize events so port coordinates are re-sampled.
    if (routingContainer.value) {
      routingResizeObserver = new ResizeObserver(() => bumpRoutingLayout());
      routingResizeObserver.observe(routingContainer.value);
    }
    window.addEventListener('resize', bumpRoutingLayout, { passive: true });

    // Setup 3 Oscillators
    for (let i = 0; i < 3; i++) {
      const idx = i + 1;
      const osc = oscillators[i];
      if (!osc) continue;
      
      const juceActive = Juce.getToggleState(`osc${idx}Active`);
      const juceType   = Juce.getComboBoxState(`osc${idx}Type`);
      const juceLevel  = Juce.getSliderState(`osc${idx}Level`);

      // Initial Sync
      osc.active = juceActive.getValue();
      osc.type   = juceType.getChoiceIndex();
      osc.level  = juceLevel.getScaledValue() * 100;

      // Listeners
      juceActive.valueChangedEvent.addListener(() => { if(!isUpdating) osc.active = juceActive.getValue(); });
      juceType.valueChangedEvent.addListener(() => { if(!isUpdating) osc.type = juceType.getChoiceIndex(); });
      juceLevel.valueChangedEvent.addListener(() => { if(!isUpdating) osc.level = juceLevel.getScaledValue() * 100; });

      // UI Watches (push to JUCE)
      watch(() => osc.active, (v) => { 
        isUpdating = true; juceActive.setValue(v); nextTick(() => isUpdating = false); 
      });
      watch(() => osc.type, (v) => { 
        isUpdating = true; juceType.setChoiceIndex(v); nextTick(() => isUpdating = false); 
      });
      watch(() => osc.level, (v) => { 
        isUpdating = true; juceLevel.setNormalisedValue(v / 100); nextTick(() => isUpdating = false); 
      });
    }

    // Hook up wub params for visualizer
    const wubCenter = Juce.getSliderState('modCenter');
    const wubDepth = Juce.getSliderState('modDepth');
    const wubRate = Juce.getSliderState('modRate');
    const wubActive = Juce.getToggleState('modEnabled');
    const wubResonance = Juce.getSliderState('modResonance');
    const wubFilterType = Juce.getComboBoxState('modFilterType');
    const wubDepthMode = Juce.getComboBoxState('modDepthMode');
    const wubPolarity = Juce.getComboBoxState('modPolarity');
    const wubSlope = Juce.getComboBoxState('modSlope');

    const arpEnabled = Juce.getToggleState('arpEnabled');
    const arpRate = Juce.getComboBoxState('arpRate');
    const arpSwing = Juce.getSliderState('arpSwing');
    const arpMode = Juce.getComboBoxState('arpMode');

    // Init values
    wub.center = wubCenter.getScaledValue();
    wub.depth = wubDepth.getScaledValue();
    wub.rate = wubRate.getScaledValue();
    wub.active = wubActive.getValue();
    wub.reson = wubResonance.getScaledValue();
    wub.filterType = wubFilterType.getChoiceIndex();
    wub.depthMode = wubDepthMode.getChoiceIndex();
    wub.polarity = wubPolarity.getChoiceIndex();
    wub.slope = wubSlope.getChoiceIndex();

    arp.enabled = arpEnabled.getValue();
    arp.rate = arpRate.getChoiceIndex();
    arp.swing = arpSwing.getScaledValue();
    arp.mode = arpMode.getChoiceIndex();

    // Setup listeners
    wubCenter.valueChangedEvent.addListener(() => wub.center = wubCenter.getScaledValue());
    wubDepth.valueChangedEvent.addListener(() => wub.depth = wubDepth.getScaledValue());
    wubRate.valueChangedEvent.addListener(() => wub.rate = wubRate.getScaledValue());
    wubActive.valueChangedEvent.addListener(() => wub.active = wubActive.getValue());
    wubResonance.valueChangedEvent.addListener(() => wub.reson = wubResonance.getScaledValue());
    wubFilterType.valueChangedEvent.addListener(() => wub.filterType = wubFilterType.getChoiceIndex());
    wubDepthMode.valueChangedEvent.addListener(() => wub.depthMode = wubDepthMode.getChoiceIndex());
    wubPolarity.valueChangedEvent.addListener(() => wub.polarity = wubPolarity.getChoiceIndex());
    wubSlope.valueChangedEvent.addListener(() => wub.slope = wubSlope.getChoiceIndex());

    arpRate.valueChangedEvent.addListener(() => arp.rate = arpRate.getChoiceIndex());
    arpMode.valueChangedEvent.addListener(() => arp.mode = arpMode.getChoiceIndex());

    // UI Watches -> JUCE
    watch(() => wub.active, (v) => wubActive.setValue(v));
    watch(() => wub.filterType, (v) => wubFilterType.setChoiceIndex(v));
    watch(() => wub.depthMode, (v) => wubDepthMode.setChoiceIndex(v));
    watch(() => wub.polarity, (v) => wubPolarity.setChoiceIndex(v));
    watch(() => wub.slope, (v) => wubSlope.setChoiceIndex(v));
    
    watch(() => arp.rate, (v) => arpRate.setChoiceIndex(v));
    watch(() => arp.mode, (v) => arpMode.setChoiceIndex(v));
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', bumpRoutingLayout);
  routingResizeObserver?.disconnect();
  routingResizeObserver = null;
});

// ─── Collapsible sections ─────────────────────────────────────────────────────
const collapsed = reactive({
  routing:  false,
  envelope: false,
  wub:      false,
  keyboard: false,
});
const toggle = (key: keyof typeof collapsed) => { collapsed[key] = !collapsed[key]; };
</script>

<template>
  <main class="lattice-bg min-h-screen text-white flex flex-col select-none overflow-y-auto" style="padding: 10px 18px;">

    <!-- ── Header ── -->
    <header class="flex justify-between items-center mb-2 px-2 shrink-0">
      <div>
        <h1 class="text-2xl font-black tracking-tighter lattice-title m-0 leading-none">LATTICE</h1>
        <p class="text-[8px] uppercase tracking-[0.4em] text-white/30 font-bold mt-1">BY SHERD AUDIO</p>
      </div>
    </header>

    <!-- ── Audio Signal strip (slim, always visible) ─────────────────── -->
    <div class="mb-2 shrink-0 rounded-lg overflow-hidden border border-white/5" style="height: 56px;">
      <WaveformInspector 
        :oscillators="oscillators" 
        :is-note-active="isNoteActive"
        :active-notes="activeMidiNotes"
        :arp-enabled="arp.enabled"
        :arp-rate-index="arp.rate"
        :arp-mode="arp.mode"
        :arp-swing="arp.swing"
        :project-bpm="msegTimeline.projectBpm"
      />
    </div>

    <!-- ── Routing area: OSCs ─ SVG ─ Filters ─ Envelope ────────────────── -->
    <div class="panel mb-2 shrink-0">
      <div class="panel-bar" style="background: linear-gradient(90deg,#0055BB,#0099FF,#0055BB);"></div>
      <!-- Section Header -->
      <button class="collapse-header py-0.5" @click="toggle('routing')">
        <span class="section-label mb-0 text-[9px] tracking-[0.25em] text-blue-400">SIGNAL PATCHBAY ROUTING</span>
        <span class="chevron" :class="{ rotated: collapsed.routing }">&#8964;</span>
      </button>
      <!-- Patchbay Content -->
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.routing }">
      <div class="flex gap-0 items-stretch relative" ref="routingContainer">
        <!-- SVG overlay spanning the entire patchbay container -->
        <svg width="100%" height="100%" class="absolute inset-0 pointer-events-none z-30" :key="layoutVersion">
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="2.5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,5 L6,2.5 z" fill="#00e5ff" />
            </marker>
          </defs>
          
          <!-- Existing Connections (Dual layer: neon glow + crisp core) -->
          <template v-for="(set, oi) in Array.from(routing.entries())" :key="oi">
            <template v-for="fi in Array.from(set[1])" :key="fi">
              <!-- Glowing Aura Path -->
              <path
                v-if="getPortPos('osc', set[0]).x !== 0"
                :d="`M ${getPortPos('osc', set[0]).x},${getPortPos('osc', set[0]).y} 
                    C ${getPortPos('osc', set[0]).x + 40},${getPortPos('osc', set[0]).y} 
                      ${getPortPos('filter', fi).x - 40},${getPortPos('filter', fi).y} 
                      ${getPortPos('filter', fi).x},${getPortPos('filter', fi).y}`"
                fill="none"
                stroke="#00e5ff"
                stroke-width="5"
                stroke-opacity="0.18"
              />
              <!-- Sharp Core cable -->
              <path
                v-if="getPortPos('osc', set[0]).x !== 0"
                :d="`M ${getPortPos('osc', set[0]).x},${getPortPos('osc', set[0]).y} 
                    C ${getPortPos('osc', set[0]).x + 40},${getPortPos('osc', set[0]).y} 
                      ${getPortPos('filter', fi).x - 40},${getPortPos('filter', fi).y} 
                      ${getPortPos('filter', fi).x},${getPortPos('filter', fi).y}`"
                fill="none"
                stroke="#00e5ff"
                stroke-width="2"
                stroke-opacity="0.9"
                marker-end="url(#arrow)"
              />
            </template>
          </template>

          <!-- Drag Preview -->
          <path
            v-if="dragMode === 'connect'"
            :d="`M ${getPortPos('osc', dragSourceOsc!).x},${getPortPos('osc', dragSourceOsc!).y} 
                C ${getPortPos('osc', dragSourceOsc!).x + 40},${getPortPos('osc', dragSourceOsc!).y} 
                  ${mousePos.x - 40},${mousePos.y} 
                  ${mousePos.x},${mousePos.y}`"
            fill="none"
            stroke="#00e5ff"
            stroke-width="2.2"
            stroke-dasharray="4 3"
            marker-end="url(#arrow)"
          />
          <path
            v-if="dragMode === 'disconnect'"
            :d="`M ${mousePos.x},${mousePos.y} 
                C ${mousePos.x + 40},${mousePos.y} 
                  ${getPortPos('filter', dragSourceFilter!).x - 40},${getPortPos('filter', dragSourceFilter!).y} 
                  ${getPortPos('filter', dragSourceFilter!).x},${getPortPos('filter', dragSourceFilter!).y}`"
            fill="none"
            stroke="#ef4444"
            stroke-width="2.2"
            stroke-dasharray="4 3"
            marker-end="url(#arrow)"
          />
        </svg>

        <!-- OSCILLATORS column -->
        <div class="flex flex-col gap-1.5 flex-[1.1]">
          <div class="col-header py-1 text-slate-300 text-[9px] tracking-widest font-black uppercase">OSC Audio Sources</div>
          <div 
            v-for="(osc, i) in oscillators" 
            :key="osc.id"
            v-show="osc.visible"
            class="osc-row-container flex items-center justify-between px-2.5 py-1 gap-2.5 border border-white/5 bg-[#050812]/50 hover:bg-[#070b1a]/60 transition-all rounded-lg" 
            :class="[
              osc.active ? '' : 'row-inactive',
              osc.collapsed ? 'h-[36px]' : 'h-[80px]'
            ]"
          >
            <!-- Power Toggle -->
            <button
              class="power-pill shrink-0 scale-90"
              :class="{ 'power-pill-on': osc.active }"
              @click.stop="osc.active = !osc.active"
            >
              <div class="power-pill-knob"></div>
            </button>

            <!-- Label & Collapse Button -->
            <div class="flex items-center gap-1.5 shrink-0" style="min-width: 60px;">
              <span class="row-label text-[9px] font-black text-cyan-400/90 leading-none">{{ (OSC_NAMES[osc.type] ?? 'Sine').slice(0, 3) }}{{ osc.id }}</span>
              <button 
                class="text-[9px] text-white/45 hover:text-white transition-colors"
                @click.stop="osc.collapsed = !osc.collapsed"
                title="Collapse / Expand"
              >
                <span class="chevron inline-block scale-75 align-middle leading-none" :class="{ rotated: osc.collapsed }">&#8964;</span>
              </button>
              <button 
                v-if="i > 0" 
                class="text-[9px] text-white/40 hover:text-red-500 transition-colors"
                @click.stop="removeOscillator(i)"
              >✕</button>
            </div>

            <!-- Spacer to push the port to the right when collapsed -->
            <div v-if="osc.collapsed" class="flex-grow"></div>

            <!-- Collapsible content wrapper -->
            <div v-show="!osc.collapsed" class="flex-1 flex items-center justify-between gap-2.5 min-w-0">
              <!-- Waveform selector compact -->
              <div class="flex p-0.5 bg-black/50 rounded-md border border-white/5 shrink-0 scale-90">
                <button v-for="(name, ti) in OSC_NAMES" :key="ti"
                  class="wave-btn-compact text-[9px]"
                  :class="{ 'wave-btn-compact-active': osc.type === ti }"
                  @click.stop="osc.type = ti"
                >{{ WAVE_ICONS[ti] ?? '∿' }}</button>
              </div>

              <!-- Eventide 3D Volume Fader with VU meter -->
              <div class="flex items-center gap-1.5 flex-1 min-w-[55px] relative px-1 h-5">
                <!-- Deep inset track slot -->
                <div class="level-slider-3d-track flex-1 h-[6px] bg-black/85 rounded-full border border-white/5 relative overflow-hidden shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.95)]">
                  <!-- Glowing linear gradient active level meter inside the track -->
                  <div 
                    class="absolute left-0 top-0 bottom-0 rounded-full transition-all duration-75 bg-gradient-to-r from-[#00e5ff] to-[#6366f1] shadow-[0_0_6px_rgba(0,229,255,0.7)]"
                    :style="{ width: `${osc.level}%`, opacity: osc.active && isNoteActive ? 1.0 : 0.2 }"
                  ></div>
                </div>

                <!-- 3D Metallic Thumb Handle (floats on track at osc.level%) -->
                <div 
                  class="level-slider-3d-thumb absolute w-[9px] h-[14px] rounded bg-gradient-to-b from-[#eeeeee] to-[#888888] border border-white/35 shadow-[0_1.5px_3px_rgba(0,0,0,0.9)] pointer-events-none z-10 -translate-x-1/2"
                  :style="{ left: `calc(4px + ${osc.level}% * 0.78)` }" 
                >
                  <!-- Center slot black notch -->
                  <div class="w-[1px] h-[6px] bg-black/80 mx-auto mt-[3px] rounded-full"></div>
                </div>

                <!-- Transparent overlaid range input for smooth standard drag controls -->
                <input 
                  type="range" 
                  v-model.number="osc.level" 
                  min="0" 
                  max="100" 
                  class="absolute left-1 right-7 w-full h-full opacity-0 cursor-ew-resize z-20" 
                />

                <!-- Dynamic Eventide-inspired VU LED strip -->
                <div class="flex gap-[1px] items-center shrink-0 pr-0.5">
                  <div 
                    v-for="dotIdx in 4" 
                    :key="dotIdx" 
                    class="w-[2.5px] h-[7px] rounded-[0.5px] transition-all duration-75"
                    :class="[
                      osc.active && isNoteActive && (osc.level / 100) * 4 >= dotIdx
                        ? (dotIdx === 4 ? 'bg-red-500 shadow-[0_0_4px_#ef4444]' : dotIdx === 3 ? 'bg-amber-400 shadow-[0_0_4px_#fbbf24]' : 'bg-cyan-400 shadow-[0_0_4px_#22d3ee]')
                        : 'bg-white/5 border border-white/5'
                    ]"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Output Port Jack -->
            <button
              class="port shrink-0 scale-90"
              :class="{ 
                'port-connected': Array.from(routing.get(i) || []).length > 0 
              }"
              :data-osc-port="i"
              @mousedown.stop="startDragFromOsc($event, i)"
            ></button>
          </div>
          
          <!-- Add Oscillator Button -->
          <button 
            v-if="oscillators.some(o => !o.visible)"
            @click="addOscillator"
            class="add-osc-btn h-[24px] rounded-md text-[8.5px] font-black border-dashed border-white/10 hover:border-blue-500/40 bg-white/[0.01] hover:bg-blue-500/[0.04] transition-all m-0 mt-1"
          >
            + ADD OSCILLATOR
          </button>
        </div>

        <!-- SVG Routing Center Spacer -->
        <div class="routing-svg-container min-h-0 relative self-stretch" :style="{ width: SVG_W + 'px', flexShrink: 0 }">
        </div>

        <!-- FILTERS column -->
        <div class="flex flex-col gap-1.5 flex-[1.1]">
          <div class="col-header text-right py-1 text-slate-300 text-[9px] tracking-widest font-black uppercase">Active Filter Matrix</div>
          <div 
            v-for="(flt, i) in filters" 
            :key="flt.id"
            v-show="flt.visible"
            class="osc-row-container flex items-center justify-between px-2.5 py-1 gap-2.5 border border-white/5 bg-[#050812]/50 hover:bg-[#070b1a]/60 transition-all rounded-lg" 
            :class="[
              flt.active ? '' : 'row-inactive',
              flt.collapsed ? 'h-[36px]' : 'h-[80px]'
            ]"
          >
            <!-- Input Port Jack -->
            <button
              class="port shrink-0 scale-90"
              :class="{ 
                'port-connected': Array.from(routing.entries()).some(([_, set]) => set.has(i)),
                'port-target': dragMode === 'connect'
              }"
              :data-filter-port="i"
              @mousedown.stop="startDragFromFilter($event, i)"
            ></button>

            <!-- Power Toggle -->
            <button
              class="power-pill shrink-0 scale-90 mr-0.5"
              :class="{ 'power-pill-on': flt.active }"
              @click.stop="flt.active = !flt.active"
            >
              <div class="power-pill-knob"></div>
            </button>

            <!-- Label & Collapse Button -->
            <div class="flex items-center gap-1.5 shrink-0" style="min-width: 60px;">
              <span class="row-label text-[9px] font-black text-blue-400/90 leading-none">FLT {{ flt.id }}</span>
              <button 
                class="text-[9px] text-white/45 hover:text-white transition-colors"
                @click.stop="flt.collapsed = !flt.collapsed"
                title="Collapse / Expand"
              >
                <span class="chevron inline-block scale-75 align-middle leading-none" :class="{ rotated: flt.collapsed }">&#8964;</span>
              </button>
              <button 
                v-if="i > 0" 
                class="text-[9px] text-white/40 hover:text-red-500 transition-colors"
                @click.stop="removeFilter(i)"
              >✕</button>
            </div>

            <!-- Spacer to push the knobs when collapsed -->
            <div v-if="flt.collapsed" class="flex-grow"></div>

            <!-- Collapsible content wrapper -->
            <div v-show="!flt.collapsed" class="flex-1 flex items-center justify-end gap-2.5 min-w-0">
              <!-- Type Selector compact -->
              <div class="flex p-0.5 bg-black/50 rounded-md border border-white/5 shrink-0 scale-90">
                <button v-for="(name, ti) in FILTER_NAMES" :key="ti"
                  class="wave-btn-compact px-1 text-[8px] font-black text-center"
                  :class="{ 'wave-btn-compact-active': flt.type === ti }"
                  @click.stop="flt.type = ti"
                >{{ name }}</button>
              </div>

              <!-- Knobs inline -->
              <div class="flex gap-2 items-center shrink-0 pl-1">
                <template v-if="i === 0">
                  <JuceKnob id="cutoff" label="" size="compact" />
                  <JuceKnob id="resonance" label="" size="compact" />
                </template>
                <template v-else>
                  <div class="fake-knob-compact"><span>Cut</span></div>
                  <div class="fake-knob-compact"><span>Res</span></div>
                </template>
              </div>
            </div>
          </div>
          
          <!-- Add Filter Button -->
          <button 
            v-if="filters.some(f => !f.visible)"
            @click="addFilter"
            class="add-osc-btn h-[24px] rounded-md text-[8.5px] font-black border-dashed border-white/10 hover:border-blue-500/40 bg-white/[0.01] hover:bg-blue-500/[0.04] transition-all m-0 mt-1"
          >
            + ADD FILTER
          </button>
        </div>

        <!-- ── ENVELOPE column (right of filters) ───────────────────── -->
        <div class="flex flex-col gap-1.5 pl-3 border-l border-white/5" style="min-width: 220px;">
          <div class="col-header py-1 text-slate-300 text-[9px] tracking-widest font-black uppercase">ADSR Envelope</div>

          <!-- Knobs row -->
          <div class="flex items-center justify-between gap-2">
            <JuceKnob id="attack"  label="Attack"  tooltip="Time to reach full volume." @value-change="adsr.attack = $event" />
            <JuceKnob id="decay"   label="Decay"   tooltip="Time to fall to sustain level." @value-change="adsr.decay = $event" />
            <JuceKnob id="sustain" label="Sustain" tooltip="Volume held while key is down." @value-change="adsr.sustain = $event" />
            <JuceKnob id="release" label="Release" tooltip="Fade time after key release." @value-change="adsr.release = $event" />
          </div>

          <!-- Live spline fills remaining height -->
          <div class="flex-1 flex flex-col items-stretch justify-center bg-black/40 rounded-lg border border-white/5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)] px-2 py-1">
            <svg width="100%" height="44" viewBox="0 0 220 65" class="select-none pointer-events-none filter drop-shadow-[0_0_6px_rgba(0,229,255,0.25)]">
              <defs>
                <linearGradient id="adsr-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="rgba(0, 229, 255, 0.18)" />
                  <stop offset="60%" stop-color="rgba(99, 102, 241, 0.08)" />
                  <stop offset="100%" stop-color="rgba(0, 0, 0, 0.0)" />
                </linearGradient>
              </defs>
              <path :d="adsrPath + ' L 210 55 L 10 55 Z'" fill="url(#adsr-grad)" />
              <path :d="adsrPath" fill="none" stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <div class="text-[6.5px] font-black uppercase tracking-[0.25em] text-white/65 text-center select-none mt-0.5">Envelope Shape</div>
          </div>
        </div>

      </div>
      </div>
    </div>

    <!-- ── LFO Filter Modulation panel ─────────────────────────────────── -->
    <div class="panel mb-2 shrink-0">
      <div class="panel-bar" style="background: linear-gradient(90deg,#5500DD,#8800FF,#330088);"></div>
      <button class="collapse-header py-0.5" @click="toggle('wub')">
        <span class="section-label mb-0 text-[9px] tracking-[0.25em] text-purple-400">LFO FILTER MODULATION</span>
        <span class="chevron" :class="{ rotated: collapsed.wub }">&#8964;</span>
      </button>
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.wub }">
      <div class="modulation-panel-row flex gap-3 items-stretch min-h-0">

        <!-- Left: Modulation Sweep knobs + MSEG + mode controls -->
        <div class="flex flex-col gap-2.5 px-2 border-r border-white/5 py-1.5 flex-1 min-w-0">

          <!-- Combined Sweep & Filter Modulation Controls Row (Top) -->
          <div class="shrink-0 flex items-center justify-between gap-2.5 bg-[#050812]/50 px-3 py-2 rounded-xl border border-white/5 select-none">
            <!-- Left Group: Enable switch & Mode (LPF/HPF/BPF) -->
            <div class="flex items-center gap-3">
              <!-- Enable Toggle -->
              <div class="flex flex-col gap-1 items-start">
                <span class="text-[6.5px] font-black uppercase tracking-wider text-slate-400">Wub</span>
                <JuceToggle id="modEnabled" label="" tooltip="Toggle filter modulation." class="scale-95" />
              </div>
              
              <!-- Filter Mode Selector -->
              <div class="flex flex-col gap-1">
                <span class="text-[6.5px] font-black uppercase tracking-wider text-slate-400">Mode</span>
                <div class="flex p-0.5 bg-black/40 rounded border border-white/5">
                  <button v-for="(n, i) in ['LPF', 'HPF', 'BPF']" 
                    :key="i" 
                    class="px-2 py-0.5 rounded text-[7.5px] font-black tracking-widest transition-all border w-10 text-center"
                    :class="wub.filterType === i ? 'bg-blue-600/20 text-blue-400 border-blue-500/30 shadow-[0_0_8px_rgba(37,99,235,0.2)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
                    @click="wub.filterType = i"
                  >{{ n }}</button>
                </div>
              </div>
            </div>

            <!-- Right Group: Depth Knob & Target Settings -->
            <div class="flex items-center gap-2.5 pl-3 border-l border-white/5">
              <!-- Depth Knob (Compact) -->
              <JuceKnob id="modDepth" label="Depth" tooltip="Sweep width or offset amount." :display-formatter="formatWubDepth" @value-change="wub.depth = $event" size="compact" />
              
              <!-- Target Settings (Polarity and Range Unit) -->
              <div class="flex flex-col gap-1 justify-center">
                <!-- Polarity (+ / +/-) -->
                <div class="flex p-[1px] bg-black/40 rounded border border-white/10 shrink-0">
                  <button v-for="(lbl, i) in ['+', '+/-']" :key="'pol'+i"
                    class="py-[1.5px] rounded-[3px] text-[7px] font-black border transition-all w-8 text-center"
                    :class="wub.polarity === i ? 'bg-purple-600/30 text-purple-200 border-purple-500/40 shadow-[0_0_6px_rgba(168,85,247,0.15)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
                    @click="wub.polarity = i"
                  >{{ lbl }}</button>
                </div>
                <!-- Mode (Hz / Semi / Oct) -->
                <div class="flex p-[1px] bg-black/40 rounded border border-white/10 shrink-0">
                  <button v-for="(lbl, i) in ['Hz', 'Semi', 'Oct']" :key="'mod'+i"
                    class="py-[1.5px] rounded-[3px] text-[7px] font-black border transition-all w-9 text-center"
                    :class="wub.depthMode === i ? 'bg-blue-600/30 text-blue-200 border-blue-500/40 shadow-[0_0_6px_rgba(59,130,246,0.15)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
                    @click="wub.depthMode = i"
                  >{{ lbl }}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Modulation Envelope (MSEG) -- expand to fill the rest of the column -->
          <div class="flex-1 border border-white/5 rounded-lg overflow-hidden min-h-0">
            <MsegEditor 
              :mod-mode="wub.modMode"
              :rate="wub.rate"
              :is-note-active="isNoteActive"
              @points-change="onMsegPointsChange"
              @timeline-change="onMsegTimelineChange"
              style="width: 100%; height: 100%;"
            />
          </div>
        </div>

        <!-- Right: SplitEQ Spectral Display with FabFilter-Style floating filter parameters card overlay -->
        <div class="flex flex-col min-h-0 min-w-0 relative" style="flex: 2;">
          <WubVisualizer 
            :center="wub.center" 
            :depth="wub.depth" 
            :depth-mode="wub.depthMode"
            :polarity="wub.polarity"
            :reson="wub.reson"
            :filter-type="wub.filterType"
            :slope="wub.slope"
            :active="wub.active" 
            :is-note-active="isNoteActive"
            :active-notes="activeMidiNotes"
            :oscillators="oscillators"
            :arp-enabled="arp.enabled"
            :arp-rate-index="arp.rate"
            :arp-mode="arp.mode"
            :arp-swing="arp.swing"
            :mod-mode="wub.modMode"
            :rate="wub.rate"
            :points="msegPoints"
            :time-mode="msegTimeline.timeMode"
            :sync-division="msegTimeline.syncDivision"
            :sec-duration="msegTimeline.secDuration"
            :project-bpm="msegTimeline.projectBpm"
            style="flex: 1; min-height: 0; height: 100%;"
          />

          <!-- Floating Filter Parameter Overlay Card (Bottom-Left) -->
          <div class="absolute bottom-[48px] left-3 bg-[#070b12]/92 backdrop-blur-md border border-white/10 rounded-xl px-3.5 py-2 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.95)] flex items-center gap-3 select-none">
            <span class="text-[7.5px] font-black uppercase tracking-widest text-[#00e5ff] mr-1">Filter</span>
            <JuceKnob id="modCenter" label="Cutoff" tooltip="Base frequency for the filter." @value-change="wub.center = $event" size="compact" />
            <JuceKnob id="modResonance" label="Reson" tooltip="Mod filter resonance." @value-change="wub.reson = $event" size="compact" />
            
            <!-- Slope Selector Pills -->
            <div class="flex flex-col gap-1 pl-2.5 border-l border-white/10">
              <span class="text-[6.5px] font-black uppercase tracking-wider text-slate-300">Slope</span>
              <div class="flex p-[1px] bg-black/45 rounded-md border border-white/5">
                <button v-for="(lbl, i) in ['6 dB', '12 dB', '18 dB', '24 dB']" :key="'slope'+i"
                  class="px-1.5 py-[1px] rounded text-[6.5px] font-black transition-all border"
                  :class="wub.slope === i ? 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/30 shadow-[0_0_6px_rgba(0,229,255,0.25)]' : 'text-slate-400 border-transparent hover:text-slate-100 hover:bg-white/5'"
                  @click="wub.slope = i"
                >{{ lbl }}</button>
              </div>
            </div>
          </div>
        </div>

      </div>
      </div>
    </div>


    <!-- ── Keyboard row ────────────────────────────────────────────────── -->
    <div class="panel mb-1 shrink-0">
      <div class="panel-bar" style="background: linear-gradient(90deg,#0077FF,#5500FF); z-index: 10;"></div>
      <button class="collapse-header py-0.5 mb-1" @click="toggle('keyboard')">
        <span class="section-label mb-0 text-[9px] tracking-[0.25em]">KEYBOARD PERFORMANCE</span>
        <span class="chevron" :class="{ rotated: collapsed.keyboard }">&#8964;</span>
      </button>
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.keyboard }">
        <div class="flex flex-col gap-2">
          
          <!-- Arpeggiator / Repeater Section -->
          <div class="px-2 pt-1">
            <div class="flex items-center gap-3 bg-[#02050a]/95 border border-white/5 rounded-lg p-2 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)]">
              <div class="flex flex-col items-center border-r border-white/5 pr-3">
                <span class="text-[7.5px] font-black uppercase tracking-widest text-white/40 mb-1">Repeater</span>
                <JuceToggle id="arpEnabled" label="" tooltip="Enable note repeater." />
              </div>

              <div class="flex flex-col gap-1.5 flex-1 pl-2">
                <!-- Arp Mode -->
                <div class="flex items-center gap-2">
                  <span class="text-[7.5px] font-black uppercase tracking-widest text-white/30 w-10 shrink-0">Mode</span>
                  <div class="flex p-0.5 bg-black/40 rounded-md border border-white/5">
                    <button v-for="(n, i) in ['Repeat', 'Up', 'Down', 'Up/Dn', 'As Played']" :key="'arpm'+i"
                      class="px-2 py-0.5 rounded text-[7.5px] font-black tracking-widest transition-all"
                      :class="arp.mode === i ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_8px_rgba(37,99,235,0.2)]' : 'text-white/50 hover:text-white/80'"
                      @click="arp.mode = i"
                    >{{ n }}</button>
                  </div>
                </div>
                <!-- Arp Rate -->
                <div class="flex items-center gap-2">
                  <span class="text-[7.5px] font-black uppercase tracking-widest text-white/30 w-10 shrink-0">Rate</span>
                  <div class="flex flex-wrap gap-0.5 p-0.5 bg-black/40 rounded-md border border-white/5">
                    <button v-for="(n, i) in ['1/4', '1/8', '1/16', '1/32', '1/4D', '1/8D', '1/16D', '1/4T', '1/8T', '1/16T']" :key="'arpr'+i"
                      class="px-1.5 py-[1px] rounded text-[6.5px] font-black transition-all"
                      :class="arp.rate === i ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'text-white/50 hover:text-white/80'"
                      @click="arp.rate = i"
                    >{{ n }}</button>
                  </div>
                </div>
              </div>
              
              <!-- Octave & Latch Controls (Moved from keyboard) -->
              <div class="flex items-center gap-4 pl-4 border-l border-white/5 ml-2 mr-auto">
                <!-- Latch Toggle -->
                <button 
                  @click="latchEnabled = !latchEnabled" 
                  class="h-7 px-3 flex items-center justify-center rounded text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-200 border shadow-lg"
                  :class="latchEnabled 
                    ? 'bg-[#0077cc]/20 border-[#00d2ff]/40 text-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.15)]' 
                    : 'bg-white/5 border-white/5 text-white/55 hover:bg-white/10 hover:text-white/80'"
                >
                  Latch {{ latchEnabled ? 'ON' : 'OFF' }}
                </button>

                <!-- Octave Controller -->
                <div class="flex items-center gap-2 bg-white/5 p-0.5 rounded border border-white/5 shadow-inner">
                  <button 
                    @click="currentOctave = Math.max(0, currentOctave - 1)" 
                    class="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/65 hover:text-white font-black rounded transition-all active:scale-95 border border-white/5"
                  >-</button>
                  <span class="text-white/40 font-extrabold text-[8px] w-16 text-center uppercase tracking-[0.2em]">OCT {{ currentOctave }}-{{ currentOctave + 1 }}</span>
                  <button 
                    @click="currentOctave = Math.min(7, currentOctave + 1)" 
                    class="w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/65 hover:text-white font-black rounded transition-all active:scale-95 border border-white/5"
                  >+</button>
                </div>
              </div>

              <div class="pl-4">
                <JuceKnob id="arpSwing" label="Swing" tooltip="Swing amount (0-100%)." />
              </div>
            </div>
          </div>

          <!-- Keyboard Row -->
          <div class="flex gap-4 pt-1 pb-1">
            <!-- Legato panel -->
            <div class="flex flex-col items-center justify-center gap-2 shrink-0 w-24 border-r border-white/5 pr-2 scale-90 origin-left">
              <JuceToggle id="legato"   label="Legato" tooltip="Monophonic legato mode." />
              <JuceKnob   id="glideTime" label="Glide"  tooltip="Portamento slide time." />
            </div>
            <!-- Keyboard -->
            <div class="flex-1 min-w-0 flex items-center justify-center h-28">
              <VirtualKeyboard 
                v-model:latch="latchEnabled"
                v-model:octave="currentOctave"
                :arp-mode="arp.mode"
                :arp-enabled="arp.enabled"
                @midi-note-on="isNoteActive = true"
                @midi-note-off="isNoteActive = false"
                @active-notes-change="onActiveNotesChange"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

  </main>
</template>

<style scoped>
/* ── Base ──────────────────────────────────────────────────────────────────── */
.lattice-bg {
  background-color: #030408;
  background-image:
    linear-gradient(rgba(0, 150, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 150, 255, 0.02) 1px, transparent 1px);
  background-size: 32px 32px;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 150, 255, 0.25) transparent;
}
.lattice-bg::-webkit-scrollbar { width: 5px; }
.lattice-bg::-webkit-scrollbar-track { background: transparent; }
.lattice-bg::-webkit-scrollbar-thumb {
  background: rgba(0, 150, 255, 0.25);
  border-radius: 3px;
}
.lattice-bg::-webkit-scrollbar-thumb:hover { background: rgba(0, 229, 255, 0.45); }

.lattice-title {
  background: linear-gradient(90deg, #55ccff, #88ddff, #3399ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 15px rgba(0, 229, 255, 0.4));
}

/* ── Panel ─────────────────────────────────────────────────────────────────── */
.panel {
  padding: 8px 14px 6px;
  border-radius: 8px;
  background: rgba(4, 6, 12, 0.96);
  border: 1px solid rgba(0, 150, 255, 0.12);
  position: relative;
  transition: all 0.3s ease;
}
.panel:hover { border-color: rgba(0, 229, 255, 0.25); }

/* LFO modulation: charts use 80% of row width (20% narrower), centered in remaining space */
.modulation-panel-row {
  height: 408px; /* ~15% shorter than prior 480px layout */
}

.panel-bar {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 2px;
}

/* ── Column headers ────────────────────────────────────────────────────────── */
.col-header {
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(0, 229, 255, 0.4);
}

.section-label {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(80, 160, 255, 0.7);
}

/* ── Oscillator row ───────────────────────────────────────────────────────── */
.osc-row-container {
  background: rgba(6, 10, 20, 0.65);
  border: 1px solid rgba(0, 150, 255, 0.07);
  box-shadow: 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.02);
}

.row-inactive {
  opacity: 0.65;
  filter: grayscale(0.5) brightness(0.8);
}
.row-inactive:hover {
  opacity: 0.95;
  filter: grayscale(0.2) brightness(1.0);
}

.row-label { 
  font-size: 10.5px; 
  font-weight: 900; 
  letter-spacing: 0.12em; 
  color: #00e5ff; 
  white-space: nowrap;
}

/* ── Power Pill Toggle switch ──────────────────────────────────────────────── */
.power-pill {
  width: 24px;
  height: 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  padding: 0 1.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.power-pill-knob {
  width: 7.5px;
  height: 7.5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0,0,0,0.6);
}
.power-pill-on {
  background: rgba(0, 100, 200, 0.35);
  border-color: rgba(0, 229, 255, 0.35);
}
.power-pill-on .power-pill-knob {
  background: #00e5ff;
  transform: translateX(11.5px);
  box-shadow: 0 0 6px rgba(0, 229, 255, 0.9);
}

/* ── Compact wave / filter type buttons ────────────────────────────────────── */
.wave-btn-compact {
  min-width: 20px;
  width: auto;
  padding: 0 6px;
  height: 18px;
  border-radius: 4px;
  background: linear-gradient(to bottom, #0f172a, #05070c);
  border: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.35);
  font-size: 9.5px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.wave-btn-compact:hover {
  background: linear-gradient(to bottom, #1e293b, #0c1122);
  color: #00e5ff;
}
.wave-btn-compact-active {
  background: linear-gradient(to bottom, rgba(0, 229, 255, 0.15), rgba(0, 150, 255, 0.05)) !important;
  border-color: rgba(0, 229, 255, 0.55) !important;
  color: #00e5ff !important;
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05);
  text-shadow: 0 0 4px rgba(0, 229, 255, 0.7);
}

/* ── Jack Socket Port ──────────────────────────────────────────────────────── */
.port {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle, #020408 35%, #181d2c 85%);
  border: 2px solid #3a4869;
  box-shadow: 0 1px 2px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.1);
  cursor: crosshair;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 50;
}
.port::after {
  content: '';
  position: absolute;
  inset: -3.5px;
  border-radius: 50%;
  border: 1px solid transparent;
  transition: all 0.2s;
  pointer-events: none;
}
.port:hover {
  border-color: #00e5ff;
  transform: scale(1.15);
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.6), inset 0 1px 1px rgba(255,255,255,0.2);
}
.port:hover::after {
  border-color: rgba(0, 229, 255, 0.35);
  box-shadow: 0 0 6px rgba(0, 229, 255, 0.2);
}
.port-connected {
  border-color: #00e5ff;
  background: radial-gradient(circle, #005577 25%, #0b1122 85%);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.7), inset 0 1px 1px rgba(255,255,255,0.2);
}
.port-connected::after {
  border-color: rgba(0, 229, 255, 0.45);
  animation: pulse-ring 2.5s infinite;
}
@keyframes pulse-ring {
  0% { transform: scale(1.0); opacity: 0.8; }
  100% { transform: scale(1.4); opacity: 0; }
}

.routing-svg-container {
  position: relative;
  overflow: hidden;
}

/* ── Fake knob compact placeholders ────────────────────────────────────────── */
.fake-knob-compact {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 1.5px dashed rgba(0, 150, 255, 0.12);
  display: flex; align-items: center; justify-content: center;
}
.fake-knob-compact span {
  font-size: 8.5px;
  color: rgba(0, 150, 255, 0.25);
  font-weight: 800;
  text-transform: uppercase;
}

/* ── Add Buttons ───────────────────────────────────────────────────────────── */
.add-osc-btn {
  width: 100%;
  border: 1px dashed rgba(0, 150, 255, 0.15);
  background: rgba(0, 150, 255, 0.01);
  color: #4488aa;
  font-size: 9.5px;
  font-weight: 900;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}
.add-osc-btn:hover {
  background: rgba(0, 150, 255, 0.06);
  border-color: rgba(0, 150, 255, 0.45);
  color: #00e5ff;
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.12);
}

/* ── Collapsible sections ───────────────────────────────────────────────────── */
.collapse-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}
.collapse-header:hover .section-label { color: rgba(100, 229, 255, 0.9); }

.chevron {
  font-size: 14px;
  color: rgba(0, 229, 255, 0.35);
  transition: transform 0.25s ease;
  display: inline-block;
}
.chevron.rotated { transform: rotate(180deg); }

.collapsible {
  overflow: hidden;
  max-height: 500px;
  transition: max-height 0.3s ease, opacity 0.25s ease;
  opacity: 1;
}
.collapsible.is-collapsed {
  max-height: 0;
  opacity: 0;
}
</style>

<style>
/* Global VST Font Size Scale-up for Better Readability */
.text-\[6\.5px\] { font-size: 10px !important; }
.text-\[7px\] { font-size: 10.5px !important; }
.text-\[7\.5px\] { font-size: 11px !important; }
.text-\[8px\] { font-size: 11.5px !important; }
.text-\[8\.5px\] { font-size: 12px !important; }
.text-\[9px\] { font-size: 12.5px !important; }
.text-\[9\.5px\] { font-size: 13px !important; }
.text-\[10px\] { font-size: 13.5px !important; }
.text-\[10\.5px\] { font-size: 14px !important; }
.text-\[11px\] { font-size: 14.5px !important; }
.text-\[11\.5px\] { font-size: 15px !important; }
.text-\[12px\] { font-size: 15.5px !important; }
</style>