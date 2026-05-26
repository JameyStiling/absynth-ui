<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as Juce from 'juce-framework-frontend';
import JuceKnob from './JuceKnob.vue';
import JuceToggle from './JuceToggle.vue';
import JuceSelect from './JuceSelect.vue';

const props = defineProps({
  isNoteActive: {
    type: Boolean,
    default: false
  }
});

// Licensing lock simulation state (unlocked by default but easily toggled)
const isLicensed = ref(true);

// ─── Local state mirroring C++ parameters ──────────────────────────────────────
const state = reactive({
  enable: false,
  mix: 0.3,
  freeze: false,
  grainCount: 16,
  grainSize: 80,
  sizeRand: 0.4,
  posRand: 0.6,
  speed: 1.0,
  detune: 10,
  filterType: 0, // 0: LPF, 1: HPF, 2: BPF, 3: Notch
  filterCutoff: 8000,
  filterRes: 0.3,
  stereoWidth: 0.8
});

// ─── Canvas Grain Cloud Visualization ──────────────────────────────────────────
const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;

interface VisualGrain {
  x: number;          // Position inside the buffer (0 to 1)
  size: number;       // Visual size matching grainSize
  age: number;        // Age counter
  duration: number;   // Window duration
  speed: number;      // Playback speed
  y: number;          // Scattered vertical position
  alpha: number;      // Hann window envelope value
}

const visualGrains = ref<VisualGrain[]>([]);
const isHovered = ref(false);

const initVisualGrains = () => {
  visualGrains.value = [];
  for (let i = 0; i < state.grainCount; i++) {
    visualGrains.value.push(createVisualGrain(true)); // random initial age
  }
};

const createVisualGrain = (randomAge = false) => {
  const sizeMultiplier = 1.0 + (Math.random() - 0.5) * state.sizeRand * 2.0;
  const duration = (state.grainSize * 0.001 * 60) * sizeMultiplier; // normalized to frames
  const age = randomAge ? Math.random() * duration : 0;
  
  // Random start offset scattered based on posRand
  const x = 0.85 - Math.random() * state.posRand * 0.7;
  const y = 0.2 + Math.random() * 0.6; // scatter vertically

  return {
    x: Math.max(0.05, Math.min(0.95, x)),
    size: 4 + (state.grainSize / 100) * 8 * sizeMultiplier,
    age,
    duration,
    speed: state.speed * (1.0 + (Math.random() - 0.5) * (state.detune / 100) * 0.2),
    y,
    alpha: 0
  };
};

