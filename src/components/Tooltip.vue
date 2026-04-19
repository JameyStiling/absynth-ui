<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ text: string }>();

const visible = ref(false);
let showTimer: ReturnType<typeof setTimeout> | null = null;

const onEnter = () => {
  showTimer = setTimeout(() => { visible.value = true; }, 500);
};

const onLeave = () => {
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  visible.value = false;
};
</script>

<template>
  <div class="relative inline-flex" @mouseenter="onEnter" @mouseleave="onLeave">
    <slot />

    <!-- Tooltip bubble -->
    <Transition name="tooltip">
      <div
        v-if="visible && text"
        class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[9999] pointer-events-none"
      >
        <!-- Arrow -->
        <div class="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0
                    border-l-[5px] border-l-transparent
                    border-r-[5px] border-r-transparent
                    border-t-[5px] border-t-slate-800"></div>

        <!-- Content -->
        <div class="bg-slate-800/95 border border-slate-600 text-slate-300 text-[11px]
                    rounded-md px-2.5 py-1.5 shadow-2xl w-36 text-center leading-snug
                    whitespace-normal backdrop-blur-sm">
          {{ text }}
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tooltip-enter-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.tooltip-leave-active {
  transition: opacity 0.08s ease;
}
.tooltip-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(4px);
}
.tooltip-enter-to {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.tooltip-leave-to {
  opacity: 0;
}
</style>
