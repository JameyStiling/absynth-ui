<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as Juce from 'juce-framework-frontend';

const currentOctave = defineModel<number>('octave', { default: 4 });
const isLatchEnabled = defineModel<boolean>('latch', { default: false });

const props = defineProps<{
  arpMode?: number;
  arpEnabled?: boolean;
}>();

const sendMidiNote = Juce.getNativeFunction("sendMidiNote");
const emit = defineEmits(['midi-note-on', 'midi-note-off', 'active-notes-change']);

// Expose a method so the parent can force-kill all notes (e.g. oscillator disabled)
const killAllNotes = () => {
  activeNotes.value.forEach(note => {
    try { sendMidiNote(note, 0, false); } catch { /* JUCE bridge unavailable in browser */ }
  });
  activeNotes.value.clear();
  activeNotesOrder.value = [];
  lastOffset.value = null;
  isDragging.value = false;
  emitNotesChanged();
};
defineExpose({ killAllNotes });

// Layout covering two full octaves (24 notes)
const notes = [
  // First Octave
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
  // Second Octave
  { name: 'C', offset: 12, isBlack: false },
  { name: 'C#', offset: 13, isBlack: true },
  { name: 'D', offset: 14, isBlack: false },
  { name: 'D#', offset: 15, isBlack: true },
  { name: 'E', offset: 16, isBlack: false },
  { name: 'F', offset: 17, isBlack: false },
  { name: 'F#', offset: 18, isBlack: true },
  { name: 'G', offset: 19, isBlack: false },
  { name: 'G#', offset: 20, isBlack: true },
  { name: 'A', offset: 21, isBlack: false },
  { name: 'A#', offset: 22, isBlack: true },
  { name: 'B', offset: 23, isBlack: false },
];

const getMidiNote = (offset: number) => {
  return (currentOctave.value + 1) * 12 + offset;
};

const activeNotes = ref<Set<number>>(new Set());
const activeNotesOrder = ref<number[]>([]);

// Emit helpers — called explicitly so glissando drags also trigger spectrum updates
const emitNotesChanged = () => {
  const arr = Array.from(activeNotesOrder.value);
  if (arr.length > 0) {
    emit('midi-note-on');
  } else {
    emit('midi-note-off');
  }
  emit('active-notes-change', arr);
};

const isDragging = ref(false);
const lastOffset = ref<number | null>(null);

const playNote = (offset: number) => {
  const note = getMidiNote(offset);
  if (activeNotes.value.has(note)) return;
  activeNotes.value.add(note);
  activeNotesOrder.value.push(note);
  emitNotesChanged();

  try {
    sendMidiNote(note, 100, true);
  } catch {
    console.log(`MIDI Note ON: ${note}`);
  }
};

const stopNote = (offset: number) => {
  const note = getMidiNote(offset);
  if (!activeNotes.value.has(note)) return;
  activeNotes.value.delete(note);
  activeNotesOrder.value = activeNotesOrder.value.filter(n => n !== note);
  emitNotesChanged();

  try {
    sendMidiNote(note, 0, false);
  } catch {
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
  if (isLatchEnabled.value) return;
  
  if (isDragging.value && lastOffset.value !== offset) {
    playNote(offset);
    if (lastOffset.value !== null) {
      stopNote(lastOffset.value);
    }
    lastOffset.value = offset;
  }
};

const onMouseLeaveKey = (offset: number) => {
  if (isLatchEnabled.value) return;
  
  if (!isDragging.value) {
    stopNote(offset);
  }
};

const onGlobalMouseUp = () => {
  if (isLatchEnabled.value) return;
  if (!isDragging.value) return;
  isDragging.value = false;

  activeNotes.value.forEach(note => {
    try { sendMidiNote(note, 0, false); } catch { console.log(`MIDI Note OFF: ${note}`); }
  });
  activeNotes.value.clear();
  activeNotesOrder.value = [];
  lastOffset.value = null;
  emitNotesChanged();
};

// Safety net: release all notes when window loses focus (alt-tab, OS dialog, etc.)
const onWindowBlur = () => {
  if (isLatchEnabled.value) return;
  activeNotes.value.forEach(note => {
    try { sendMidiNote(note, 0, false); } catch { /* JUCE bridge unavailable in browser */ }
  });
  activeNotes.value.clear();
  activeNotesOrder.value = [];
  isDragging.value = false;
  lastOffset.value = null;
  emitNotesChanged();
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'hidden') onWindowBlur();
};


watch(isLatchEnabled, (newVal) => {
  if (!newVal) {
    // Unlatch and turn off all currently playing notes
    activeNotes.value.forEach(note => {
      try {
        sendMidiNote(note, 0, false);
      } catch {
        console.log(`MIDI Note OFF: ${note}`);
      }
    });
    activeNotes.value.clear();
    activeNotesOrder.value = [];
    lastOffset.value = null;
    isDragging.value = false;
    emitNotesChanged();
  }
});

