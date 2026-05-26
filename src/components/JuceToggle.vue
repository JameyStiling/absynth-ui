<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import * as Juce from 'juce-framework-frontend';
import Tooltip from './Tooltip.vue';

const props = defineProps<{
  id: string;
  label: string;
  tooltip?: string;
  modelValue?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'change', val: boolean): void;
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
      emit('update:modelValue', value.value);
      emit('change', value.value);
    });
  } else if (props.modelValue !== undefined) {
    value.value = props.modelValue;
  }
});

watch(() => props.modelValue, (newVal) => {
  if (newVal !== undefined && newVal !== value.value) {
    value.value = newVal;
    if (toggleState) {
      toggleState.setValue(newVal);
    }
  }
});

const toggle = () => {
  const nextVal = !value.value;
  if (toggleState) {
    toggleState.setValue(nextVal);
  } else {
    value.value = nextVal;
  }
  emit('update:modelValue', nextVal);
  emit('change', nextVal);
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
