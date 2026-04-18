<script setup lang="ts">
import JuceKnob from './components/JuceKnob.vue';
import JuceSelect from './components/JuceSelect.vue';
import JuceToggle from './components/JuceToggle.vue';
import VirtualKeyboard from './components/VirtualKeyboard.vue';
</script>

<template>
  <main class="min-h-screen bg-slate-900 text-white p-8 flex flex-col items-center select-none overflow-y-auto">
    <div class="text-center mb-10">
      <h1 class="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 drop-shadow-sm">ABSYNTH</h1>
      <p class="text-slate-400 font-medium tracking-wide mt-2 uppercase text-sm">Subtractive Synthesis Engine</p>
    </div>
    
    <div class="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
      
      <!-- Oscillator Section -->
      <div class="p-6 border border-slate-700/50 rounded-2xl bg-slate-800/80 backdrop-blur-md shadow-2xl relative overflow-hidden group">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-rose-500 opacity-75"></div>
        <h2 class="text-lg font-bold text-slate-200 mb-6 flex items-center">
          <span class="w-2 h-2 rounded-full bg-pink-500 mr-2 shadow-[0_0_8px_rgba(236,72,153,0.8)]"></span>
          OSCILLATOR
        </h2>
        
        <div class="flex flex-col gap-8">
          <JuceSelect id="oscType" label="Waveform" />
        </div>
      </div>
      
      <!-- Filter Section -->
      <div class="p-6 border border-slate-700/50 rounded-2xl bg-slate-800/80 backdrop-blur-md shadow-2xl relative overflow-hidden group">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-75"></div>
        <h2 class="text-lg font-bold text-slate-200 mb-6 flex items-center">
          <span class="w-2 h-2 rounded-full bg-cyan-400 mr-2 shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
          FILTER
        </h2>
        
        <div class="flex justify-around items-center h-full pb-8">
          <JuceKnob id="cutoff" label="Cutoff" />
          <JuceKnob id="resonance" label="Reson" />
        </div>
      </div>
      
      <!-- Envelope Section -->
      <div class="p-6 border border-slate-700/50 rounded-2xl bg-slate-800/80 backdrop-blur-md shadow-2xl relative overflow-hidden group">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-75"></div>
        <h2 class="text-lg font-bold text-slate-200 mb-6 flex items-center">
          <span class="w-2 h-2 rounded-full bg-emerald-400 mr-2 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
          ENVELOPE
        </h2>
        
        <div class="grid grid-cols-2 gap-y-8 gap-x-4">
          <JuceKnob id="attack" label="Attack" />
          <JuceKnob id="decay" label="Decay" />
          <JuceKnob id="sustain" label="Sustain" />
          <JuceKnob id="release" label="Release" />
        </div>
      </div>

    </div>

    <!-- Keyboard Row: Legato/Glide panel + Keyboard -->
    <div class="w-full max-w-4xl flex items-stretch gap-4 mt-8">

      <!-- Legato & Glide side panel -->
      <div class="flex flex-col items-center justify-around gap-6 p-5 border border-slate-700/50 rounded-2xl bg-slate-800/80 backdrop-blur-md shadow-2xl relative shrink-0 w-32">
        <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-75 rounded-t-2xl"></div>
        <JuceToggle id="legato" label="Legato" />
        <JuceKnob id="glideTime" label="Glide" />
      </div>

      <!-- Virtual Keyboard (fills remaining width) -->
      <div class="flex-1 min-w-0">
        <VirtualKeyboard />
      </div>

    </div>

  </main>
</template>