onMounted(() => {
  window.addEventListener('mouseup', onGlobalMouseUp);
  window.addEventListener('touchend', onGlobalMouseUp);
  window.addEventListener('blur', onWindowBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  window.removeEventListener('mouseup', onGlobalMouseUp);
  window.removeEventListener('touchend', onGlobalMouseUp);
  window.removeEventListener('blur', onWindowBlur);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  // Kill any hanging notes on component destroy
  killAllNotes();
});
</script>

<template>
  <div class="h-full relative w-full flex flex-col items-center select-none" @dragstart.prevent>

    <!-- Keyboard Bed Container (Compacted padding p-4) -->
    <div class="relative w-full max-w-4xl p-4 rounded-xl border border-white/5 bg-[#070912]/85 shadow-[0_12px_30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md">
      <!-- Backlit top background line -->
      <div class="absolute top-[15px] left-[15px] right-[15px] h-[2px] bg-[#0d101a] border-b border-white/5 z-20 pointer-events-none rounded-t-sm shadow-[0_1px_4px_rgba(0,0,0,0.9)]"></div>

      <!-- Keyboard Keys Grid (Tactile height h-48) -->
      <div class="flex justify-center w-full relative h-48 mt-1">
        <div v-for="note in notes" :key="note.offset"
             @mousedown.prevent="onMouseDown(note.offset)"
             @mouseenter.prevent="onMouseEnter(note.offset)"
             @mouseleave.prevent="onMouseLeaveKey(note.offset)"
             @touchstart.prevent="onMouseDown(note.offset)"
             @touchmove.prevent
             :class="[
               'cursor-pointer select-none pb-8 flex items-end justify-center transition-all duration-75',
               note.isBlack ? 'key-black z-10' : 'key-natural z-0',
               activeNotes.has(getMidiNote(note.offset)) && note.isBlack ? 'key-black-active' : '',
               activeNotes.has(getMidiNote(note.offset)) && !note.isBlack ? 'key-natural-active' : ''
             ]"
        >
          <!-- Glowing backlit beam above active keys (using electric blue/cyan scheme) -->
          <div 
            v-if="activeNotes.has(getMidiNote(note.offset))"
            class="absolute top-0 left-0 w-full h-[3px] bg-[#00d2ff] shadow-[0_0_10px_#0077ff,0_0_20px_#0077ff,0_0_35px_rgba(0,210,255,0.95)] z-30 pointer-events-none"
          ></div>

          <!-- Sequence Badge (Show if Latch is ON, OR if Repeater is ON and in 'As Played' mode) -->
          <div v-if="(isLatchEnabled || (arpEnabled && arpMode === 4)) && activeNotesOrder.length >= 1 && activeNotes.has(getMidiNote(note.offset))"
               class="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-center w-4 h-4 rounded-full bg-black/60 text-[9px] text-white font-bold tracking-tighter backdrop-blur-sm border border-white/20 shadow-md z-20">
            {{ activeNotesOrder.indexOf(getMidiNote(note.offset)) + 1 }}
          </div>
          <span v-else
            class="font-black pointer-events-none uppercase tracking-widest transition-opacity duration-150"
            :class="[
              note.isBlack ? 'text-[9.5px]' : 'text-[11.5px]',
              activeNotes.has(getMidiNote(note.offset)) 
                ? 'text-white opacity-100' 
                : (note.isBlack ? 'text-white/20' : 'text-slate-500/70')
            ]"
          >
            {{ note.name }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Natural keys (White keys) - Taller and wider for tactile play */
.key-natural {
  width: 50px;
  height: 100%;
  background: linear-gradient(180deg, #f8fafc 0%, #cbd5e1 100%);
  border-left: 1px solid rgba(0, 0, 0, 0.15);
  border-right: 1px solid rgba(0, 0, 0, 0.15);
  border-bottom: 3.5px solid #94a3b8;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  box-shadow: 
    inset 0 1px 0px white,
    inset 0 -5px 6px rgba(15, 23, 42, 0.15),
    0 4px 6px rgba(0, 0, 0, 0.3);
  position: relative;
  overflow: hidden;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.key-natural:first-child {
  border-left: 1px solid rgba(0, 0, 0, 0.2);
}
.key-natural:last-child {
  border-right: 1px solid rgba(0, 0, 0, 0.2);
}

.key-natural:hover {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
  border-color: rgba(0, 180, 255, 0.3);
}

/* Active natural key styling: gorgeous vertical electric blue glowing cascade */
.key-natural-active {
  background: linear-gradient(180deg, 
    #00d2ff 0%, 
    #0077ff 15%, 
    #0044cc 45%, 
    rgba(0, 68, 204, 0.1) 100%
  ) !important;
  border-color: rgba(0, 180, 255, 0.45) !important;
  border-bottom-color: #002266 !important;
  box-shadow: 
    inset 0 1px 2px rgba(255, 255, 255, 0.3),
    inset 0 -2px 4px rgba(0, 0, 0, 0.4),
    0 0 15px rgba(0, 180, 255, 0.25) !important;
  transform: translateY(1.5px);
}

/* Black keys - Sleek matte black/slate keys */
.key-black {
  width: 32px;
  height: 60%; /* Shorter than natural keys */
  margin-left: -16px;
  margin-right: -16px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border-left: 1px solid rgba(0, 0, 0, 0.85);
  border-right: 1px solid rgba(0, 0, 0, 0.85);
  border-bottom: 4px solid #020617;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 6px 10px rgba(0, 0, 0, 0.5);
  position: relative;
  overflow: hidden;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.key-black:hover {
  background: linear-gradient(180deg, #334155 0%, #1e293b 100%);
  border-color: rgba(0, 180, 255, 0.4);
}

/* Active black key styling: slightly tighter, brilliant cyan/blue glow */
.key-black-active {
  background: linear-gradient(180deg, 
    #00d2ff 0%, 
    #0077ff 22%, 
    #0033aa 55%, 
    rgba(0, 51, 170, 0.15) 100%
  ) !important;
  border-color: rgba(0, 180, 255, 0.55) !important;
  border-bottom-color: #001144 !important;
  box-shadow: 
    inset 0 1px 2px rgba(255, 255, 255, 0.2),
    0 4px 6px rgba(0, 0, 0, 0.4),
    0 0 15px rgba(0, 180, 255, 0.3) !important;
  transform: translateY(2px);
}
</style>
