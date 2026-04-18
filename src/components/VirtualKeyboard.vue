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
  isDragging.value = true;
  playNote(offset);
};

const onMouseEnter = (offset: number) => {
  if (isDragging.value) {
    playNote(offset);
  }
};

const onMouseLeave = (offset: number) => {
  stopNote(offset);
};

// Global mouse up to catch when user releases mouse outside the keyboard
const onGlobalMouseUp = () => {
  isDragging.value = false;
  // Safety: clear any stuck notes
  activeNotes.value.forEach(note => {
    try {
      sendMidiNote(note, 0, false);
    } catch (e) {
      console.log(`MIDI Note OFF: ${note}`);
    }
  });
  activeNotes.value.clear();
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
  <div class="mt-8 p-6 border border-slate-700/50 rounded-2xl bg-slate-800/80 backdrop-blur-md shadow-2xl relative w-full max-w-4xl mx-auto flex flex-col items-center select-none" @dragstart.prevent>
    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-75"></div>
    
    <div class="flex justify-between items-center w-full mb-6">
      <h2 class="text-lg font-bold text-slate-200 flex items-center tracking-wide">
        <span class="w-2 h-2 rounded-full bg-purple-500 mr-3 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
        VIRTUAL KEYBOARD
      </h2>
      <div class="flex items-center gap-4 bg-slate-900/50 p-2 rounded-lg border border-slate-700">
        <button @click="currentOctave = Math.max(0, currentOctave - 1)" class="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-bold transition-colors shadow active:scale-95">-</button>
        <span class="text-slate-300 font-medium text-sm w-20 text-center uppercase tracking-widest">Octave {{ currentOctave }}</span>
        <button @click="currentOctave = Math.min(8, currentOctave + 1)" class="w-8 h-8 flex items-center justify-center bg-slate-700 hover:bg-slate-600 rounded text-slate-200 font-bold transition-colors shadow active:scale-95">+</button>
      </div>
    </div>

    <!-- Keyboard Keys -->
    <div class="flex justify-center w-full px-4 relative h-40" @mouseleave="isDragging = false">
      <div v-for="note in notes" :key="note.name"
           @mousedown.prevent="onMouseDown(note.offset)"
           @mouseenter.prevent="onMouseEnter(note.offset)"
           @mouseleave.prevent="onMouseLeave(note.offset)"
           @touchstart.prevent="onMouseDown(note.offset)"
           @touchmove.prevent
           :class="[
             'flex items-end justify-center pb-3 cursor-pointer rounded-b-md transition-all duration-75',
             note.isBlack 
                ? 'bg-slate-900 text-slate-400 h-24 w-12 -mx-6 z-10 shadow-xl border-x border-b border-slate-950 hover:bg-slate-800' 
                : 'bg-slate-200 text-slate-600 h-full w-16 border border-slate-400 hover:bg-white',
             activeNotes.has(getMidiNote(note.offset)) && note.isBlack ? '!bg-indigo-900 !text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : '',
             activeNotes.has(getMidiNote(note.offset)) && !note.isBlack ? '!bg-indigo-200 shadow-inner translate-y-1' : ''
           ]">
        <span :class="['font-bold pointer-events-none', note.isBlack ? 'text-[10px]' : 'text-sm']">{{ note.name }}</span>
      </div>
    </div>
  </div>
</template>
