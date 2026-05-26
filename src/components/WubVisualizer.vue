<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as Juce from 'juce-framework-frontend';

const props = defineProps<{
  center: number;     // in Hz
  depth: number;      // 0-1
  reson: number;      // 0-1
  filterType: number; // 0: LPF, 1: HPF, 2: BPF
  slope: number;      // 0: 6 dB, 1: 12 dB, 2: 18 dB, 3: 24 dB
  active: boolean;
  isNoteActive: boolean; // Connected to live MIDI signal state
  activeNotes: number[]; // Notes currently held in the UI
  oscillators: Array<{ active: boolean; type: number; level: number }>; // Active oscillators in synth
  modMode: number;      // 0: LFO, 1: DRAW (Custom MSEG)
  rate: number;         // LFO rate in Hz
  points: Array<{ x: number; y: number; curve: number }>; // Custom MSEG points
  timeMode: 'sync' | 'sec';
  syncDivision: string;
  secDuration: number;
  projectBpm: number;
  depthMode?: number;
  polarity?: number;

  // Optional: when provided, spectrum will step with arp
  arpEnabled?: boolean;
  arpRateIndex?: number; // matches backend 0..9
  arpMode?: number;      // 0 Repeat, 1 Up, 2 Down, 3 Up/Dn, 4 As Played
  arpSwing?: number;     // 0..1
}>();

const NUM_BINS = 120;
const canvas = ref<HTMLCanvasElement | null>(null);

// Eventide SplitEQ-style separate Transient and Tonal spectral visualizer bins
const tonalBins = ref<number[]>(Array.from({ length: NUM_BINS }, () => 0));
const transientBins = ref<number[]>(Array.from({ length: NUM_BINS }, () => 0));
let animId = 0;
const sendModDrawState = Juce.getNativeFunction('sendModDrawState');

// Logarithmic decibel scale conversion.
// Keep a floor, but do not hard-cap the top so strong peaks can exceed
// the visible dB guide lines naturally.
const linearToDbScale = (linear: number) => {
  const minDb = -50;
  const maxDb = 20;   // display guide headroom; values can render above this
  const db = linear > 0.00001 ? 20 * Math.log10(linear) : -100;
  const normalized = (db - minDb) / (maxDb - minDb);
  return Math.max(0, normalized);
};

const getNote = (freq: number) => {
  const safeFreq = Math.max(20, freq);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(safeFreq / 440));
  if (isNaN(midi) || !isFinite(midi)) return "??";
  const name = names[((midi % 12) + 12) % 12] ?? "C";
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
};

// Divisions mapped to beat durations
const DIVISIONS_MAP: Record<string, number> = {
  '1/1': 4.0,   // 4 beats
  '1/2': 2.0,   // 2 beats
  '1/4': 1.0,   // 1 beat
  '1/8': 0.5,   // 0.5 beats
  '1/16': 0.25, // 0.25 beats
  '1/32': 0.125 // 0.125 beats
};

const getLoopDuration = () => {
  if (props.timeMode === 'sync') {
    const beats = DIVISIONS_MAP[props.syncDivision] ?? 1.0;
    return beats * (60.0 / props.projectBpm);
  } else {
    return props.secDuration;
  }
};

let phase = 0;
let lastTime = Date.now();
let timeElapsed = 0.0;

// High-precision tracking of note triggers to feed the transient model
let lastActiveNotesCount = 0;
let transientTrigAmount = 0.0;
let lastSteppedNote: number | null = null;

const arpRateIndexToBeatDiv = (rateIdx: number) => {
  // Keep this mapping aligned with backend `processArpeggiator()`
  switch (rateIdx) {
    case 0: return 1.0; // 1/4
    case 1: return 0.5; // 1/8
    case 2: return 0.25; // 1/16
    case 3: return 0.125; // 1/32
    case 4: return 1.5; // 1/4D
    case 5: return 0.75; // 1/8D
    case 6: return 0.375; // 1/16D
    case 7: return 2.0 / 3.0; // 1/4T
    case 8: return 1.0 / 3.0; // 1/8T
    case 9: return 0.5 / 3.0; // 1/16T
    default: return 0.5;
  }
};

