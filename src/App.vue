<script setup lang="ts">
import { ref, reactive, watch, onMounted, nextTick } from 'vue';
import * as Juce from 'juce-framework-frontend';
import JuceKnob from './components/JuceKnob.vue';
import JuceToggle from './components/JuceToggle.vue';
import WaveformInspector from './components/WaveformInspector.vue';
import WubVisualizer from './components/WubVisualizer.vue';
import VirtualKeyboard from './components/VirtualKeyboard.vue';

// ─── Waveform inspector ───────────────────────────────────────────────────────
const showWaveform = ref(true);

// ─── Wub Visualizer state ─────────────────────────────────────────────────────
const wub = reactive({
  active: true, // Enabled by default for better screenshots/demo
  rate: 45,
  depth: 60,
  center: 440,
  reson: 0.5,
  filterType: 0 // 0: LPF, 1: BPF
});

// ─── Oscillator state ─────────────────────────────────────────────────────────
const OSC_NAMES = ['Sine', 'Saw', 'Square'];
const FILTER_NAMES = ['LPF', 'HPF', 'BPF'];
const WAVE_ICONS = ['∿', '⊿', '⊓'];

const oscillators = reactive([
  { id: 1, active: true,  type: 0, level: 80, collapsed: false },
  { id: 2, active: false, type: 1, level: 60, collapsed: false },
  { id: 3, active: false, type: 2, level: 40, collapsed: false },
]);

const filters = reactive([
  { id: 1, active: true,  type: 0, collapsed: false },
  { id: 2, active: false, type: 0, collapsed: false },
  { id: 3, active: false, type: 1, collapsed: false },
]);

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
  const portEl = document.querySelector(selector);
  if (!portEl) return { x: 0, y: 0 };

  const portRect = portEl.getBoundingClientRect();
  const containerRect = routingContainer.value.getBoundingClientRect();
  
  return {
    x: (portRect.left + portRect.width / 2) - containerRect.left,
    y: (portRect.top + portRect.height / 2) - containerRect.top
  };
};

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

const SVG_W = 140;

// ─── JUCE bridge ──────────────────────────────────────────────────────────────
let isUpdating = false;

