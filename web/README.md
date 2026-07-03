# Chopsticks — web app

A Vue 3 single-page app for the Chopsticks hand game, built with Vite.

## Develop

```bash
npm install
npm run dev        # dev server with HMR at http://localhost:8741
```

## Test

```bash
npm test           # run the Vitest unit suite once
npm run test:watch # unit tests, watch mode
npm run coverage   # unit tests with V8 coverage

npm run test:e2e    # Playwright end-to-end tests (headless Chromium)
npm run test:e2e:ui # Playwright UI mode for debugging
```

Vitest covers the engine/solver/CPU (headless) and the store/components (jsdom).
Playwright drives the built app in a real browser. It starts the Vite dev server
automatically (reusing one already on :8741). First run needs the browser binary:

```bash
npx playwright install chromium
```

## Build

```bash
npm run build      # production bundle -> dist/
npm run preview    # serve the built bundle
```

## Layout

```
src/
  main.js            app entry (mounts App, imports global styles.css)
  App.vue            top-level: header + setup/play screens; creates the store
  components/        SFCs — TheHeader, SetupScreen, PlayerRow, RuleForm,
                     PlayScreen, GameBoard, HandView, MoveLog
  composables/
    useChopsticks.js the game store (all reactive state + behaviour), shared
                     with every component via provide/inject
  lib/               framework-agnostic core, unit-tested in isolation:
    engine.js        rules engine (JS port of ../../python/chopsticks.py)
    solver.js        exact retrograde-analysis solver (perfect play)
    cpu.js           CPU strategies (dummy, optimal, remote)
    hand-svg.js      SVG hand renderer
    format.js        text/side-naming helpers
    rule-fields.js   declarative advanced-rules form schema
test/                Vitest specs (engine, solver, cpu, store, app)
e2e/                 Playwright specs (setup screen, gameplay) — real browser
```

The `lib/` modules are plain ES modules with no Vue dependency, so they run
headlessly under Node/Vitest and could back a different UI unchanged.
