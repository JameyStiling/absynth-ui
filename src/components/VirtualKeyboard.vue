<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as Juce from 'juce-framework-frontend';

const currentOctave = ref(4);
const sendMidiNote = Juce.getNativeFunction("sendMidiNote");

// Layout starting from C
const notes = [
  { name: 'C', offset: 0, isBlack: false },
  { name: 'C#', offset: 1, isBlack: true },
  { name: 'D', offset: 2, isBlack: false },
  { name: 'D#', offset: 3, isBlack: true },
  { name: 'E', offset: 4, isBlack: false },
  { name: 'F', offset: 5, isBlack: false },
  { name: 'F#', offset: 6, isBlack: true },
  { name: 'G', offset: 7, isBlack: false },
  { name: 'G#', offset: 8, isBlack: true },
  { name: 'A', offset: 9, isBlack: false },
  { name: 'A#', offset: 10, isBlack: true },
  { name: 'B', offset: 11, isBlack: false },
];

const getMidiNote = (offset: number) => {
  // MIDI C4 is 60.
  return (currentOctave.value + 1) * 12 + offset;
};

const activeNotes = ref<Set<number>>(new Set());
const isDragging = ref(false);
const isLatchEnabled = ref(false);
const lastOffset = ref<number | null>(null);

const playNote = (offset: number) => {
  const note = getMidiNote(offset);
  if (activeNotes.value.has(note)) return;
  activeNotes.value.add(note);

  try {
    sendMidiNote(note, 100, true);
  } catch (e) {
    console.log(`MIDI Note ON: ${note}`);
  }
};

const stopNote = (offset: number) => {
  const note = getMidiNote(offset);
  if (!activeNotes.value.has(note)) return;
  activeNotes.value.delete(note);

  try {
    sendMidiNote(note, 0, false);
  } catch (e) {
    console.log(`MIDI Note OFF: ${note}`);
  }
};

const onMouseDown = (offset: number) => {
  if (isLatchEnabled.value) {
    const note = getMidiNote(offset);
    if (activeNotes.value.has(note)) {
      stopNote(offset);
    } else {
      playNote(offset);
    }
    return;
  }
  
  isDragging.value = true;
  lastOffset.value = offset;
  playNote(offset);
};

const onMouseEnter = (offset: number) => {
  if (isLatchEnabled.value) return; // Don't slide in Latch mode
  
  if (isDragging.value && lastOffset.value !== offset) {
    playNote(offset);
    if (lastOffset.value !== null) {
      stopNote(lastOffset.value);
    }
    lastOffset.value = offset;
  }
};

const onMouseLeaveKey = (offset: number) => {
  if (isLatchEnabled.value) return; // Don't auto-stop in Latch mode
  
  if (!isDragging.value) {
    stopNote(offset);
  }
};

const onGlobalMouseUp = () => {
  if (isLatchEnabled.value) return; // Global mouse up doesn't stop notes in Latch mode
  
  if (!isDragging.value) return;
  isDragging.value = false;
  
  activeNotes.value.forEach(note => {
    try {
      sendMidiNote(note, 0, false);
    } catch (e) {
      console.log(`MIDI Note OFF: ${note}`);
    }
  });
  activeNotes.value.clear();
  lastOffset.value = null;
};

const toggleLatch = () => {
  isLatchEnabled.value = !isLatchEnabled.value;
  // If turning latch OFF, release all currently held notes for safety
  if (!isLatchEnabled.value) {
    onGlobalMouseUp();
  }
};

onMounted(() => {
  window.addEventListener('mouseup', onGlobalMouseUp);
  window.addEventListener('touchend', onGlobalMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('mouseup', onGlobalMouseUp);
  window.removeEventListener('touchend', onGlobalMouseUp);
});
</script>

<template>
  <div class="h-full relative w-full flex flex-col items-center select-none" @dragstart.prevent>
    <div class="flex justify-end items-center w-full mb-6 gap-4">
      <!-- Latch Toggle -->
      <button 
        @click="toggleLatch" 
        class="h-10 px-4 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all border shadow-lg"
        :class="isLatchEnabled ? 'bg-violet-600 border-violet-400 text-white shadow-violet-500/30' : 'bg-white/5 border-white/10 text-white/30'"
      >
        Latch {{ isLatchEnabled ? 'ON' : 'OFF' }}
      </button>

      <div class="flex items-center gap-4 bg-white/5 p-1.5 rounded-lg border border-white/10 shadow-lg">
        <button @click="currentOctave = Math.max(0, currentOctave - 1)" class="w-8 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-slate-200 font-bold transition-colors shadow active:scale-95">-</button>
        <span class="text-white/40 font-bold text-[10px] w-20 text-center uppercase tracking-[0.2em]">Octave {{ currentOctave }}</span>
        <button @click="currentOctave = Math.min(8, currentOctave + 1)" class="w-8 h-7 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-slate-200 font-bold transition-colors shadow active:scale-95">+</button>
      </div>
    </div>

    <!-- Keyboard Keys -->
    <div class="flex justify-center w-full px-4 relative h-40">
      <div v-for="note in notes" :key="note.name"
           @mousedown.prevent="onMouseDown(note.offset)"
           @mouseenter.prevent="onMouseEnter(note.offset)"
           @mouseleave.prevent="onMouseLeaveKey(note.offset)"
           @touchstart.prevent="onMouseDown(note.offset)"
           @touchmove.prevent
           :class="[
             'flex items-end justify-center pb-3 cursor-pointer rounded-b-md transition-all duration-75',
             note.isBlack 
                ? 'bg-slate-900 text-slate-400 h-24 w-12 -mx-6 z-10 shadow-xl border-x border-b border-slate-950 hover:bg-slate-800' 
                : 'bg-slate-200 text-slate-600 h-full w-16 border border-slate-400 hover:bg-white',
              activeNotes.has(getMidiNote(note.offset)) && note.isBlack ? '!bg-violet-900 !text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.6)]' : '',
              activeNotes.has(getMidiNote(note.offset)) && !note.isBlack ? '!bg-violet-200 shadow-inner translate-y-1' : ''
           ]">
        <span :class="['font-bold pointer-events-none', note.isBlack ? 'text-[10px]' : 'text-sm']">{{ note.name }}</span>
      </div>
    </div>
  </div>
</template>