const getSteppedNote = (held: number[], tSec: number) => {
  if (!(props.arpEnabled ?? false)) return null;
  const rateIdx = props.arpRateIndex ?? 1;
  const beatDiv = arpRateIndexToBeatDiv(rateIdx);
  const bpm = Math.max(30, props.projectBpm || 120);
  const baseStep = beatDiv * (60.0 / bpm);
  const swing = Math.max(0, Math.min(1, props.arpSwing ?? 0));

  // Approximate backend's alternating swing lengths
  const evenStep = baseStep * (1.0 - swing);
  const oddStep = baseStep * (1.0 + swing);
  const cycle = evenStep + oddStep;
  const within = ((tSec % cycle) + cycle) % cycle;
  const isEven = within < evenStep;
  const stepIndex = Math.floor(tSec / cycle) * 2 + (isEven ? 0 : 1);

  const mode = props.arpMode ?? 0;
  const notes = held.slice().sort((a, b) => a - b);
  if (notes.length === 0) return null;

  if (mode === 0) return null; // Repeat: keep all notes (handled by caller)

  const idx = stepIndex % Math.max(1, notes.length);
  if (mode === 1) return notes[idx] ?? null; // Up
  if (mode === 2) return notes[(notes.length - 1 - idx) % notes.length] ?? null; // Down
  if (mode === 3) {
    // Up/Dn "bounce" (approx)
    if (notes.length === 1) return notes[0] ?? null;
    const period = (notes.length - 1) * 2;
    const p = stepIndex % period;
    const bIdx = p <= (notes.length - 1) ? p : period - p;
    return notes[bIdx] ?? null;
  }
  // As Played: we only have held notes; treat as ordered by pitch
  return notes[idx] ?? null;
};

