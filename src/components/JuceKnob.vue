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
const value = ref(sliderState.getNormalisedValue());
const properties = ref(sliderState.properties);

const isDragging = ref(false);
const startY = ref(0);
const startVal = ref(0);

const scaledValue = computed(() => {
  const val = sliderState.getScaledValue();
  
  // Check if this is a frequency parameter (cutoff or wubCenter)
  if (props.id.toLowerCase().includes('cutoff') || props.id.toLowerCase().includes('center')) {
    const freq = val;
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    // MIDI note = 69 + 12 * log2(freq / 440)
    const midiNote = Math.round(69 + 12 * Math.log2(freq / 440));
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = noteNames[midiNote % 12];
    return `${freq.toFixed(0)} Hz (${noteName}${octave})`;
  }
  
  return val.toFixed(2);
});

const updateValue = () => {
  value.value = sliderState.getNormalisedValue();
  properties.value = sliderState.properties;
};

let valueListenerId: number;
let propertiesListenerId: number;

onMounted(() => {
  valueListenerId = sliderState.valueChangedEvent.addListener(updateValue);
  propertiesListenerId = sliderState.propertiesChangedEvent.addListener(updateValue);
});

onUnmounted(() => {
  sliderState.valueChangedEvent.removeListener(valueListenerId);
  sliderState.propertiesChangedEvent.removeListener(propertiesListenerId);
});

const handleMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  startY.value = e.clientY;
  startVal.value = value.value;
  sliderState.sliderDragStarted();
  
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  const delta = startY.value - e.clientY;
  const newValue = Math.max(0, Math.min(1, startVal.value + delta * 0.005));
  sliderState.setNormalisedValue(newValue);
  value.value = newValue;
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
  return minAngle + value.value * (maxAngle - minAngle);
});
</script>

<template>
  <Tooltip :text="tooltip ?? ''">
    <div class="flex flex-col items-center gap-3">
      <div class="relative w-16 h-16 group cursor-ns-resize" @mousedown="handleMouseDown">

        <!-- Knob base — glow applied via box-shadow, no bleed artifacts -->
        <div
          class="absolute inset-0 rounded-full bg-slate-800 border-2 border-slate-700 shadow-inner z-10 flex items-center justify-center knob-base transition-shadow duration-150"
          :class="isDragging ? 'knob-glow-active' : 'knob-glow-idle'"
        >
          <!-- Knob rotation wrapper -->
          <div class="w-full h-full relative" :style="{ transform: `rotate(${rotation}deg)` }">
            <div class="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-4 bg-violet-400 rounded-full shadow-[0_0_8px_rgba(167,139,250,0.9)]"></div>
          </div>
        </div>

        <!-- Value on drag -->
        <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-cyan-300 text-xs px-2 py-1 rounded shadow-lg opacity-0 transition-opacity whitespace-nowrap z-20 pointer-events-none font-mono"
             :class="{'opacity-100': isDragging}">
          {{ scaledValue }}
        </div>
      </div>
      
      <span class="text-xs font-semibold text-slate-300 uppercase tracking-widest">{{ label }}</span>
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