const drawCloud = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Clear with transparent black
  ctx.clearRect(0, 0, W, H);

  // Draw background buffer slot grid
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
  ctx.lineWidth = 1;
  const gridDivs = 16;
  for (let i = 1; i < gridDivs; i++) {
    const gx = (i / gridDivs) * W;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }

  // Highlights active recording head (or freeze state)
  if (state.enable) {
    if (state.freeze) {
      // Icey blue glowing frozen overlay
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
      grad.addColorStop(1, 'rgba(0, 150, 255, 0.02)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    } else {
      // Sweeping recording capture line at 90% width
      const recHeadX = W * 0.9;
      const recGrad = ctx.createLinearGradient(recHeadX - 40, 0, recHeadX, 0);
      recGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      recGrad.addColorStop(1, 'rgba(239, 68, 68, 0.35)');
      ctx.fillStyle = recGrad;
      ctx.fillRect(recHeadX - 40, 0, 40, H);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.moveTo(recHeadX, 0);
      ctx.lineTo(recHeadX, H);
      ctx.stroke();
    }
  }

  // Update & Draw Grains
  if (state.enable) {
    visualGrains.value.forEach((grain, i) => {
      // Calculate Hann window: sin(progress * PI)^2
      const progress = grain.age / grain.duration;
      grain.alpha = Math.sin(progress * Math.PI) ** 2.0;

      // Draw grain with radial glowing aura
      const gx = grain.x * W;
      const gy = grain.y * H;
      const size = grain.size;
      const alpha = grain.alpha * (state.mix * 0.8 + 0.2);

      const radGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 2.2);
      
      if (state.freeze) {
        // Freeze mode: Icey cyan grains
        radGrad.addColorStop(0, `rgba(0, 229, 255, ${alpha})`);
        radGrad.addColorStop(0.3, `rgba(0, 150, 255, ${alpha * 0.4})`);
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        // Active mode: Warm purple-cyan transition cloud
        radGrad.addColorStop(0, `rgba(0, 229, 255, ${alpha * 0.95})`);
        radGrad.addColorStop(0.4, `rgba(99, 102, 241, ${alpha * 0.5})`);
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, size * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Sharp central core dot
      ctx.fillStyle = state.freeze 
        ? `rgba(255, 255, 255, ${alpha * 0.9})` 
        : `rgba(200, 245, 255, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.arc(gx, gy, size * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Advance age
      grain.age += 1.0;

      // Move grains based on speed and freeze settings
      if (state.freeze) {
        // Wrap delay boundaries
        grain.x -= (grain.speed * 0.002);
      } else {
        // Progresses further back behind the write head
        grain.x += (1.0 - grain.speed) * 0.0012;
      }

      // Keep boundaries clamped nicely
      if (grain.x < 0.02) grain.x = 0.94;
      if (grain.x > 0.96) grain.x = 0.03;

      // Recycle grain if dead or outside active buffer window
      if (grain.age >= grain.duration) {
        visualGrains.value[i] = createVisualGrain(false);
      }
    });

    // Stagger count corrections (add/remove grains dynamically to match count parameter)
    if (visualGrains.value.length < state.grainCount) {
      visualGrains.value.push(createVisualGrain(false));
    } else if (visualGrains.value.length > state.grainCount) {
      visualGrains.value.pop();
    }
  }

  // Animation Loop
  animationFrameId = requestAnimationFrame(drawCloud);
};

// ─── JUCE WebBridge bindings ──────────────────────────────────────────────────
let isUpdating = false;

const setupJuceBindings = () => {
  if ((window as any).__JUCE__) {
    try {
      const juceEnable = Juce.getToggleState('nebuli_enable');
      const juceMix = Juce.getSliderState('nebuli_mix');
      const juceFreeze = Juce.getToggleState('nebuli_freeze');
      const juceCount = Juce.getSliderState('nebuli_grain_count');
      const juceSize = Juce.getSliderState('nebuli_grain_size');
      const juceSizeRand = Juce.getSliderState('nebuli_grain_size_rand');
      const jucePosRand = Juce.getSliderState('nebuli_grain_position_rand');
      const juceSpeed = Juce.getSliderState('nebuli_speed');
      const juceDetune = Juce.getSliderState('nebuli_detune');
      const juceFilterType = Juce.getComboBoxState('nebuli_filter_type');
      const juceFilterCutoff = Juce.getSliderState('nebuli_filter_cutoff');
      const juceFilterRes = Juce.getSliderState('nebuli_filter_resonance');
      const juceWidth = Juce.getSliderState('nebuli_stereo_width');

      // Initialize from JUCE
      state.enable = juceEnable.getValue();
      state.mix = juceMix.getScaledValue();
      state.freeze = juceFreeze.getValue();
      state.grainCount = juceCount.getScaledValue();
      state.grainSize = juceSize.getScaledValue();
      state.sizeRand = juceSizeRand.getScaledValue();
      state.posRand = jucePosRand.getScaledValue();
      state.speed = juceSpeed.getScaledValue();
      state.detune = juceDetune.getScaledValue();
      state.filterType = juceFilterType.getChoiceIndex();
      state.filterCutoff = juceFilterCutoff.getScaledValue();
      state.filterRes = juceFilterRes.getScaledValue();
      state.stereoWidth = juceWidth.getScaledValue();

      // Setup Value listeners (JUCE -> UI)
      juceEnable.valueChangedEvent.addListener(() => { if (!isUpdating) state.enable = juceEnable.getValue(); });
      juceMix.valueChangedEvent.addListener(() => { if (!isUpdating) state.mix = juceMix.getScaledValue(); });
      juceFreeze.valueChangedEvent.addListener(() => { if (!isUpdating) state.freeze = juceFreeze.getValue(); });
      juceCount.valueChangedEvent.addListener(() => { if (!isUpdating) state.grainCount = juceCount.getScaledValue(); });
      juceSize.valueChangedEvent.addListener(() => { if (!isUpdating) state.grainSize = juceSize.getScaledValue(); });
      juceSizeRand.valueChangedEvent.addListener(() => { if (!isUpdating) state.sizeRand = juceSizeRand.getScaledValue(); });
      jucePosRand.valueChangedEvent.addListener(() => { if (!isUpdating) state.posRand = jucePosRand.getScaledValue(); });
      juceSpeed.valueChangedEvent.addListener(() => { if (!isUpdating) state.speed = juceSpeed.getScaledValue(); });
      juceDetune.valueChangedEvent.addListener(() => { if (!isUpdating) state.detune = juceDetune.getScaledValue(); });
      juceFilterType.valueChangedEvent.addListener(() => { if (!isUpdating) state.filterType = juceFilterType.getChoiceIndex(); });
      juceFilterCutoff.valueChangedEvent.addListener(() => { if (!isUpdating) state.filterCutoff = juceFilterCutoff.getScaledValue(); });
      juceFilterRes.valueChangedEvent.addListener(() => { if (!isUpdating) state.filterRes = juceFilterRes.getScaledValue(); });
      juceWidth.valueChangedEvent.addListener(() => { if (!isUpdating) state.stereoWidth = juceWidth.getScaledValue(); });

      // Setup UI Watches (UI -> JUCE)
      watch(() => state.enable, (v) => { isUpdating = true; juceEnable.setValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.mix, (v) => { isUpdating = true; juceMix.setNormalisedValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.freeze, (v) => { isUpdating = true; juceFreeze.setValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.grainCount, (v) => { isUpdating = true; juceCount.setValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.grainSize, (v) => { isUpdating = true; juceSize.setNormalisedValue((v - 10) / 490); nextTick(() => isUpdating = false); });
      watch(() => state.sizeRand, (v) => { isUpdating = true; juceSizeRand.setNormalisedValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.posRand, (v) => { isUpdating = true; jucePosRand.setNormalisedValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.speed, (v) => { isUpdating = true; juceSpeed.setNormalisedValue((v + 2) / 4); nextTick(() => isUpdating = false); });
      watch(() => state.detune, (v) => { isUpdating = true; juceDetune.setNormalisedValue(v / 100); nextTick(() => isUpdating = false); });
      watch(() => state.filterType, (v) => { isUpdating = true; juceFilterType.setChoiceIndex(v); nextTick(() => isUpdating = false); });
      watch(() => state.filterCutoff, (v) => { isUpdating = true; juceFilterCutoff.setNormalisedValue(Juce.sliderLogScale(v, 20.0, 20000.0)); nextTick(() => isUpdating = false); });
      watch(() => state.filterRes, (v) => { isUpdating = true; juceFilterRes.setNormalisedValue(v); nextTick(() => isUpdating = false); });
      watch(() => state.stereoWidth, (v) => { isUpdating = true; juceWidth.setNormalisedValue(v); nextTick(() => isUpdating = false); });

    } catch (e) {
      console.warn("Failed to hook up JUCE parameter bindings for Nebuli. Using local web state fallback.", e);
    }
  }
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const formatCutoff = (val: number) => {
  return val < 1000 ? `${val.toFixed(0)} Hz` : `${(val / 1000).toFixed(1)}k Hz`;
};

const formatSize = (val: number) => {
  return `${val.toFixed(0)} ms`;
};

const formatSpeed = (val: number) => {
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}x`;
};

const formatDetune = (val: number) => {
  return `${val.toFixed(0)} C`;
};

const formatPercentage = (val: number) => {
  return `${(val * 100).toFixed(0)}%`;
};

onMounted(() => {
  initVisualGrains();
  setupJuceBindings();
  animationFrameId = requestAnimationFrame(drawCloud);
});

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<template>
  <div class="panel mb-2 shrink-0 relative overflow-hidden" 
       @mouseenter="isHovered = true" 
       @mouseleave="isHovered = false"
  >
    <!-- Border panel accent neon bar (Eventide-styled) -->
    <div class="panel-bar" style="background: linear-gradient(90deg, #00d2ff, #0055ff, #00d2ff);"></div>
    
    <!-- Section Header Toggle -->
    <div class="flex justify-between items-center py-0.5 border-b border-white/5 select-none mb-2">
      <div class="flex items-center gap-3">
        <span class="section-label mb-0 text-[9px] tracking-[0.25em] text-[#00d2ff] font-black">NEBULI GRANULAR CLOUD REVERB</span>
        <!-- Active LED indicator -->
        <div class="w-1.5 h-1.5 rounded-full transition-all duration-300"
             :class="state.enable ? 'bg-[#00e5ff] shadow-[0_0_6px_#00e5ff]' : 'bg-white/10'"
        ></div>
      </div>
      
      <!-- Quick toggle triggers -->
      <div class="flex items-center gap-3">
        <!-- Master Bypass toggle -->
        <div class="flex items-center gap-1.5">
          <span class="text-[7.5px] font-black uppercase tracking-wider text-slate-400">Bypass</span>
          <JuceToggle id="nebuli_enable" label="" v-model="state.enable" tooltip="Bypass/enable Nebuli Granular FX." class="scale-90" />
        </div>
      </div>
    </div>

    <!-- Active panel grid -->
    <div class="flex gap-4 items-stretch relative" :class="{ 'opacity-30 pointer-events-none filter blur-[1px]': !state.enable && isLicensed }">
      
      <!-- Left side: Pre-Buffer Filter Matrix controls -->
      <div class="flex flex-col gap-2 border-r border-white/5 pr-3 pt-0.5 shrink-0" style="min-width: 145px;">
        <span class="text-[7px] font-black uppercase tracking-widest text-[#00d2ff]/80">Pre-Filter Matrix</span>
        
        <!-- Filter Mode ComboBox -->
        <div class="flex p-0.5 bg-black/45 rounded-md border border-white/5 w-full shrink-0 scale-95 origin-left">
          <button v-for="(lbl, i) in ['LPF', 'HPF', 'BPF', 'NOTCH']" :key="'m'+i"
                  class="py-0.5 rounded text-[7px] font-black tracking-widest transition-all flex-1 text-center border"
                  :class="state.filterType === i ? 'bg-[#00d2ff]/15 text-[#00d2ff] border-[#00d2ff]/25 shadow-[0_0_6px_rgba(0,210,255,0.15)]' : 'text-slate-400 border-transparent hover:text-slate-200'"
                  @click="state.filterType = i"
          >{{ lbl }}</button>
        </div>

        <!-- Cutoff / Resonance Knobs -->
        <div class="flex gap-2 items-center justify-around mt-1 scale-95 origin-top-left">
          <JuceKnob id="nebuli_filter_cutoff" label="Cutoff" tooltip="SVF Cutoff frequency." :display-formatter="formatCutoff" v-model="state.filterCutoff" size="compact" />
          <JuceKnob id="nebuli_filter_resonance" label="Reson" tooltip="SVF Resonance level." v-model="state.filterRes" size="compact" />
        </div>
      </div>

      <!-- Middle: Grain Cloud Generator Engine -->
      <div class="flex-1 flex flex-col gap-2 pt-0.5 min-w-0">
        <span class="text-[7px] font-black uppercase tracking-widest text-[#00d2ff]/80">Granular Cloud Generator</span>
        
        <!-- Knob Controls row -->
        <div class="grid grid-cols-6 gap-1.5 items-center justify-between scale-95 origin-top-left">
          <JuceKnob id="nebuli_grain_count" label="Grains" tooltip="Active grain playback count (1-64)." v-model="state.grainCount" size="compact" />
          <JuceKnob id="nebuli_grain_size" label="Size" tooltip="Base grain duration length." :display-formatter="formatSize" v-model="state.grainSize" size="compact" />
          <JuceKnob id="nebuli_grain_size_rand" label="Size Rnd" tooltip="Random size variance factor." :display-formatter="formatPercentage" v-model="state.sizeRand" size="compact" />
          <JuceKnob id="nebuli_grain_position_rand" label="Scatter" tooltip="Scatters grain positions in the buffer." :display-formatter="formatPercentage" v-model="state.posRand" size="compact" />
          <JuceKnob id="nebuli_speed" label="Speed" tooltip="Grains playback speed & direction." :display-formatter="formatSpeed" v-model="state.speed" size="compact" />
          <JuceKnob id="nebuli_detune" label="Detune" tooltip="Random micro-pitch detune spread." :display-formatter="formatDetune" v-model="state.detune" size="compact" />
        </div>

        <!-- HTML5 Canvas visualizer slot -->
        <div class="flex-1 min-h-[48px] bg-black/60 rounded-lg border border-white/5 relative overflow-hidden shadow-[inset_0_2px_5px_rgba(0,0,0,0.92)] mt-0.5">
          <canvas ref="canvasRef" width="460" height="48" class="w-full h-full block pointer-events-none z-10 relative"></canvas>
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span class="text-[6.5px] font-black uppercase tracking-[0.35em] text-white/10">Grain Space Density Visualizer</span>
          </div>
        </div>
      </div>

      <!-- Right: Stereo cloud width & Mix / Freeze Master Controls -->
      <div class="flex flex-col gap-2 pl-3 border-l border-white/5 pt-0.5 shrink-0" style="min-width: 145px;">
        <span class="text-[7px] font-black uppercase tracking-widest text-[#00d2ff]/80">Output Master</span>
        
        <!-- Freeze, Width, Mix Knobs -->
        <div class="flex gap-2 items-center justify-around mt-0.5 scale-95 origin-top-right">
          <JuceKnob id="nebuli_stereo_width" label="Width" tooltip="Stereo panning spread." :display-formatter="formatPercentage" v-model="state.stereoWidth" size="compact" />
          <JuceKnob id="nebuli_mix" label="Dry/Wet" tooltip="Dry / Wet cloud reverb blend." :display-formatter="formatPercentage" v-model="state.mix" size="compact" />
          
          <!-- Freeze Latching Toggle -->
          <div class="flex flex-col items-center gap-1 scale-95 shrink-0">
            <span class="text-[7.5px] font-black uppercase tracking-wider text-slate-400 select-none">Freeze</span>
            <button @click="state.freeze = !state.freeze"
                    class="w-[28px] h-[28px] rounded-full border flex items-center justify-center transition-all duration-200 shadow-md font-bold text-[8px]"
                    :class="state.freeze 
                      ? 'bg-[#00d2ff]/20 border-[#00e5ff] text-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.3)] animate-pulse' 
                      : 'bg-black/55 border-white/10 text-white/55 hover:bg-white/5'"
                    title="Freeze circular buffer contents"
            >
              ❄
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Disabled / Bypassed Inset Overlay -->
    <div v-if="!state.enable && isLicensed" 
         class="absolute inset-0 bg-[#030408]/65 backdrop-blur-[0.5px] pointer-events-none select-none z-20 flex items-center justify-center"
    >
      <span class="text-[8.5px] font-black uppercase tracking-[0.4em] text-white/20 select-none">NEBULI BYPASSED</span>
    </div>

    <!-- ── Frosted Glass locked overlay for premium expansion simulation ── -->
    <div v-if="!isLicensed" 
         class="absolute inset-0 bg-[#030408]/60 backdrop-blur-md border border-cyan-500/20 rounded-lg flex flex-col items-center justify-center z-40 select-none px-4"
    >
      <!-- Glowing Padlock -->
      <div class="w-9 h-9 rounded-full bg-cyan-950/80 border border-cyan-500/35 flex items-center justify-center mb-1.5 shadow-[0_0_15px_rgba(0,210,255,0.15)] animate-bounce">
        <span class="text-cyan-400 text-lg leading-none">🔒</span>
      </div>
      <h3 class="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200 leading-none">Nebuli Granular Cloud Reverb</h3>
      <p class="text-[7.5px] tracking-wide text-white/45 mt-1 select-none text-center max-w-[320px]">
        Expand Lattice with up to 64 looping playheads, bidirectional speed sweeps, and frozen cloud textures.
      </p>
      
      <!-- CTA Buy Pill -->
      <a href="https://sherdaudio.com/lattice/modules/nebuli" 
         target="_blank" 
         class="mt-2.5 px-5 py-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-[8px] uppercase tracking-widest shadow-md hover:scale-105 transition-all duration-200"
         @click.stop
      >
        Unlock Nebuli — $39 (One-Time Cost)
      </a>
      
      <!-- Local simulator unlock helper -->
      <button @click.stop="isLicensed = true" 
              class="absolute bottom-1.5 right-2 text-[6.5px] font-black text-white/25 hover:text-cyan-400/50 uppercase tracking-widest border border-transparent hover:border-cyan-500/20 px-1.5 py-0.5 rounded transition-all"
      >
        [Simulator Unlock]
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Inset shadows and glowing aesthetics */
.panel {
  padding: 8px 14px 7px;
  border-radius: 8px;
  background: rgba(4, 6, 12, 0.97);
  border: 1px solid rgba(0, 210, 255, 0.12);
  transition: all 0.3s ease;
}
.panel:hover {
  border-color: rgba(0, 229, 255, 0.22);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65), 0 0 15px rgba(0, 210, 255, 0.03);
}

.section-label {
  filter: drop-shadow(0 0 10px rgba(0, 210, 255, 0.35));
}
</style>
