# Chopsticks — standalone (no build)

A zero-build version of the web app. No `npm install`, no bundler, no compile
step — just static files. Vue is loaded from a CDN as an ES module, and the game
core and store are the *same* ES modules the Vite app uses (`web/src`), copied in
here and imported natively by the browser.

## Run it

Any static file server works; browsers won't load ES modules over `file://`, so
you do need to serve the folder (not just double-click the HTML):

```bash
cd standalone
python3 -m http.server 8750
# then open http://localhost:8750/
```

That's it. It needs network access once, to fetch Vue from the CDN.

## What's here

```
index.html               the whole UI — the Vite app's components inlined into
                         one flat template, mounted with Vue from a CDN
styles.css               copy of web/src/styles.css
composables/
  useChopsticks.js       copy of the shared store (all game state + behaviour)
lib/                     copies of the framework-agnostic core:
  engine.js  solver.js  cpu.js  hand-svg.js  format.js  rule-fields.js
```

Unlike the Pages build, this version **keeps the "CPU: remote" player**, since a
locally-run copy can reach an engine process on `localhost` (see
`../remote_cpu_server.py` and `../mcp_cpu_server.py`).

## Relationship to `web/`

`web/` is the source of truth. The files under `lib/` and `composables/` here are
verbatim copies of their `web/src/` counterparts, so refreshing them is a plain
copy:

```bash
cp ../web/src/styles.css styles.css
cp ../web/src/composables/useChopsticks.js composables/
cp ../web/src/lib/*.js lib/
```

Only `index.html` is maintained by hand — it inlines the `web/src/components/*.vue`
templates (with the store exposed as `g`, so every binding matches the SFCs). If
you change a component's markup in `web/`, mirror it here.
