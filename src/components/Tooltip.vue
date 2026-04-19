<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ text: string }>();

const visible = ref(false);
</script>

<template>
  <div class="relative inline-flex" @mouseenter="visible = true" @mouseleave="visible = false">
    <slot />

    <!-- Tooltip bubble -->
    <Transition name="tooltip">
      <div
        v-if="visible && text"
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50 pointer-events-none"
      >
        <!-- Arrow -->
        <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0
                    border-l-[6px] border-l-transparent
                    border-r-[6px] border-r-transparent
                    border-t-[6px] border-t-slate-700"></div>

        <!-- Content -->
        <div class="bg-slate-900 border border-slate-700 text-slate-200 text-xs
                    rounded-lg px-3 py-2 shadow-xl max-w-[200px] text-center leading-relaxed
                    whitespace-normal">
          {{ text }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
.tooltip-enter-to,
.tooltip-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
