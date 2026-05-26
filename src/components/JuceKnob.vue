<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as Juce from 'juce-framework-frontend';
import Tooltip from './Tooltip.vue';

const props = withDefaults(defineProps<{
  id: string;
  label: string;
  tooltip?: string;
  size?: 'large' | 'normal' | 'compact';
  displayFormatter?: (val: number) => string;
}>(), {
  size: 'normal'
});

const emit = defineEmits(['value-change']);

const sliderState = Juce.getSliderState(props.id);
const normalisedValue = ref(sliderState.getNormalisedValue());
const scaledValue = ref(sliderState.getScaledValue());
const properties = ref(sliderState.properties);

const isDragging = ref(false);
const startY = ref(0);
const startVal = ref(0);

// Knob-specific flags to match the inspiration image's unique track designs
const isFrequency = computed(() => props.id === 'cutoff');
const isResonance = computed(() => props.id === 'resonance');

// Unified formatting logic
const formatValue = (val: number, id: string) => {
  const lowerId = id.toLowerCase();
  
  if (lowerId.includes('rate')) return `${val.toFixed(2)} Hz`;
  
  if (lowerId.includes('cutoff') || lowerId.includes('center')) {
    const freq = Math.max(20, val);
    const freqStr = freq < 1000 ? `${freq.toFixed(0)} Hz` : `${(freq / 1000).toFixed(2)}k Hz`;
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midiNote = Math.round(69 + 12 * Math.log2(freq / 440));
    if (!isNaN(midiNote) && isFinite(midiNote)) {
      const octave = Math.floor(midiNote / 12) - 1;
      const noteName = noteNames[((midiNote % 12) + 12) % 12];
      return `${freqStr} (${noteName}${octave})`;
    }
    return freqStr;
  }

  if (lowerId.includes('attack') || lowerId.includes('decay') || lowerId.includes('release') || lowerId.includes('glide')) {
    return val < 1.0 ? `${(val * 1000).toFixed(0)} ms` : `${val.toFixed(2)} s`;
  }

  if (lowerId.includes('depth') || lowerId.includes('resonance') || lowerId.includes('sustain')) {
    return `${(val * 100).toFixed(0)}%`;
  }

  return val.toFixed(2);
};

const displayValue = computed(() => {
  if (props.displayFormatter) {
    return props.displayFormatter(scaledValue.value);
  }
  return formatValue(scaledValue.value, props.id);
});

const updateUI = () => {
  normalisedValue.value = sliderState.getNormalisedValue();
  scaledValue.value = sliderState.getScaledValue();
  properties.value = sliderState.properties;
  emit('value-change', scaledValue.value);
};

let valueListenerId: number;
let propertiesListenerId: number;

onMounted(() => {
  valueListenerId = sliderState.valueChangedEvent.addListener(updateUI);
  propertiesListenerId = sliderState.propertiesChangedEvent.addListener(updateUI);
  
  // Initial sync
  updateUI();
  
  // Retry sync after a short delay in case the bridge was still connecting
  setTimeout(updateUI, 100);
  setTimeout(updateUI, 500);
});

onUnmounted(() => {
  sliderState.valueChangedEvent.removeListener(valueListenerId);
  sliderState.propertiesChangedEvent.removeListener(propertiesListenerId);
});

const handleMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  startY.value = e.clientY;
  startVal.value = normalisedValue.value;
  sliderState.sliderDragStarted();
  
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const delta = startY.value - e.clientY;
  const newValue = Math.max(0, Math.min(1, startVal.value + delta * 0.005));
  
  sliderState.setNormalisedValue(newValue);
};