onMounted(() => {
  if ((window as any).__JUCE__) {
    // Setup 3 Oscillators
    for (let i = 0; i < 3; i++) {
      const idx = i + 1;
      const osc = oscillators[i];
      
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
    const wubCenter = Juce.getSliderState('wubCenter');
    const wubDepth = Juce.getSliderState('wubDepth');
    const wubRate = Juce.getSliderState('wubRate');
    const wubActive = Juce.getToggleState('wubEnabled');

    wub.center = wubCenter.getScaledValue();
    wub.depth = wubDepth.getScaledValue();
    wub.rate = wubRate.getScaledValue();
    wub.active = wubActive.getValue();

    wubCenter.valueChangedEvent.addListener(() => wub.center = wubCenter.getScaledValue());
    wubDepth.valueChangedEvent.addListener(() => wub.depth = wubDepth.getScaledValue());
    wubRate.valueChangedEvent.addListener(() => wub.rate = wubRate.getScaledValue());
    wubActive.valueChangedEvent.addListener(() => wub.active = wubActive.getValue());

    // Wub UI Watches
    watch(() => wub.active, (v) => wubActive.setValue(v));
  }
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
  <main class="lattice-bg min-h-screen text-white flex flex-col select-none overflow-y-auto" style="padding: 20px 28px;">

    <!-- ── Header ── -->
    <header class="flex justify-between items-center mb-8 px-2">
      <div>
        <h1 class="text-4xl font-black tracking-tighter lattice-title m-0">LATTICE</h1>
        <p class="text-[10px] uppercase tracking-[0.4em] text-white/30 font-bold mt-1">BY SHERD AUDIO</p>
      </div>
      <button 
        @click="showWaveform = !showWaveform"
        class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-lg"
        :style="showWaveform 
          ? 'background: rgba(0,130,255,0.25); border: 1px solid rgba(0,180,255,0.5); color: #88DDFF; box-shadow: 0 0 15px rgba(0,140,255,0.2);'
          : 'background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #4466AA;'"
      >
        <span>◉</span> Waveform
      </button>
    </header>

    <!-- ── Waveform Inspector ───────────────────────────────────────────── -->
    <Transition name="wave-fade">
      <div v-if="showWaveform" class="mb-4">
        <WaveformInspector :oscillators="oscillators" />
      </div>
    </Transition>

    <!-- ── Routing area: OSCs ─ SVG ─ Filters ─────────────────────────── -->
    <div class="panel mb-4">
      <div class="panel-bar" style="background: linear-gradient(90deg,#0055BB,#0099FF,#0055BB);"></div>
      <!-- Collapse header -->
      <button class="collapse-header" @click="toggle('routing')">
        <span class="section-label mb-0">SIGNAL ROUTING</span>
        <span class="chevron" :class="{ rotated: collapsed.routing }">&#8964;</span>
      </button>
      <!-- Collapsible content -->
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.routing }">
        <div class="flex gap-0 pt-2">

          <!-- OSCILLATORS column -->
          <div class="flex flex-col gap-0 flex-1">
            <div class="col-header">OSCILLATORS</div>
            <div 
              v-for="(osc, i) in oscillators" 
              :key="osc.id"
              class="osc-row-container" 
              :class="{ 'osc-collapsed': osc.collapsed, 'row-inactive': !osc.active }"
            >
              <!-- OSC Row Header -->
              <div class="osc-row-header" @click="osc.collapsed = !osc.collapsed">
                <button
                  class="led-btn mr-3"
                  :style="osc.active ? 'background:#0099FF; box-shadow: 0 0 8px #0099FF;' : 'background:#112233;'"
                  @click.stop="osc.active = !osc.active"
                ></button>
                <span class="row-label">{{ OSC_NAMES[osc.type] }} {{ osc.id }}</span>
                <span class="chevron ml-auto" :class="{ rotated: osc.collapsed }">&#8964;</span>
                
                <!-- Output Port -->
                <button
                  class="port ml-3"
                  :class="{ 
                    'port-connected': Array.from(routing.get(i) || []).length > 0 
                  }"
                  :data-osc-port="i"
                  @mousedown.stop="startDragFromOsc($event, i)"
                ></button>
              </div>
              
              <!-- OSC Row Content -->
              <div class="osc-row-content" v-if="!osc.collapsed">
                <div class="flex items-center w-full px-4 py-3 gap-6">
                  <!-- Waveform selector -->
                  <div class="flex gap-2">
                    <button v-for="(name, ti) in OSC_NAMES" :key="ti"
                      class="wave-btn"
                      :class="{ 'wave-btn-active': osc.type === ti }"
                      @click.stop="osc.type = ti"
                    >{{ WAVE_ICONS[ti] }}</button>
                  </div>
                  
                  <!-- Level -->
                  <div class="flex flex-col gap-1 flex-1">
                    <span class="text-[8px] uppercase tracking-widest text-white/20 font-bold">Volume</span>
                    <input type="range" class="level-slider" v-model.number="osc.level" min="0" max="100" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SVG Routing Center -->
          <div class="routing-svg-container" :style="{ width: SVG_W + 'px' }" ref="routingContainer">
            <svg :width="SVG_W" :height="600" class="pointer-events-none" :key="layoutVersion">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L8,3 z" fill="#0088FF" />
                </marker>
              </defs>
              
              <!-- Existing Connections -->
              <template v-for="(set, oi) in Array.from(routing.entries())" :key="oi">
                <template v-for="fi in Array.from(set[1])" :key="fi">
                  <path
                    v-if="getPortPos('osc', set[0]).x !== 0"
                    :d="`M ${Math.max(0, getPortPos('osc', set[0]).x)},${getPortPos('osc', set[0]).y} 
                        C ${Math.max(0, getPortPos('osc', set[0]).x) + 30},${getPortPos('osc', set[0]).y} 
                          ${Math.min(SVG_W, getPortPos('filter', fi).x) - 30},${getPortPos('filter', fi).y} 
                          ${Math.min(SVG_W, getPortPos('filter', fi).x)},${getPortPos('filter', fi).y}`"
                    fill="none"
                    stroke="#0088FF"
                    stroke-width="2"
                    stroke-opacity="0.8"
                    marker-end="url(#arrow)"
                  />
                </template>
              </template>

              <!-- Drag Preview -->
              <path
                v-if="dragMode === 'connect'"
                :d="`M ${Math.max(0, getPortPos('osc', dragSourceOsc!).x)},${getPortPos('osc', dragSourceOsc!).y} 
                    C ${Math.max(0, getPortPos('osc', dragSourceOsc!).x) + 30},${getPortPos('osc', dragSourceOsc!).y} 
                      ${Math.min(SVG_W, mousePos.x) - 30},${mousePos.y} 
                      ${Math.min(SVG_W, mousePos.x)},${mousePos.y}`"
                fill="none"
                stroke="#0099FF"
                stroke-width="2"
                stroke-dasharray="4 4"
                marker-end="url(#arrow)"
              />
              <path
                v-if="dragMode === 'disconnect'"
                :d="`M ${Math.max(0, mousePos.x)},${mousePos.y} 
                    C ${Math.max(0, mousePos.x) + 30},${mousePos.y} 
                      ${Math.min(SVG_W, getPortPos('filter', dragSourceFilter!).x) - 30},${getPortPos('filter', dragSourceFilter!).y} 
                      ${Math.min(SVG_W, getPortPos('filter', dragSourceFilter!).x)},${getPortPos('filter', dragSourceFilter!).y}`"
                fill="none"
                stroke="#FF4444"
                stroke-width="2"
                stroke-dasharray="4 4"
                marker-end="url(#arrow)"
              />
            </svg>
          </div>

          <!-- FILTERS column -->
          <div class="flex flex-col gap-0 flex-1">
            <div class="col-header text-right">FILTERS</div>
            <div 
              v-for="(flt, i) in filters" 
              :key="flt.id"
              class="osc-row-container" 
              :class="{ 'osc-collapsed': flt.collapsed, 'row-inactive': !flt.active }"
            >
              <!-- Filter Row Header -->
              <div class="osc-row-header flex-row-reverse" @click="flt.collapsed = !flt.collapsed">
                <button
                  class="led-btn ml-3"
                  :style="flt.active ? 'background:#0099FF; box-shadow: 0 0 8px #0099FF;' : 'background:#112233;'"
                  @click.stop="flt.active = !flt.active"
                ></button>
                <span class="row-label">FILTER {{ flt.id }}</span>
                <span class="text-[9px] mr-2 opacity-40 uppercase tracking-tighter" v-if="flt.collapsed">
                  {{ FILTER_NAMES[flt.type] }}
                </span>
                <span class="chevron mr-auto" :class="{ rotated: flt.collapsed }">&#8964;</span>
                
                <!-- Input Port -->
                <button
                  class="port mr-3"
                  :class="{ 
                    'port-connected': Array.from(routing.entries()).some(([_, set]) => set.has(i)),
                    'port-target': dragMode === 'connect'
                  }"
                  :data-filter-port="i"
                  @mousedown.stop="startDragFromFilter($event, i)"
                ></button>
              </div>

              <!-- Filter Row Content -->
              <div class="osc-row-content" v-if="!flt.collapsed">
                <div class="flex items-center justify-between w-full px-6 py-3 gap-8">
                  <!-- Type selector -->
                  <div class="flex gap-2">
                    <button v-for="(name, ti) in FILTER_NAMES" :key="ti"
                      class="filter-type-btn"
                      :class="{ 'filter-type-active': flt.type === ti }"
                      @click.stop="flt.type = ti"
                    >{{ name }}</button>
                  </div>
                  
                  <!-- Knobs -->
                  <div class="flex gap-10 pr-4">
                    <template v-if="i === 0">
                      <JuceKnob id="cutoff" label="Cut" />
                      <JuceKnob id="resonance" label="Res" />
                    </template>
                    <template v-else>
                      <div class="fake-knob"><span>Cut</span></div>
                      <div class="fake-knob"><span>Res</span></div>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- ── Envelope + WUB row (one collapsible section) ──────────────────── -->
    <div class="panel mb-4">
      <div class="panel-bar" style="background: linear-gradient(90deg,#00AAFF,#0055DD,#006688);"></div>
      <button class="collapse-header" @click="toggle('envelope')">
        <span class="section-label mb-0">ENVELOPE &amp; WUB</span>
        <span class="chevron" :class="{ rotated: collapsed.envelope }">&#8964;</span>
      </button>
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.envelope }">
        <div class="flex gap-0 pt-6 pb-4"> <!-- Consistent padding -->
          
          <!-- Envelope Section -->
          <div class="flex-1 px-4">
            <div class="col-header mb-6">ENVELOPE</div>
            <div class="flex justify-between items-center gap-2">
              <JuceKnob id="attack"  label="Attack"  tooltip="Time to reach full volume." />
              <JuceKnob id="decay"   label="Decay"   tooltip="Time to fall to sustain level." />
              <JuceKnob id="sustain" label="Sustain" tooltip="Volume held while key is down." />
              <JuceKnob id="release" label="Release" tooltip="Fade time after key release." />
            </div>
          </div>

          <!-- Vertical Divider -->
          <div class="w-[1px] self-stretch bg-white/5 my-2"></div>

          <!-- Wub Generator Section -->
          <div class="flex-[1.5] px-8">
            <div class="flex justify-between items-end mb-6">
              <div>
                <div class="col-header mb-0">WUB GENERATOR</div>
                <div class="text-[9px] text-white/20 uppercase tracking-widest mt-1">LFO Filter Modulation</div>
              </div>
              <div class="flex items-center gap-3 bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                <span class="text-[9px] font-black uppercase tracking-widest text-white/30">Master Enable</span>
                <JuceToggle id="wubEnabled" label="" tooltip="Toggle LFO wub effect." />
              </div>
            </div>
            
            <div class="mb-8">
              <WubVisualizer 
                :center="wub.center" 
                :depth="wub.depth" 
                :rate="wub.rate" 
                :active="wub.active" 
              />
            </div>

            <div class="flex justify-between items-center gap-4">
              <JuceKnob id="wubRate"      label="Rate"   tooltip="LFO speed in Hz." />
              <JuceKnob id="wubDepth"     label="Depth"  tooltip="Sweep width around center." />
              <JuceKnob id="wubCenter"    label="Center" tooltip="Base frequency for the sweep." />
              <JuceKnob id="wubResonance" label="Reson"  tooltip="Wub filter resonance." />
              
              <div class="flex flex-col gap-2 items-center min-w-[80px]">
                <span class="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Filter Mode</span>
                <div class="flex p-1 bg-black/40 rounded-lg border border-white/5">
                  <button v-for="(n, i) in ['LPF','BPF']" 
                    :key="i" 
                    class="px-3 py-1 rounded-md text-[10px] font-black tracking-widest transition-all"
                    :class="wub.filterType === i ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_10px_rgba(37,99,235,0.2)]' : 'text-white/20 hover:text-white/40'"
                    @click="wub.filterType = i"
                  >
                    {{ n }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- ── Keyboard row ────────────────────────────────────────────────── -->
    <div class="panel">
      <div class="panel-bar" style="background: linear-gradient(90deg,#0077FF,#5500FF);"></div>
      <button class="collapse-header" @click="toggle('keyboard')">
        <span class="section-label mb-0">KEYBOARD</span>
        <span class="chevron" :class="{ rotated: collapsed.keyboard }">&#8964;</span>
      </button>
      <div class="collapsible" :class="{ 'is-collapsed': collapsed.keyboard }">
        <div class="flex gap-4 pt-6 pb-2"> <!-- Added more top padding for visual breathing room -->
          <!-- Legato panel -->
          <div class="flex flex-col items-center justify-center gap-8 shrink-0 w-28 border-r border-white/5">
            <JuceToggle id="legato"   label="Legato" tooltip="Monophonic legato mode." />
            <JuceKnob   id="glideTime" label="Glide"  tooltip="Portamento slide time." />
          </div>
          <!-- Keyboard -->
          <div class="flex-1 min-w-0 flex items-center justify-center">
            <VirtualKeyboard />
          </div>
        </div>
      </div>
    </div>

  </main>
</template>

<style scoped>
/* ── Base ──────────────────────────────────────────────────────────────────── */
.lattice-bg {
  background-color: #030308;
  background-image:
    linear-gradient(rgba(0, 100, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 100, 255, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
}

.lattice-title {
  background: linear-gradient(90deg, #55AAFF, #88CCFF, #3388FF);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(0, 140, 255, 0.35));
}

/* ── Panel ─────────────────────────────────────────────────────────────────── */
.panel {
  padding: 24px 20px 16px; /* Increased top padding to clear the panel-bar */
  border-radius: 14px;
  background: rgba(5, 8, 22, 0.94);
  border: 1px solid rgba(0, 100, 255, 0.16);
  position: relative;
  transition: all 0.3s ease;
}
.panel:hover { border-color: rgba(0, 130, 255, 0.25); }

.panel-bar {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 2px;
}

.wub-bar {
  background: linear-gradient(90deg, #0077FF, #00DDFF, #0055FF, #00AAFF, #0077FF);
  background-size: 300% 100%;
  animation: wub-shift 5s linear infinite;
}
@keyframes wub-shift {
  0%   { background-position: 0% 0%; }
  100% { background-position: 300% 0%; }
}

/* ── Column headers ────────────────────────────────────────────────────────── */
.col-header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: rgba(0, 130, 255, 0.45);
  padding: 4px 0 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(80, 160, 255, 0.6);
  margin-bottom: 12px;
}

/* ── Oscillator row ───────────────────────────────────────────────────────── */
.osc-row-container {
  background: rgba(10, 20, 40, 0.4);
  border: 1px solid rgba(0, 100, 255, 0.1);
  border-radius: 12px;
  margin-bottom: 8px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 120px;
}

.osc-collapsed {
  min-height: 40px !important;
}

.osc-row-header {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(0, 100, 255, 0.05);
}

.osc-row-content {
  padding: 16px 0 20px 0;
  display: flex;
  align-items: center;
}

.filter-row {
  height: 88px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid rgba(0, 100, 255, 0.05);
}

.row-inactive {
  opacity: 0.8;
  filter: grayscale(0.9) brightness(0.7);
}

.row-inactive .row-label {
  color: rgba(255, 255, 255, 0.6);
}

.row-inactive .wave-btn, 
.row-inactive .filter-type-btn {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.4);
}

.row-inactive:hover {
  opacity: 0.95;
  filter: grayscale(0.5) brightness(0.9);
}
.row-label { 
  font-size: 11px; 
  font-weight: 800; 
  letter-spacing: 0.15em; 
  color: #55AAFF; 
  white-space: nowrap;
}

/* ── LED toggle button ─────────────────────────────────────────────────────── */
.led-btn {
  width: 10px; height: 10px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s, box-shadow 0.2s;
}

/* ── Waveform / filter type buttons ────────────────────────────────────────── */
.wave-btn, .filter-type-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  color: #446688;
  font-size: 10px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  cursor: pointer;
}

.wave-btn:hover, .filter-type-btn:hover {
  background: rgba(255,255,255,0.06);
  color: #88AACC;
}

.wave-btn-active, .filter-type-active {
  background: rgba(0,120,255,0.15) !important;
  border-color: rgba(0,180,255,0.4) !important;
  color: #00AAFF !important;
  box-shadow: 0 0 15px rgba(0,130,255,0.2);
}

.filter-type-btn {
  width: auto;
  padding: 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* ── Port (routing node) ───────────────────────────────────────────────────── */
.port {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #0f172a;
  border: 2px solid #1e293b;
  cursor: crosshair;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 50;
}

.port:hover {
  background: #1e293b;
  border-color: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
  transform: scale(1.1);
}

.port-connected {
  background: #1e3a8a;
  border-color: #3b82f6;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.6), inset 0 0 4px rgba(0,0,0,0.5);
}

.port-target {
  from { box-shadow: 0 0 4px rgba(0, 180, 255, 0.3); }
  to   { box-shadow: 0 0 12px rgba(0, 180, 255, 0.7); }
}

/* ── SVG routing container ─────────────────────────────────────────────────── */
.routing-svg-container {
  position: relative;
  overflow: hidden;
}

/* ── Wave cycle button (single click-to-cycle per OSC row) ─────────────────── */
.wave-cycle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid rgba(0, 120, 255, 0.3);
  background: rgba(0, 30, 80, 0.7);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.wave-cycle-btn:hover {
  border-color: rgba(0, 160, 255, 0.6);
  background: rgba(0, 50, 120, 0.7);
}
.wave-cycle-btn:active { transform: scale(0.96); }

.wave-icon {
  font-size: 15px;
  color: #33AAFF;
  line-height: 1;
}
.wave-name {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(80, 160, 255, 0.7);
}

/* ── Level slider ──────────────────────────────────────────────────────────── */
.level-slider {
  -webkit-appearance: none;
  width: 72px; height: 3px;
  background: rgba(0, 80, 180, 0.4);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.level-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #0099FF;
  box-shadow: 0 0 6px #0099FF;
}

/* ── Fake knob (unconnected filter placeholders) ───────────────────────────── */
.fake-knob {
  width: 44px; height: 44px;
  border-radius: 50%;
  border: 2px dashed rgba(0, 80, 180, 0.25);
  display: flex; align-items: center; justify-content: center;
}
.fake-knob span {
  font-size: 9px;
  color: rgba(0, 100, 200, 0.3);
  letter-spacing: 0.1em;
}

/* ── Waveform inspector transition ─────────────────────────────────────────── */
.wave-fade-enter-active, .wave-fade-leave-active { transition: all 0.2s ease; }
.wave-fade-enter-from, .wave-fade-leave-to { opacity: 0; transform: scaleY(0.8); transform-origin: top; }

/* ── Collapsible sections ───────────────────────────────────────────────────── */
.collapse-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0 10px; /* Reduced top padding as the panel now has it */
  color: inherit;
}
.collapse-header:hover .section-label { color: rgba(100, 180, 255, 0.9); }

.chevron {
  font-size: 18px;
  color: rgba(0, 120, 255, 0.4);
  transition: transform 0.25s ease;
  display: inline-block;
  line-height: 1;
}
.chevron.rotated { transform: rotate(180deg); }

.collapsible {
  overflow: hidden;
  max-height: 600px;
  transition: max-height 0.3s ease, opacity 0.25s ease;
  opacity: 1;
}
.collapsible.is-collapsed {
  max-height: 0;
  opacity: 0;
}
</style>