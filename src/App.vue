<script setup lang="ts">
// This is where synth logic and imports will live
</script>

<template>
  <main class="min-h-screen bg-slate-900 text-white p-8">
    <h1 class="text-4xl font-bold tracking-tighter">ABSYNTH</h1>
    <p class="text-slate-400">Subtractive Synthesis Engine</p>
    
    <div class="mt-12 p-8 border-2 border-slate-800 rounded-2xl bg-slate-950 shadow-2xl inline-block">
      <div class="flex gap-8">
        <div class="w-32 h-32 rounded-full border-4 border-cyan-500/20 flex items-center justify-center">
           <span class="text-xs uppercase tracking-widest text-cyan-400">Osc</span>
        </div>
        
        <div class="w-32 h-32 rounded-full border-4 border-magenta-500/20 flex items-center justify-center">
           <span class="text-xs uppercase tracking-widest text-pink-400">Filter</span>
        </div>
      </div>
    </div>
  </main>
</template>

<style>
/* Base resets */
body {
  margin: 0;
  overflow: hidden; /* VSTs usually don't scroll */
}
</style>