const handleMouseUp = () => {
  isDragging.value = false;
  sliderState.sliderDragEnded();
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

const rotation = computed(() => {
  const minAngle = -135;
  const maxAngle = 135;
  return minAngle + normalisedValue.value * (maxAngle - minAngle);
});

const maskId = computed(() => `knob-mask-${props.id}`);

// Dynamic dimensions based on sizes
const sizeConfig = computed(() => {
  const isLarge = props.size === 'large';
  const isCompact = props.size === 'compact';
  
  if (isCompact) {
    return {
      svgSize: 48,
      cx: 24,
      cy: 24,
      r: 17,
      knobDiameter: 32,
      strokeWidth: 1.8,
      arcPath: 'M 11.9 36.1 A 17 17 0 1 1 36.1 36.1',
      arcLength: 0.75 * 2 * Math.PI * 17,
    };
  }
  
  return {
    svgSize: isLarge ? 80 : 64,
    cx: isLarge ? 40 : 32,
    cy: isLarge ? 40 : 32,
    r: isLarge ? 31 : 23,
    knobDiameter: isLarge ? 56 : 44,
    strokeWidth: isLarge ? 3.2 : 2.5,
    arcPath: isLarge 
      ? 'M 18.08 61.92 A 31 31 0 1 1 61.92 61.92' 
      : 'M 15.74 48.26 A 23 23 0 1 1 48.26 48.26',
    arcLength: isLarge 
      ? 0.75 * 2 * Math.PI * 31 
      : 0.75 * 2 * Math.PI * 23,
  };
});

// Dynamic styles to scale glow and bevel details with knob value
const capStyle = computed(() => {
  const val = normalisedValue.value;
  const borderGlow = `rgba(0, 229, 255, ${0.25 + val * 0.6})`; // Neon cyan glow border
  const glowShadow = `0 0 ${2 + val * 7}px rgba(0, 229, 255, ${0.15 + val * 0.45})`; // Scales glow radius
  const dropShadow = `0 ${2 + val * 2}px ${4 + val * 4}px rgba(0, 0, 0, 0.85)`; // Deep drop shadow
  
  return {
    width: `${sizeConfig.value.knobDiameter}px`,
    height: `${sizeConfig.value.knobDiameter}px`,
    borderColor: borderGlow,
    boxShadow: `inset 0 1px 2px rgba(255, 255, 255, 0.2), inset 0 -2px 3px rgba(0, 0, 0, 0.95), ${glowShadow}, ${dropShadow}`
  };
});

// Dynamic pinhole dot indicator glow that intensifies with higher value
const dotStyle = computed(() => {
  const val = normalisedValue.value;
  const topOffset = props.size === 'large' ? 6 : (props.size === 'compact' ? 3.5 : 4.5);
  return {
    top: `${topOffset}px`,
    left: '50%',
    transform: 'translateX(-50%)',
    width: props.size === 'large' ? '4px' : (props.size === 'compact' ? '2.5px' : '3px'),
    height: props.size === 'large' ? '4px' : (props.size === 'compact' ? '2.5px' : '3px'),
    background: `rgb(${Math.round(val * 40)}, ${Math.round(210 + val * 45)}, 255)`,
    boxShadow: `0 0 ${3 + val * 5}px rgba(0, 229, 255, 0.8), 0 0 ${6 + val * 10}px rgba(0, 229, 255, 0.5)`
  };
});

// Dynamic active progress arc glow that intensifies with higher value
const activeArcStyle = computed(() => {
  const val = normalisedValue.value;
  return {
    opacity: 0.75 + val * 0.25,
    strokeWidth: sizeConfig.value.strokeWidth + (val * 0.3) // Dynamic widening
  };
});
</script>

<template>
  <Tooltip :text="tooltip ?? ''">
    <div class="flex flex-col items-center select-none">
      <!-- Knob Area -->
      <div 
        class="relative flex items-center justify-center cursor-ns-resize group" 
        :style="{ width: `${sizeConfig.svgSize}px`, height: `${sizeConfig.svgSize}px` }"
        @mousedown="handleMouseDown"
      >
        <!-- Value on drag (Floating bubble) -->
        <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-950/95 text-cyan-400 text-[9.5px] px-2 py-0.5 rounded shadow-[0_0_12px_rgba(0,180,255,0.3)] opacity-0 transition-opacity duration-150 whitespace-nowrap z-35 pointer-events-none font-bold border border-cyan-500/30 backdrop-blur-sm"
             :class="{'opacity-100': isDragging}">
          {{ displayValue }}
        </div>

        <!-- SVG Progress Arc Overlay -->
        <svg 
          :width="sizeConfig.svgSize" 
          :height="sizeConfig.svgSize" 
          class="absolute inset-0 pointer-events-none select-none z-0"
        >
          <defs>
            <!-- Glowing Neon Blue/Cyan Filter -->
            <filter :id="`neon-glow-${id}`" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <!-- Progress Mask (Drives the active fill length) -->
            <mask :id="maskId">
              <path
                :d="sizeConfig.arcPath"
                stroke="#ffffff"
                :stroke-width="sizeConfig.strokeWidth + 1.0"
                fill="none"
                stroke-linecap="round"
                :stroke-dasharray="sizeConfig.arcLength"
                :stroke-dashoffset="sizeConfig.arcLength * (1 - normalisedValue)"
              />
            </mask>
          </defs>

          <!-- 1. Background Arc -->
          <path
            :d="sizeConfig.arcPath"
            :stroke="size === 'large' ? 'rgba(0, 229, 255, 0.06)' : 'rgba(255, 255, 255, 0.04)'"
            :stroke-width="sizeConfig.strokeWidth"
            fill="none"
            stroke-linecap="round"
            :stroke-dasharray="size === 'large' ? '2 4' : undefined"
          />

          <!-- 2. Active Arc -->
          <g :mask="`url(#${maskId})`">
            <path
              :d="sizeConfig.arcPath"
              stroke="#00e5ff"
              fill="none"
              stroke-linecap="round"
              :stroke-dasharray="isResonance ? '2 4' : undefined"
              :filter="`url(#neon-glow-${id})`"
              class="transition-all duration-150"
              :style="activeArcStyle"
              :class="isDragging ? 'opacity-100' : 'opacity-85'"
            />
          </g>
        </svg>

        <!-- Tactile 3D Bezel System -->
        <!-- Bezel Layer 1: Inset Chassis Groove -->
        <div 
          class="absolute rounded-full bg-[#030406] shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.95),0_0.5px_0.5px_rgba(255,255,255,0.03)] flex items-center justify-center pointer-events-none z-10"
          :style="{ width: `${sizeConfig.knobDiameter + 8}px`, height: `${sizeConfig.knobDiameter + 8}px` }"
        >
          <!-- Bezel Layer 2: Raised Outer Bezel Ring -->
          <div 
            class="rounded-full bg-gradient-to-b from-[#181c2b] to-[#06080d] shadow-[0_2px_4px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-[#2b334f]/20 flex items-center justify-center"
            :style="{ width: `${sizeConfig.knobDiameter + 6}px`, height: `${sizeConfig.knobDiameter + 6}px` }"
          >
            <!-- Bezel Layer 3: Inner Bezel Inset Bed -->
            <div 
              class="rounded-full bg-[#030406] shadow-[inset_0_1.5px_2px_rgba(0,0,0,0.95)] flex items-center justify-center"
              :style="{ width: `${sizeConfig.knobDiameter + 2}px`, height: `${sizeConfig.knobDiameter + 2}px` }"
            >
              <!-- Bezel Layer 4: Inner Bezel Spacer -->
              <div 
                class="rounded-full flex items-center justify-center z-10 transition-shadow duration-200"
                :style="{ width: `${sizeConfig.knobDiameter + 1}px`, height: `${sizeConfig.knobDiameter + 1}px` }"
                :class="isDragging ? 'shadow-[0_0_10px_rgba(0,229,255,0.25)]' : ''"
              >
                <!-- Inner Cap with dynamic border and shadow glow scaling -->
                <div 
                  class="knob-cap" 
                  :style="capStyle"
                >
                  <!-- Rotating indicator layer -->
                  <div class="w-full h-full relative pointer-events-none" :style="{ transform: `rotate(${rotation}deg)` }">
                    <!-- Glowing neon blue pinhole dot indicator -->
                    <div 
                      class="absolute rounded-full"
                      :style="dotStyle"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Label and Permanent Value -->
      <div class="flex flex-col items-center leading-none select-none" :class="label ? 'mt-1.5' : 'mt-0.5'">
        <span 
          v-if="label"
          class="font-extrabold uppercase tracking-[0.15em]"
          :class="size === 'large' ? 'text-[9.5px] text-white/50 mb-0.5' : 'text-[8.5px] text-white/35 mb-0.5'"
        >
          {{ label }}
        </span>
        <span 
          class="font-mono font-bold tracking-tighter"
          :class="size === 'large' ? 'text-[10.5px] text-cyan-400/90' : 'text-[9.5px] text-cyan-400/60'"
        >
          {{ displayValue.split('(')[0] }}
        </span>
      </div>
    </div>
  </Tooltip>
</template>

<style scoped>
/* Gorgeous inner cap: radial gradient simulating brushed metal reflection in dark theme */
.knob-cap {
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #232a45 0%, #151928 40%, #040508 85%);
  border-width: 1px;
  border-style: solid;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.knob-cap:hover {
  border-color: rgba(0, 229, 255, 0.9) !important;
}
</style>
