# ABSYNTH UI

A high-performance, reactive user interface for the **ABSYNTH** subtractive(as of now) synthesizer VST3/AU plugin. Built with **Vue 3**, **TypeScript**, and **Tailwind CSS**, this UI communicates with a native **C++ (JUCE 8)** audio engine via a low-latency WebView bridge.

## 🎹 Tech Stack

- **Framework:** Vue 3 (Composition API)
- **State Management:** Pinia (Syncs with JUCE AudioProcessorParameters)
- **Styling:** Tailwind CSS (Custom "dark-mode" synth aesthetics)
- **Build Tool:** Vite
- **Language:** TypeScript

## 🚀 Development

### Prerequisites
This UI is designed to run in a browser for rapid prototyping or inside a JUCE-hosted WebView for plugin development.

```bash
# Install dependencies
npm install

# Start the development server with Hot Module Replacement (HMR)
npm run dev

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
npm run build

# Runs the end-to-end tests
npm run test:e2e
# Runs the tests only on Chromium
npm run test:e2e -- --project=chromium
# Runs the tests of a specific file
npm run test:e2e -- tests/example.spec.ts
# Runs the tests in debug mode
npm run test:e2e -- --debug
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