const draw = () => {
  const cvs = canvas.value;
  if (!cvs) return;
  const ctx = cvs.getContext('2d')!;

  // Dynamic canvas sizing
  const rect = cvs.getBoundingClientRect();
  if (cvs.width !== Math.floor(rect.width) || cvs.height !== Math.floor(rect.height)) {
    cvs.width = Math.floor(rect.width);
    cvs.height = Math.floor(rect.height);
  }

  const W = cvs.width, H = cvs.height;
  if (W === 0 || H === 0) return;

  const graphH = H - 28; // Leave a compact 28px strip at the bottom for frequency tick labels

  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000.0);
  lastTime = now;

  timeElapsed += dt;

  const time = Date.now() * 0.0025;
  ctx.clearRect(0, 0, W, H);
  
  if (!props.active) {
    // Bypassed flatline scaled within graphH
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, graphH * 0.7);
    ctx.lineTo(W, graphH * 0.7);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '900 11.5px JetBrains Mono, Inter, monospace';
    ctx.textAlign = 'center';
    ctx.fillText("MODULATION BYPASS", W / 2, graphH / 2 + 3);
    
    animId = requestAnimationFrame(draw);
    return;
  }

  // Draw background grid lines (Log Hz)
  const freqToX = (f: number) => {
    const minF = 20, maxF = 20000;
    return (Math.log10(f / minF) / Math.log10(maxF / minF)) * W;
  };
  const xToFreq = (px: number) => {
    const minF = 20, maxF = 20000;
    return minF * Math.pow(maxF / minF, px / W);
  };

  ctx.strokeStyle = 'rgba(0, 229, 255, 0.035)'; // Ultra-faint neon-cyan grid
  ctx.lineWidth = 1;
  
  // Ticks at key frequencies — draw down to graphH and position labels above divider
  const freqs = [100, 500, 1000, 5000, 10000];
  ctx.font = '900 10.5px JetBrains Mono, Inter, monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.70)'; // High legibility grid text
  ctx.textAlign = 'center';
  
  freqs.forEach(f => {
    const x = freqToX(f);
    ctx.beginPath(); 
    ctx.moveTo(x, 0); 
    ctx.lineTo(x, graphH); 
    ctx.stroke();
    
    const label = f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`;
    ctx.fillText(label, x, graphH - 6);
  });

  // Decibel ticks — scaled within graphH
  const dbs = [20, 10, 0, -12, -24, -36];
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.035)';
  ctx.textAlign = 'right';
  dbs.forEach(db => {
    const dbVal = linearToDbScale(Math.pow(10, db / 20));
    const y = graphH - (dbVal * (graphH - 24)) - 2;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    ctx.fillText(`${db > 0 ? '+' : ''}${db} dB`, W - 6, y - 3);
  });

  // Calculate Modulation value reactively
  let modVal = 0.0;
  if (props.modMode === 1) { // DRAW Mode: Custom MSEG Envelope
    const duration = getLoopDuration();
    const t = (timeElapsed / duration) % 1.0;
    
    let val = 0.5;
    for (let i = 0; i < props.points.length - 1; i++) {
      const prev = props.points[i];
      const next = props.points[i + 1];
      
      if (prev && next && t >= prev.x && t <= next.x) {
        const u = (t - prev.x) / (next.x - prev.x);
        let cu = u;
        const c = prev.curve;
        if (c > 0) cu = Math.pow(u, 1 + c);
        else if (c < 0) cu = 1 - Math.pow(1 - u, 1 - c);
        val = prev.y + (next.y - prev.y) * cu;
        break;
      }
    }
    modVal = (val - 0.5) * 2.0;
  } else { // LFO Mode: Standard Sine Wave
    phase += (props.rate / 60) * Math.PI * 2;
    modVal = Math.sin(phase);
  }

  // Stream modulation values to JUCE C++ backend at 60Hz
  if ((window as any).__JUCE__) {
    try {
      // Primary bridge path
      sendModDrawState(props.modMode === 1, modVal);
    } catch {
      // Fallback path for older interop wrappers
      try {
        const backend = (window as any).__JUCE__.backend;
        if (backend && backend.sendModDrawState) {
          backend.sendModDrawState(props.modMode === 1, modVal);
        }
      } catch {
        // noop in non-native preview contexts
      }
    }
  }

  // Apply Polarity mapping
  let lfoVal = modVal; // Expected -1.0 to 1.0
  if (props.polarity === 0) { // Unipolar (+)
    lfoVal = (lfoVal + 1.0) * 0.5;
  }

  // Calculate true cutoff frequency matching backend DSP
  let currentFreq = props.center;
  const dMode = props.depthMode ?? 2; // Default to Oct
  
  let actualDepth = props.depth;
  if (dMode === 1) actualDepth = props.depth * 60.0;
  else if (dMode === 2) actualDepth = props.depth * 5.0;

  if (dMode === 0) { // % mode (Dynamic Headroom)
    if (props.polarity === 0) { // Unipolar (+)
        const headroom = 20000.0 - props.center;
        currentFreq = props.center + (lfoVal * props.depth * headroom);
    } else { // Bipolar (+/-)
        const headroom = (lfoVal > 0.0) ? (20000.0 - props.center) : (props.center - 20.0);
        currentFreq = props.center + (lfoVal * props.depth * headroom);
    }
  } else if (dMode === 1) { // Semi
    currentFreq = props.center * Math.pow(2.0, (lfoVal * actualDepth) / 12.0);
  } else { // Oct
    currentFreq = props.center * Math.pow(2.0, lfoVal * actualDepth);
  }
  
  currentFreq = Math.max(20.0, Math.min(20000.0, currentFreq));
  const xCurrent = Math.max(10, Math.min(W - 10, freqToX(currentFreq)));

  // 1. EVALUATE TRANSIENT & TONAL DUAL SPECTRUM
  const activeOscs = (props.oscillators ?? []).filter(o => o.active);
  const heldNotes = props.activeNotes ?? [];

  // If arp is enabled, step a *single* note for the spectrum so it visibly moves.
  const stepped = getSteppedNote(heldNotes, timeElapsed);
  const activeNotesArr =
    (props.arpEnabled ?? false)
      ? ((props.arpMode ?? 0) === 0 ? heldNotes : (stepped != null ? [stepped] : heldNotes))
      : heldNotes;

  // Display note-following spectrum rather than additive stacking across all held notes.
  // This keeps the graph musically dynamic as notes/arp steps change.
  const displayNotes: number[] =
    activeNotesArr.length > 0
      ? [activeNotesArr[activeNotesArr.length - 1] ?? activeNotesArr[0]].filter((n): n is number => n !== undefined)
      : [];

  // Transient trigger when the stepped note changes (or note count rises in non-arp mode)
  if (props.arpEnabled ?? false) {
    if (stepped != null && stepped !== lastSteppedNote) transientTrigAmount = 1.0;
    lastSteppedNote = stepped;
  } else {
    const currentCount = activeNotesArr.length;
    if (props.isNoteActive && currentCount > lastActiveNotesCount) transientTrigAmount = 1.0;
    lastActiveNotesCount = currentCount;
  }

  // Rapidly decay transient envelope
  transientTrigAmount *= 0.84;

  for (let i = 0; i < NUM_BINS; i++) {
    const binX = (i / (NUM_BINS - 1)) * W;
    let tonalEnergy = 0;
    let transientEnergy = 0;
    
    if (props.isNoteActive && displayNotes.length > 0 && activeOscs.length > 0) {
      for (const note of displayNotes) {
        const noteFreq = 440 * Math.pow(2, (note - 69) / 12);
        const maxHarm = Math.max(1, Math.min(64, Math.floor(20000 / Math.max(20, noteFreq))));
        
        for (const osc of activeOscs) {
          const amp = (osc.level / 100) * 1.5;
          
          if (osc.type === 0) { // SINE
            const xFund = freqToX(noteFreq);
            // Steady narrow-band tonal peak
            const tonePeak = amp * Math.exp(-Math.pow(binX - xFund, 2) / 150);
            tonalEnergy += tonePeak;
            
            // Fast wide-band pluck transient peak
            if (transientTrigAmount > 0.02) {
              const pluckPeak = 1.5 * transientTrigAmount * Math.exp(-Math.pow(binX - xFund, 2) / 500);
              transientEnergy += pluckPeak;
            }
          } 
          else if (osc.type === 1) { // SAWTOOTH
            for (let k = 1; k <= maxHarm; k++) {
              const hFreq = noteFreq * k;
              if (hFreq > 20000) break;
              const xHarmonic = freqToX(hFreq);
              const tonePeak = (amp / k) * Math.exp(-Math.pow(binX - xHarmonic, 2) / 120);
              tonalEnergy += tonePeak;
              
              if (transientTrigAmount > 0.02 && k <= 6) {
                const pluckPeak = (1.5 * transientTrigAmount / k) * Math.exp(-Math.pow(binX - xHarmonic, 2) / 400);
                transientEnergy += pluckPeak;
              }
            }
          } 
          else if (osc.type === 2) { // SQUARE
            for (let k = 1; k <= maxHarm; k += 2) {
              const hFreq = noteFreq * k;
              if (hFreq > 20000) break;
              const xHarmonic = freqToX(hFreq);
              const tonePeak = (amp / k) * Math.exp(-Math.pow(binX - xHarmonic, 2) / 120);
              tonalEnergy += tonePeak;
              
              if (transientTrigAmount > 0.02 && k <= 6) {
                const pluckPeak = (1.5 * transientTrigAmount / k) * Math.exp(-Math.pow(binX - xHarmonic, 2) / 400);
                transientEnergy += pluckPeak;
              }
            }
          }
        }
      }
      
      // Add transient pluck high-frequency noise wash (SplitEQ style!)
      if (transientTrigAmount > 0.01) {
        const noise = (Math.random() * 0.16) * transientTrigAmount * (binX / W);
        transientEnergy += noise;
      }
      
      // Preserve true summed energy so the display reflects stronger peaks
      // instead of flattening at a synthetic ceiling.
      tonalEnergy = Math.max(0, tonalEnergy);
      transientEnergy = Math.max(0, transientEnergy);
    }
    
    // Harmonic / transient spectrum starts as source energy.
    // We then apply dynamic modulation filter shaping so the fill tracks cutoff movement.
    let finalTonal = tonalEnergy;
    let finalTransient = transientEnergy;

    // Resonance emphasis around the moving cutoff so the spectrum visibly reacts
    // to the Reson control even when source-energy rendering is enabled.
    const binFreq = xToFreq(binX);
    const q = 0.5 + props.reson * 17.5;
    const widthInOctaves = Math.max(0.06, 0.52 / Math.sqrt(q));
    const distOctaves = Math.log2(Math.max(1e-6, binFreq / currentFreq));
    const resonancePeak = Math.exp(-(distOctaves * distOctaves) / (2 * widthInOctaves * widthInOctaves));
    const tonalResGain = 1.0 + props.reson * 2.2 * resonancePeak;
    const transientResGain = 1.0 + props.reson * 1.2 * resonancePeak;
    finalTonal *= tonalResGain;
    finalTransient *= transientResGain;

    // Dynamic modulation filter shaping (LPF/HPF/BPF + slope) using the current modulated cutoff.
    // This keeps the spectrum visually "breathing" with LFO/MSEG movement.
    const omega = binFreq / Math.max(20.0, currentFreq);
    const Qmag = 0.5 + props.reson * 17.5;
    const denom2 = Math.sqrt(Math.pow(1 - omega * omega, 2) + Math.pow(omega / Qmag, 2));

    // 6 dB component
    let gain1 = 1.0;
    if (props.filterType === 0) gain1 = 1.0 / Math.sqrt(1 + omega * omega); // LPF
    else if (props.filterType === 1) gain1 = omega / Math.sqrt(1 + omega * omega); // HPF
    else gain1 = (omega / Math.sqrt(1 + omega * omega)) * (1.0 / Math.sqrt(1 + omega * omega)); // BPF-ish

    // 12 dB component
    let gain2 = 1.0;
    if (props.filterType === 0) gain2 = 1.0 / denom2;
    else if (props.filterType === 1) gain2 = (omega * omega) / denom2;
    else gain2 = (omega / Qmag) / denom2;

    let filterMag = 1.0;
    if (props.slope === 0) filterMag = gain1;
    else if (props.slope === 1) filterMag = gain2;
    else if (props.slope === 2) filterMag = gain1 * gain2;
    else filterMag = gain2 * gain2;

    // Blend rather than fully multiply so "source energy" stays readable.
    const shapingMix = 0.82;
    const shaped = (1.0 - shapingMix) + shapingMix * Math.max(0.0001, filterMag);
    finalTonal *= shaped;
    finalTransient *= shaped;

    if (props.isNoteActive && finalTonal > 0.02) {
      finalTonal += (Math.random() * 0.02 - 0.01);
    }

    // Damp & smooth frames (Tonal decays slowly, Transient decays extremely fast!)
    tonalBins.value[i] = (tonalBins.value[i] ?? 0) * 0.8 + finalTonal * 0.2;
    transientBins.value[i] = (transientBins.value[i] ?? 0) * 0.45 + finalTransient * 0.55;
  }

  // 2. RENDER THE SPLITEQ OVERLAPPING SPECTRAL FIELDS
  // A. Draw Tonal Sustain Field (Sleek deep-indigo fill & glowing outline)
  ctx.beginPath();
  ctx.moveTo(0, graphH);
  for (let i = 0; i < NUM_BINS; i++) {
    const x = (i / (NUM_BINS - 1)) * W;
    const dbVal = linearToDbScale(tonalBins.value[i] ?? 0);
    const y = graphH - (dbVal * (graphH - 24)) - 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, graphH);
  ctx.fillStyle = 'rgba(99, 102, 241, 0.08)'; // Glassy royal-blue fill
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < NUM_BINS; i++) {
    const x = (i / (NUM_BINS - 1)) * W;
    const dbVal = linearToDbScale(tonalBins.value[i] ?? 0);
    const y = graphH - (dbVal * (graphH - 24)) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)'; // Thin glowing tonal border
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // B. Draw Transient Pluck Field (Bright neon-cyan fill & glowing outline)
  ctx.beginPath();
  ctx.moveTo(0, graphH);
  for (let i = 0; i < NUM_BINS; i++) {
    const x = (i / (NUM_BINS - 1)) * W;
    const dbVal = linearToDbScale(transientBins.value[i] ?? 0);
    const y = graphH - (dbVal * (graphH - 24)) - 2;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, graphH);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.12)'; // Neon cyan semi-transparent overlay
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < NUM_BINS; i++) {
    const x = (i / (NUM_BINS - 1)) * W;
    const dbVal = linearToDbScale(transientBins.value[i] ?? 0);
    const y = graphH - (dbVal * (graphH - 24)) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)'; // Highly responsive transient border
  ctx.lineWidth = 1.5;
  ctx.stroke();


  // 3. DRAW DUAL-LAYER ACTIVE FILTER SPECTRUM RESPONSE (SplitEQ style glowing curves)
  // Proper biquad 2nd-order magnitude response
  const Q = 0.5 + props.reson * 17.5;
  const fc = currentFreq;

  const biquadGain = (px: number): number => {
    const omega = xToFreq(px) / fc;
    
    // 1-pole component (6 dB/octave LPF/HPF/BPF)
    let gain1 = 1.0;
    if (props.filterType === 0) { // LPF
      gain1 = 1.0 / Math.sqrt(1 + omega * omega);
    } else if (props.filterType === 1) { // HPF
      gain1 = omega / Math.sqrt(1 + omega * omega);
    } else { // BPF (approximated for 1-pole)
      gain1 = (omega / Math.sqrt(1 + omega * omega)) * (1.0 / Math.sqrt(1 + omega * omega));
    }

    // 2-pole component (12 dB/octave LPF/HPF/BPF)
    const denom2 = Math.sqrt(Math.pow(1 - omega * omega, 2) + Math.pow(omega / Q, 2));
    let gain2 = 1.0;
    if (props.filterType === 0) {
      gain2 = 1.0 / denom2;
    } else if (props.filterType === 1) {
      gain2 = (omega * omega) / denom2;
    } else {
      gain2 = (omega / Q) / denom2;
    }

    // Return combination based on slope prop (0 = 6dB, 1 = 12dB, 2 = 18dB, 3 = 24dB)
    if (props.slope === 0) {
      return Math.max(0.0001, gain1);
    } else if (props.slope === 1) {
      return Math.max(0.0001, gain2);
    } else if (props.slope === 2) {
      // 18 dB/oct = 1-pole + 2-pole
      const Q3 = 0.5 + props.reson * 10.0; // slightly damped resonance
      const denom3 = Math.sqrt(Math.pow(1 - omega * omega, 2) + Math.pow(omega / Q3, 2));
      let gain2_damped = 1.0;
      if (props.filterType === 0) gain2_damped = 1.0 / denom3;
      else if (props.filterType === 1) gain2_damped = (omega * omega) / denom3;
      else gain2_damped = (omega / Q3) / denom3;

      return Math.max(0.0001, gain1 * gain2_damped);
    } else {
      // 24 dB/oct = cascaded 2-pole
      const Q4_1 = 0.5 + props.reson * 12.0;
      const Q4_2 = 0.5 + props.reson * 8.0;
      const denom4_1 = Math.sqrt(Math.pow(1 - omega * omega, 2) + Math.pow(omega / Q4_1, 2));
      const denom4_2 = Math.sqrt(Math.pow(1 - omega * omega, 2) + Math.pow(omega / Q4_2, 2));
      
      let gain4_1 = 1.0, gain4_2 = 1.0;
      if (props.filterType === 0) {
        gain4_1 = 1.0 / denom4_1;
        gain4_2 = 1.0 / denom4_2;
      } else if (props.filterType === 1) {
        gain4_1 = (omega * omega) / denom4_1;
        gain4_2 = (omega * omega) / denom4_2;
      } else {
        gain4_1 = (omega / Q4_1) / denom4_1;
        gain4_2 = (omega / Q4_2) / denom4_2;
      }
      return Math.max(0.0001, gain4_1 * gain4_2);
    }
  };

  const filterCurveY = (x: number) => {
    const gain = biquadGain(x);
    const dbVal = linearToDbScale(gain);
    return graphH - (dbVal * (graphH - 24)) - 2;
  };

  // Draw overlay shadow area underneath the active filter curve
  ctx.beginPath();
  ctx.moveTo(0, graphH);
  for (let x = 0; x < W; x += 2) {
    ctx.lineTo(x, filterCurveY(x));
  }
  ctx.lineTo(W, graphH);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.015)';
  ctx.fill();

  // Draw thick glowing neon-cyan filter curve path
  ctx.beginPath();
  for (let x = 0; x < W; x += 2) {
    const y = filterCurveY(x);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#00e5ff'; // Premium glowing Eventide cyan
  ctx.lineWidth = 3.0;
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
  ctx.stroke();
  
  ctx.shadowBlur = 0; // Reset blur for node text/badge drawing

  // 4. DRAW SPLITEQ-STYLE NUMERIC CIRCULAR AUDIO BADGE CUTOFF NODE
  const yNode = filterCurveY(xCurrent);

  // Concentric pulsing outer halos
  ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
  ctx.beginPath();
  ctx.arc(xCurrent, yNode, 10 + Math.sin(time * 3) * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
  ctx.beginPath();
  ctx.arc(xCurrent, yNode, 8, 0, Math.PI * 2);
  ctx.fill();

  // Solid circular metal collar
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(xCurrent, yNode, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Draw letter "F" inside the hardware node badge (SplitEQ look!)
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 8px JetBrains Mono, Inter, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F', xCurrent, yNode + 0.5);

  // HUD Labels above the node
  const textY = Math.max(16, yNode - 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 11.5px JetBrains Mono, Inter, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(currentFreq)} Hz`, xCurrent, textY);
  
  ctx.fillStyle = '#00e5ff';
  ctx.font = '800 10.5px Inter, sans-serif';
  ctx.fillText(getNote(currentFreq), xCurrent, textY + 10.5);

  animId = requestAnimationFrame(draw);
};

onMounted(() => { animId = requestAnimationFrame(draw); });
onUnmounted(() => { cancelAnimationFrame(animId); });
</script>

<template>
  <div class="w-full flex-1 min-h-[100px] rounded-xl bg-[#02050a]/95 border border-white/5 relative overflow-hidden flex flex-col justify-end shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)]">
    <!-- Visualizer header overlay -->
    <div class="absolute top-2 left-4 flex items-center gap-2 pointer-events-none z-30 select-none scale-90">
      <div class="w-1.5 h-1.5 rounded-full bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]"></div>
      <span class="text-[8px] font-black uppercase tracking-[0.25em] text-white/35">SplitEQ-Exact Spectral Display</span>
    </div>
    
    <!-- Canvas element filling the container -->
    <canvas ref="canvas" class="w-full h-full opacity-95 z-10 block" />
  </div>
</template>
