<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as Juce from 'juce-framework-frontend';
import Tooltip from './Tooltip.vue';

const props = defineProps<{
  id: string;
  label: string;
  tooltip?: string;
}>();

const comboState = Juce.getComboBoxState(props.id);
const value = ref(comboState.getChoiceIndex());
const properties = ref(comboState.properties);

const updateValue = () => {
  value.value = comboState.getChoiceIndex();
  properties.value = comboState.properties;
};

let valueListenerId: number;
let propertiesListenerId: number;

onMounted(() => {
  valueListenerId = comboState.valueChangedEvent.addListener(updateValue);
  propertiesListenerId = comboState.propertiesChangedEvent.addListener(updateValue);
});

onUnmounted(() => {
  comboState.valueChangedEvent.removeListener(valueListenerId);
  comboState.propertiesChangedEvent.removeListener(propertiesListenerId);
});

const handleChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  comboState.setChoiceIndex(parseInt(target.value));
};
</script>

<template>
  <Tooltip :text="tooltip ?? ''">
    <div class="flex flex-col gap-2 w-full">
      <label class="text-xs font-semibold text-slate-300 uppercase tracking-widest">{{ label }}</label>
      <div class="relative">
        <select 
          :value="value" 
          @change="handleChange"
          class="appearance-none bg-slate-800 border border-slate-700 text-cyan-50 rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all cursor-pointer font-medium w-full"
        >
          <option v-for="(choice, i) in properties.choices" :key="i" :value="i">
            {{ choice }}
          </option>
        </select>
        <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  </Tooltip>
</template>
