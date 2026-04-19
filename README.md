# ABSYNTH UI

> The Vue 3 frontend for the **Absynth** subtractive synthesizer, running inside a JUCE 8 `WKWebView` with a live JS↔C++ parameter bridge.

---

## Overview

This repo contains the entire user interface for Absynth. It is a **Vue 3 + TypeScript** single-page app served by Vite and loaded inside the JUCE standalone app or plugin's embedded WebView. Changes made in the browser dev tools or via HMR appear instantly inside the running synthesizer — no C++ rebuild required.

For C++ DSP source and build instructions, see the companion repo: [absynth-vst](https://github.com/JameyStiling/absynth-vst).  
For a full description of every synth parameter, see [absynth-vst/PARAMETERS.md](https://github.com/JameyStiling/absynth-vst/blob/main/PARAMETERS.md).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 (Composition API + `<script setup>`) |
| Language | TypeScript |
| Styling | Tailwind CSS (dark synth aesthetic) |
| Build | Vite 6 with HMR |
| JUCE Bridge | `juce-framework-frontend` npm package |

---

## Project Structure

```
src/
├── App.vue                  # Root layout — all synth sections assembled here
├── main.ts                  # App entry point
└── components/
    ├── JuceKnob.vue         # Rotary knob ↔ juce::WebSliderRelay
    ├── JuceSelect.vue       # Dropdown ↔ juce::WebComboBoxRelay
    ├── JuceToggle.vue       # Toggle switch ↔ juce::WebToggleButtonRelay
    └── VirtualKeyboard.vue  # Drag-to-play keyboard → sendMidiNote native bridge
```

### UI Sections (App.vue)

| Section | Parameters |
|---------|-----------|
| **Oscillator** | Waveform (Sine/Saw/Square) |
| **Filter** | Cutoff, Resonance |
| **Envelope** | Attack, Decay, Sustain, Release |
| **Wub Generator** | Enable, Rate, Depth, Center, Resonance, Filter Type |
| **Legato Panel** (left of keyboard) | Legato toggle, Glide time |
| **Virtual Keyboard** | C–B chromatic, octave select, drag-to-play |

---

## Development

### Prerequisites

- Node.js ≥ 18
- The **absynth-vst** standalone app built and running (provides the C++ bridge)

### Install & Start

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173
```

> **Important:** The server must run on `localhost` (not `127.0.0.1`). JUCE's WKWebView treats `localhost` as a secure origin; `127.0.0.1` is blocked for native function calls.

### Other Commands

```bash
npm run build        # Production bundle (not needed for plugin dev)
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests
```

---

## How the JUCE Bridge Works

### Parameter Knobs / Sliders (JuceKnob, JuceSelect, JuceToggle)

Each component calls `Juce.getSliderState(id)` / `Juce.getComboBoxState(id)` / `Juce.getToggleState(id)` from the `juce-framework-frontend` package. JUCE registers matching `WebSliderRelay` / `WebComboBoxRelay` / `WebToggleButtonRelay` objects on the C++ side. When you move a knob in the UI, the value is immediately synchronized to the `AudioProcessorValueTreeState` parameter on the C++ audio thread.

### MIDI (VirtualKeyboard)

The virtual keyboard calls a **native function** registered by the C++ `PluginEditor`:

```ts
const sendMidiNote = Juce.getNativeFunction("sendMidiNote");
sendMidiNote(midiNoteNumber, velocity, isNoteOn);
```

On the C++ side this calls `processorRef.handleWebMidiEvent(note, vel, isNoteOn)`, which injects a note-on/off directly into the `MidiKeyboardState`, feeding the synth voices in the next `processBlock`.

---

## Notes for Development

- `vueDevTools()` is **disabled** in `vite.config.ts`. It crashes Apple's WKWebView — do not re-enable it when running inside the plugin.
- The JUCE bridge is only active when running inside the standalone/plugin app. When opened in a regular browser, knob components gracefully fall back to local state and keyboard clicks log to the console instead of producing audio.
- All parameter IDs in Vue components (e.g. `id="cutoff"`) must exactly match the `ParameterID` strings registered in `PluginProcessor::createParameters()`.

---

## License

MIT — see `LICENSE` for details.

## Acknowledgments

UI powered by [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)  
Audio engine by [JUCE](https://juce.com/)
