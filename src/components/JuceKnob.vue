<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as Juce from 'juce-framework-frontend';
import Tooltip from './Tooltip.vue';

const props = defineProps<{
  id: string;
  label: string;
  tooltip?: string;
}>();

const sliderState = Juce.getSliderState(props.id);
const normalisedValue = ref(sliderState.getNormalisedValue());
const displayValue = ref("");
const properties = ref(sliderState.properties);

const isDragging = ref(false);
const startY = ref(0);
const startVal = ref(0);

// Unified formatting logic
const formatValue = (val: number, id: string) => {
  const lowerId = id.toLowerCase();
  
  if (lowerId.includes('rate')) return `${val.toFixed(2)} Hz`;
  
  if (lowerId.includes('cutoff') || lowerId.includes('center')) {
    const freq = Math.max(20, val);
    let freqStr = freq < 1000 ? `${freq.toFixed(0)} Hz` : `${(freq / 1000).toFixed(2)}k Hz`;
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

const updateUI = () => {
  normalisedValue.value = sliderState.getNormalisedValue();
  displayValue.value = formatValue(sliderState.getScaledValue(), props.id);
  properties.value = sliderState.properties;
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
  // The valueChangedEvent listener will trigger updateUI() automatically
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
</script>

<template>
  <Tooltip :text="tooltip ?? ''">
    <div class="flex flex-col items-center gap-2">
      <div class="relative w-16 h-16 group cursor-ns-resize" @mousedown="handleMouseDown">
        <!-- Value on drag (Floating bubble) -->
        <div class="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-cyan-300 text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 transition-opacity whitespace-nowrap z-30 pointer-events-none font-black border border-cyan-500/30"
             :class="{'opacity-100': isDragging}">
          {{ displayValue }}
        </div>

        <!-- Knob base -->
        <div
          class="absolute inset-0 rounded-full bg-slate-800 border-2 border-slate-700 shadow-inner z-10 flex items-center justify-center knob-base transition-shadow duration-150"
          :class="isDragging ? 'knob-glow-active' : 'knob-glow-idle'"
        >
          <!-- Knob rotation wrapper -->
          <div class="w-full h-full relative" :style="{ transform: `rotate(${rotation}deg)` }">
            <div class="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-4 bg-violet-400 rounded-full shadow-[0_0_8px_rgba(167,139,250,0.9)]"></div>
          </div>
        </div>
      </div>
      
      <!-- Label and Permanent Value -->
      <div class="flex flex-col items-center leading-tight">
        <span class="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-0.5">{{ label }}</span>
        <span class="text-[10px] font-mono font-bold text-cyan-400/80 tracking-tighter">{{ displayValue.split('(')[0] }}</span>
      </div>
    </div>
  </Tooltip>
</template>

<style scoped>
.knob-glow-idle {
  box-shadow: 0 0 0 0 rgba(167, 139, 250, 0);
}

.knob-glow-idle:hover {
  box-shadow: 0 0 12px 3px rgba(167, 139, 250, 0.25);
}

.knob-glow-active {
  box-shadow: 0 0 20px 6px rgba(167, 139, 250, 0.5);
}
</style>
