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
const wubParams = reactive({
  center: 500,
  depth: 0.5,
  rate: 1.0,
  active: false
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
// routing[oscIdx] = Set of filterIdx
const routing = reactive<Map<number, Set<number>>>(
  new Map([[0, new Set([0])]])
);
const selectedOsc = ref<number | null>(null);

const isConnected = (o: number, f: number) => routing.get(o)?.has(f) ?? false;

const clickOscPort = (i: number) => {
  selectedOsc.value = selectedOsc.value === i ? null : i;
};

const clickFilterPort = (f: number) => {
  const o = selectedOsc.value;
  if (o === null) return;
  if (!routing.has(o)) routing.set(o, new Set());
  const set = routing.get(o)!;
  set.has(f) ? set.delete(f) : set.add(f);
  selectedOsc.value = null;
};

// Compute SVG routing lines
const SVG_W = 120;
const ROW_H = 104;
const COLLAPSED_H = 32;

const rowY = (i: number, isFilter: boolean = false) => {
  let y = 0;
  const list = isFilter ? filters : oscillators;
  for (let j = 0; j < i; j++) {
    y += list[j].collapsed ? COLLAPSED_H : ROW_H;
  }
  const currentH = list[i].collapsed ? COLLAPSED_H : ROW_H;
  return y + currentH / 2;
};

// ─── JUCE bridge ──────────────────────────────────────────────────────────────
let juceOscCombo: any = null;
let isUpdating = false;

onMounted(() => {
  if ((window as any).__JUCE__) {
    juceOscCombo = Juce.getComboBoxState('oscType');
    
    // Initial sync
    const initial = juceOscCombo.getChoiceIndex();
    oscillators[0].type = initial;

    // Listen for JUCE changes (automation, preset, etc.)
    juceOscCombo.valueChangedEvent.addListener(() => {
      const incoming = juceOscCombo.getChoiceIndex();
      if (incoming !== oscillators[0].type) {
        isUpdating = true;
        oscillators[0].type = incoming;
        // Wait for Vue to finish its reactive cycle before allowing watch to talk back
        nextTick(() => { isUpdating = false; });
      }
    });

    // Hook up wub params for visualizer
    const wubCenter = Juce.getSliderState('wubCenter');
    const wubDepth = Juce.getSliderState('wubDepth');
    const wubRate = Juce.getSliderState('wubRate');
    const wubActive = Juce.getToggleState('wubEnabled');

    wubParams.center = wubCenter.getScaledValue();
    wubParams.depth = wubDepth.getScaledValue();
    wubParams.rate = wubRate.getScaledValue();
    wubParams.active = wubActive.getValue();

    wubCenter.valueChangedEvent.addListener(() => wubParams.center = wubCenter.getScaledValue());
    wubDepth.valueChangedEvent.addListener(() => wubParams.depth = wubDepth.getScaledValue());
    wubRate.valueChangedEvent.addListener(() => wubParams.rate = wubRate.getScaledValue());
    wubActive.valueChangedEvent.addListener(() => wubParams.active = wubActive.getValue());
  }
});

watch(() => oscillators[0].type, (t) => {
  if (juceOscCombo && !isUpdating) {
    // Only send to JUCE if JUCE doesn't already have this value
    if (juceOscCombo.getChoiceIndex() !== t) {
      juceOscCombo.setChoiceIndex(t);
    }
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

    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="flex items-center justify-between mb-4">
      <div>
        <h1 class="lattice-title text-5xl font-black tracking-tighter">LATTICE</h1>
        <p class="text-[11px] tracking-[0.35em] uppercase mt-1" style="color: rgba(80,160,255,0.5);">by Sherd Audio</p>
      </div>

      <!-- Waveform toggle -->
      <button
        @click="showWaveform = !showWaveform"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all"
        :style="showWaveform
          ? 'background: rgba(0,130,255,0.18); border: 1px solid rgba(0,150,255,0.4); color: #55BBFF;'
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
              <div class="osc-row-header" @click="osc.collapsed = !osc.collapsed">
                <button
                  class="led-btn mr-3"
                  :style="osc.active ? 'background:#0099FF; box-shadow: 0 0 8px #0099FF;' : 'background:#112233;'"
                  @click.stop="osc.active = !osc.active"
                ></button>
                <span class="row-label">OSC {{ osc.id }}</span>
                <span class="text-[9px] ml-2 opacity-40 uppercase tracking-tighter" v-if="osc.collapsed">
                  {{ OSC_NAMES[osc.type] }} @ {{ osc.level }}%
                </span>
                <span class="chevron ml-auto" :class="{ rotated: osc.collapsed }">&#8964;</span>
                
                <!-- Port stays in header so routing works when collapsed -->
                <button
                  class="port ml-3"
                  :class="{ 'port-selected': selectedOsc === i, 'port-connected': [...(routing.get(i) ?? [])].length > 0 }"
                  @click.stop="clickOscPort(i)"
                ></button>
              </div>

              <div class="osc-row-content" v-if="!osc.collapsed">
                <div class="flex items-center w-full px-2 py-3 gap-4">
                  <!-- Waveform selector -->
                  <div class="flex gap-1">
                    <button
                      v-for="(icon, wi) in WAVE_ICONS"
                      :key="wi"
                      class="wave-btn"
                      :class="{ 'wave-btn-active': osc.type === wi }"
                      @click.stop="osc.type = wi"
                    >{{ icon }}</button>
                  </div>

                  <!-- Level slider -->
                  <div class="flex items-center gap-1 ml-auto">
                    <span class="text-[10px] tracking-widest" style="color:#335577;">LVL</span>
                    <input type="range" min="0" max="100" :value="osc.level"
                      @input="osc.level = +($event.target as HTMLInputElement).value"
                      class="level-slider" />
                    <span class="text-[10px] w-7 text-right font-mono" style="color:#4488AA;">{{ osc.level }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SVG Routing lines -->
          <div class="routing-svg-container">
            <div class="col-header text-center" style="color: rgba(0,120,200,0.4); font-size:10px;">ROUTING</div>
            <svg :width="SVG_W" :height="Math.max(oscillators.reduce((sum, o) => sum + (o.collapsed ? COLLAPSED_H : ROW_H), 0), filters.reduce((sum, f) => sum + (f.collapsed ? COLLAPSED_H : ROW_H), 0))" class="overflow-visible">
              <defs>
                <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#0099FF" opacity="0.7"/>
                </marker>
              </defs>
              <template v-for="(osc, oi) in oscillators" :key="oi">
                <template v-for="(flt, fi) in filters" :key="fi">
                  <path
                    v-if="isConnected(oi, fi)"
                    :d="`M 0,${rowY(oi)} C ${SVG_W*0.4},${rowY(oi)} ${SVG_W*0.6},${rowY(fi, true)} ${SVG_W},${rowY(fi, true)}`"
                    fill="none"
                    stroke="#0088FF"
                    stroke-width="1.5"
                    stroke-opacity="0.6"
                    marker-end="url(#arrow)"
                  />
                </template>
              </template>
              <!-- Hint when an osc is selected -->
              <template v-if="selectedOsc !== null">
                <line
                  v-for="(flt, fi) in filters" :key="fi"
                  :x1="0" :y1="rowY(selectedOsc)"
                  :x2="SVG_W" :y2="rowY(fi, true)"
                  stroke="#0099FF" stroke-width="1" stroke-opacity="0.15" stroke-dasharray="4 4"
                />
              </template>
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
                    'port-target': selectedOsc !== null, 
                    'port-connected': oscillators.some((_, oi) => isConnected(oi, i)) 
                  }"
                  @click.stop="clickFilterPort(i)"
                ></button>
              </div>

              <!-- Filter Row Content -->
              <div class="osc-row-content" v-if="!flt.collapsed">
                <div class="flex items-center w-full px-4 py-3 gap-4">
                  <!-- Filter type selector -->
                  <div class="flex gap-1">
                    <button v-for="(name, ti) in FILTER_NAMES" :key="ti"
                      class="wave-btn text-[10px]"
                      :class="{ 'wave-btn-active': flt.type === ti }"
                      @click.stop="flt.type = ti"
                    >{{ name }}</button>
                  </div>

                  <!-- Cutoff + Resonance -->
                  <div class="flex items-center gap-4 ml-auto" v-if="i === 0">
                    <JuceKnob id="cutoff"    label="Cut" tooltip="Filter cutoff frequency." />
                    <JuceKnob id="resonance" label="Res" tooltip="Filter resonance / squelch." />
                  </div>
                  <div class="flex items-center gap-4 ml-auto" v-else>
                    <div class="fake-knob"><span>Cut</span></div>
                    <div class="fake-knob"><span>Res</span></div>
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
        <div class="flex gap-4 pt-3">

          <!-- Envelope -->
          <div class="flex-1">
            <div class="col-header">ENVELOPE</div>
            <div class="flex justify-around items-center">
              <JuceKnob id="attack"  label="Attack"  tooltip="Time to reach full volume." />
              <JuceKnob id="decay"   label="Decay"   tooltip="Time to fall to sustain level." />
              <JuceKnob id="sustain" label="Sustain" tooltip="Volume held while key is down." />
              <JuceKnob id="release" label="Release" tooltip="Fade time after key release." />
            </div>
          </div>

          <!-- Divider -->
          <div style="width:1px; background: rgba(0,100,200,0.15); margin: 8px 0;"></div>

          <!-- WUB -->
          <div class="flex-[1.6]">
            <div class="flex items-center gap-4 mb-2">
              <div class="col-header mb-0">WUB GENERATOR</div>
              <JuceToggle id="wubEnabled" label="Enable" tooltip="Toggle LFO wub effect." />
            </div>
            
            <div class="mb-4 px-2">
              <WubVisualizer 
                :center="wubParams.center" 
                :depth="wubParams.depth" 
                :rate="wubParams.rate" 
                :active="wubParams.active" 
              />
            </div>

            <div class="flex justify-around items-center">
              <JuceKnob id="wubRate"      label="Rate"   tooltip="LFO speed in Hz." />
              <JuceKnob id="wubDepth"     label="Depth"  tooltip="Sweep width around center." />
              <JuceKnob id="wubCenter"    label="Center" tooltip="Base frequency for the sweep." />
              <JuceKnob id="wubResonance" label="Reson"  tooltip="Wub filter resonance." />
              <div class="flex flex-col gap-1 items-center">
                <span class="text-[9px] tracking-widest uppercase mb-1" style="color:#335577;">Filter</span>
                <div class="flex gap-1">
                  <button v-for="(n, i) in ['LPF','BPF']" :key="i" class="wave-btn text-[10px]">{{ n }}</button>
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
        <div class="flex gap-4 pt-3">
          <!-- Legato panel -->
          <div class="flex flex-col items-center justify-around gap-4 shrink-0 w-28">
            <JuceToggle id="legato"   label="Legato" tooltip="Monophonic legato mode." />
            <JuceKnob   id="glideTime" label="Glide"  tooltip="Portamento slide time." />
          </div>
          <!-- Keyboard -->
          <div class="flex-1 min-w-0">
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
  padding: 16px 20px;
  border-radius: 14px;
  background: rgba(5, 8, 22, 0.92);
  border: 1px solid rgba(0, 100, 255, 0.14);
  position: relative;
  overflow: hidden;
  transition: border-color 0.25s;
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
  background: rgba(0, 100, 255, 0.03);
  border: 1px solid rgba(0, 140, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 4px;
  overflow: hidden;
  transition: all 0.2s ease;
  height: 104px; /* Fixed height for expanded state */
}
.osc-collapsed {
  height: 32px; /* Fixed height for collapsed state */
}

.osc-row-container:hover {
  border-color: rgba(0, 140, 255, 0.2);
  background: rgba(0, 100, 255, 0.05);
}
.osc-row-header {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  cursor: pointer;
}
.osc-row-content {
  border-top: 1px solid rgba(0, 140, 255, 0.05);
  height: 72px;
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

.row-inactive { opacity: 0.35; filter: grayscale(0.5); }
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
.wave-btn {
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(0, 100, 255, 0.2);
  background: rgba(0, 20, 60, 0.6);
  color: rgba(100, 160, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
}
.wave-btn:hover { border-color: rgba(0, 140, 255, 0.5); color: #88CCFF; }
.wave-btn-active {
  background: rgba(0, 100, 255, 0.2);
  border-color: rgba(0, 150, 255, 0.6);
  color: #55AAFF;
  box-shadow: 0 0 8px rgba(0, 120, 255, 0.3);
}

/* ── Port (routing node) ───────────────────────────────────────────────────── */
.port {
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(0, 120, 255, 0.4);
  background: rgba(0, 30, 80, 0.8);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.port:hover { border-color: #0099FF; background: rgba(0, 60, 150, 0.8); }
.port-selected {
  border-color: #33AAFF;
  background: #0077CC;
  box-shadow: 0 0 10px #0099FF;
}
.port-connected {
  border-color: rgba(0, 180, 255, 0.7);
  background: rgba(0, 80, 180, 0.5);
}
.port-target {
  border-color: rgba(0, 200, 255, 0.6);
  animation: pulse-port 0.8s ease-in-out infinite alternate;
}
@keyframes pulse-port {
  from { box-shadow: 0 0 4px rgba(0, 180, 255, 0.3); }
  to   { box-shadow: 0 0 12px rgba(0, 180, 255, 0.7); }
}

/* ── SVG routing container ─────────────────────────────────────────────────── */
.routing-svg-container {
  display: flex;
  flex-direction: column;
  padding-top: 0;
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
  padding: 2px 0 6px;
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