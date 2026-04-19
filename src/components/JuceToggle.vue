<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import * as Juce from 'juce-framework-frontend';
import Tooltip from './Tooltip.vue';

const props = defineProps<{
  id: string;
  label: string;
  tooltip?: string;
}>();

const value = ref(false);
let toggleState: any = null;

onMounted(() => {
  // @ts-ignore
  if (window.__JUCE__) {
    toggleState = Juce.getToggleState(props.id);
    
    value.value = toggleState.getValue();
    
    toggleState.valueChangedEvent.addListener(() => {
      value.value = toggleState.getValue();
    });
  }
});

const toggle = () => {
  if (toggleState) {
    toggleState.setValue(!value.value);
  } else {
    value.value = !value.value;
  }
};
</script>

<template>
  <Tooltip :text="tooltip ?? ''">
    <div class="flex flex-col items-center gap-3 w-full">
      <div 
        @click="toggle"
        :class="[
          'w-12 h-6 rounded-full p-1 cursor-pointer transition-colors duration-300 ease-in-out relative flex items-center',
          value ? 'bg-[#0077CC] shadow-[0_0_10px_rgba(0,140,255,0.45)]' : 'bg-[#0d1f35]'
        ]"
      >
        <div 
          :class="[
            'w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out',
            value ? 'translate-x-6' : 'translate-x-0'
          ]"
        ></div>
      </div>
      <span class="text-xs font-bold uppercase tracking-widest" style="color: rgba(80,160,255,0.6);">{{ label }}</span>
    </div>
  </Tooltip>
</template>
