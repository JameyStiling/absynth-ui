<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import * as Juce from 'juce-framework-frontend';
import JuceKnob from './components/JuceKnob.vue';
import JuceToggle from './components/JuceToggle.vue';
import WaveformInspector from './components/WaveformInspector.vue';
import VirtualKeyboard from './components/VirtualKeyboard.vue';

// ─── Waveform inspector ───────────────────────────────────────────────────────
const showWaveform = ref(true);

// ─── Oscillator state ─────────────────────────────────────────────────────────
const OSC_NAMES = ['Sine', 'Saw', 'Square'];
const FILTER_NAMES = ['LPF', 'HPF', 'BPF'];
const WAVE_ICONS = ['∿', '⊿', '⊓'];

const oscillators = reactive([
  { id: 1, active: true,  type: 0, level: 80 },
  { id: 2, active: false, type: 1, level: 60 },
  { id: 3, active: false, type: 2, level: 40 },
]);

const filters = reactive([
  { id: 1, active: true,  type: 0 },
  { id: 2, active: false, type: 0 },
  { id: 3, active: false, type: 1 },
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
const ROW_H = 88;
const rowY = (i: number) => i * ROW_H + ROW_H / 2;

// ─── JUCE bridge ──────────────────────────────────────────────────────────────
let juceOscCombo: any = null;
onMounted(() => {
  if ((window as any).__JUCE__) {
    juceOscCombo = Juce.getComboBoxState('oscType');
    oscillators[0].type = juceOscCombo.getChoiceIndex();
    juceOscCombo.valueChangedEvent.addListener(() => {
      oscillators[0].type = juceOscCombo.getChoiceIndex();
    });
  }
});
watch(() => oscillators[0].type, (t) => {
  if (juceOscCombo) juceOscCombo.setChoiceIndex(t);
});
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
      <div class="flex gap-0">

        <!-- OSCILLATORS column -->
        <div class="flex flex-col gap-0 flex-1">
          <div class="col-header">OSCILLATORS</div>
          <div
            v-for="(osc, i) in oscillators"
            :key="osc.id"
            class="osc-row"
            :class="{ 'row-inactive': !osc.active }"
          >
            <!-- Active toggle -->
            <button
              class="led-btn mr-3"
              :style="osc.active ? 'background:#0099FF; box-shadow: 0 0 8px #0099FF;' : 'background:#112233;'"
              @click="osc.active = !osc.active"
            ></button>

            <span class="row-label">OSC {{ osc.id }}</span>

            <!-- Waveform selector -->
            <div class="flex gap-1 ml-3">
              <button
                v-for="(icon, wi) in WAVE_ICONS"
                :key="wi"
                class="wave-btn"
                :class="{ 'wave-btn-active': osc.type === wi }"
                @click="osc.type = wi"
              >{{ icon }}</button>
            </div>

            <!-- Level slider (compact) -->
            <div class="flex items-center gap-1 ml-auto mr-4">
              <span class="text-[10px] tracking-widest" style="color:#335577;">LVL</span>
              <input
                type="range" min="0" max="100" :value="osc.level"
                @input="osc.level = +($event.target as HTMLInputElement).value"
                class="level-slider"
              />
              <span class="text-[10px] w-7 text-right font-mono" style="color:#4488AA;">{{ osc.level }}</span>
            </div>

            <!-- Output port -->
            <button
              class="port"
              :class="{
                'port-selected': selectedOsc === i,
                'port-connected': [...(routing.get(i) ?? [])].length > 0
              }"
              @click="clickOscPort(i)"
              :title="selectedOsc === i ? 'Click a filter input to connect' : 'Click to select, then click a filter'"
            ></button>
          </div>
        </div>

        <!-- SVG Routing lines -->
        <div class="routing-svg-container">
          <div class="col-header text-center" style="color: rgba(0,120,200,0.4); font-size:10px;">ROUTING</div>
          <svg :width="SVG_W" :height="ROW_H * 3" class="overflow-visible">
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#0099FF" opacity="0.7"/>
              </marker>
            </defs>
            <template v-for="(osc, oi) in oscillators" :key="oi">
              <template v-for="(flt, fi) in filters" :key="fi">
                <path
                  v-if="isConnected(oi, fi)"
                  :d="`M 0,${rowY(oi)} C ${SVG_W*0.4},${rowY(oi)} ${SVG_W*0.6},${rowY(fi)} ${SVG_W},${rowY(fi)}`"
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
                :x2="SVG_W" :y2="rowY(fi)"
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
            class="filter-row"
            :class="{ 'row-inactive': !flt.active }"
          >
            <!-- Input port -->
            <button
              class="port mr-3"
              :class="{
                'port-target': selectedOsc !== null,
                'port-connected': oscillators.some((_, oi) => isConnected(oi, i))
              }"
              @click="clickFilterPort(i)"
            ></button>

            <button
              class="led-btn mr-3"
              :style="flt.active ? 'background:#0099FF; box-shadow: 0 0 8px #0099FF;' : 'background:#112233;'"
              @click="flt.active = !flt.active"
            ></button>

            <span class="row-label">FILTER {{ flt.id }}</span>

            <!-- Filter type selector -->
            <div class="flex gap-1 ml-3">
              <button
                v-for="(name, ti) in FILTER_NAMES"
                :key="ti"
                class="wave-btn text-[10px]"
                :class="{ 'wave-btn-active': flt.type === ti }"
                @click="flt.type = ti"
              >{{ name }}</button>
            </div>

            <!-- Cutoff + Resonance — only Filter 1 is JUCE-connected -->
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

    <!-- ── Bottom row: Envelope + WUB ──────────────────────────────────── -->
    <div class="flex gap-4 mb-4">

      <!-- Envelope -->
      <div class="panel flex-1">
        <div class="panel-bar" style="background: linear-gradient(90deg,#00AAFF,#0055DD);"></div>
        <div class="section-label">ENVELOPE</div>
        <div class="flex justify-around items-center pt-2">
          <JuceKnob id="attack"  label="Attack"  tooltip="Time to reach full volume." />
          <JuceKnob id="decay"   label="Decay"   tooltip="Time to fall to sustain level." />
          <JuceKnob id="sustain" label="Sustain" tooltip="Volume held while key is down." />
          <JuceKnob id="release" label="Release" tooltip="Fade time after key release." />
        </div>
      </div>

      <!-- WUB -->
      <div class="panel flex-[1.6]">
        <div class="panel-bar wub-bar"></div>
        <div class="flex items-center justify-between mb-3">
          <div class="section-label mb-0">WUB GENERATOR</div>
          <JuceToggle id="wubEnabled" label="Enable" tooltip="Toggle LFO wub effect." />
        </div>
        <div class="flex justify-around items-center">
          <JuceKnob id="wubRate"      label="Rate"   tooltip="LFO speed in Hz." />
          <JuceKnob id="wubDepth"     label="Depth"  tooltip="Sweep width around center." />
          <JuceKnob id="wubCenter"    label="Center" tooltip="Base frequency for the sweep." />
          <JuceKnob id="wubResonance" label="Reson"  tooltip="Wub filter resonance." />
          <div class="flex flex-col gap-1 items-center">
            <span class="text-[9px] tracking-widest uppercase mb-1" style="color:#335577;">Filter</span>
            <div class="flex gap-1">
              <button
                v-for="(n, i) in ['LPF','BPF']" :key="i"
                class="wave-btn text-[10px]"
              >{{ n }}</button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ── Keyboard row ────────────────────────────────────────────────── -->
    <div class="flex gap-4">
      <!-- Legato panel -->
      <div class="panel flex flex-col items-center justify-around gap-4 shrink-0 w-28">
        <div class="panel-bar" style="background: linear-gradient(90deg,#0077FF,#5500FF);"></div>
        <JuceToggle id="legato"   label="Legato" tooltip="Monophonic legato mode." />
        <JuceKnob   id="glideTime" label="Glide"  tooltip="Portamento slide time." />
      </div>
      <!-- Keyboard -->
      <div class="flex-1 min-w-0">
        <VirtualKeyboard />
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

/* ── OSC / Filter rows ─────────────────────────────────────────────────────── */
.osc-row, .filter-row {
  display: flex;
  align-items: center;
  height: 88px;
  padding: 0 8px;
  border-radius: 10px;
  border: 1px solid rgba(0, 100, 255, 0.08);
  background: rgba(0, 10, 30, 0.5);
  margin-bottom: 4px;
  transition: background 0.2s, border-color 0.2s;
}
.osc-row:hover, .filter-row:hover {
  background: rgba(0, 20, 50, 0.7);
  border-color: rgba(0, 120, 255, 0.2);
}
.row-inactive { opacity: 0.35; }

.row-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(120, 180, 255, 0.7);
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
</style>