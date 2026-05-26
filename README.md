# Lattice UI (absynth-ui)

Vue 3 + TypeScript front end for **Lattice**, running inside JUCE 8’s `WKWebView` with a live JS↔C++ parameter bridge.

Companion repo: [absynth-vst](https://github.com/JameyStiling/absynth-vst) (DSP + plugin host).  
Monorepo: use the parent **`absynth`** folder (`absynth-ui` + `absynth-vst` together) when you have the combined checkout.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Build | Vite 8 |
| JUCE bridge | `juce-framework-frontend` (from vendored JUCE in `absynth-vst`) |

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server at `http://localhost:5173` (Standalone / hot reload) |
| `npm run build-plugin` | **Production bundle for VST3** — single inlined `dist/index.html` |
| `npm run build` | `type-check` + normal `vite build` (split assets; browser / CI) |
| `npm run build-only` | `vite build` only (split assets) |
| `npm run type-check` | `vue-tsc --build` |
| `npm start` | Dev server + open Standalone app (paths assume monorepo layout) |

From the **monorepo root**, use `npm run build:vst3` to build UI + native plugin and install the VST3.

### Plugin vs dev builds

- **`build-plugin`** (`vite build --mode plugin`) uses `vite-plugin-singlefile` so one `index.html` contains all JS/CSS. Required for DAW WebViews (Bitwig, etc.).
- **`build` / `build-only`** emit `index.html` + `assets/*`. Fine for dev in a browser; **not** embedded into the VST3.

Check after `build-plugin`:

```bash
wc -c dist/index.html   # expect ~280000+, not ~430
```

---

## Development (Standalone + HMR)

```bash
npm install
npm run dev
```

> Use **`localhost`**, not `127.0.0.1`. JUCE’s WKWebView treats `localhost` as a secure origin for native bridge calls.

In the monorepo:

```bash
cd .. && npm run dev
```

---

## JUCE bridge (summary)

- **Parameters** — `JuceKnob` / `JuceToggle` / combos use `Juce.getSliderState(id)` etc.; IDs must match `PluginProcessor::createParameters()` in `absynth-vst`.
- **MIDI** — `Juce.getNativeFunction("sendMidiNote")` → C++ `handleWebMidiEvent`.
- **MSEG draw** — `sendModDrawState` native function for filter draw modulation.

The bridge is only active inside the plugin/Standalone WebView. In a normal browser, controls use local fallback state.

---

## Notes

- Do **not** enable `vueDevTools()` in `vite.config.ts` — it crashes WKWebView on macOS.
- `vite.config.ts` uses `base: './'` for relative paths when assets are split.
- Parameter IDs in Vue must match C++ `ParameterID` strings exactly.

---

## License

MIT — see `LICENSE` if present.
