# 🥢 Chopsticks

The hand game of Chopsticks with a pile of configurable rulesets — as a Python
terminal game, a perfect-play solver, and a Vue web app. Every rule axis is
documented in [RULESETS.md](RULESETS.md); solver/strategy notes are in
[STRATEGY.md](STRATEGY.md).

**▶ Play in your browser: https://squivix.github.io/chopsticks-game/**

## Play

**Terminal (Python, no dependencies):**

```bash
python3 python/chopsticks.py                 # standard schoolyard rules
python3 python/chopsticks.py --preset meta --show-rules
python3 python/chopsticks.py --list-presets
```

**Web app.** Two flavours, same game:

| | Where | How |
|---|---|---|
| **Vite SPA** | [`web/`](web/) | `cd web && npm install && npm run dev` — full toolchain, unit + e2e tests |
| **Standalone** | [`standalone/`](standalone/) | `cd standalone && python3 -m http.server 8750` — no build, just static files |

The **Standalone** version is the plug-and-play one: no `npm`, no bundler, Vue
from a CDN, and it keeps the localhost "CPU: remote" player. The **Vite** app is
the maintained source of truth (`web/src`); its production build powers the
GitHub Pages deploy, which excludes the remote player since a static host can't
reach a local engine.

## Remote / AI opponents

Set a web-app player to **CPU: remote** to hand its moves to a separate process
on a `localhost` port:

- [`python/remote_cpu_server.py`](python/remote_cpu_server.py) — a simple example engine.
- [`python/mcp_cpu_server.py`](python/mcp_cpu_server.py) — exposes the engine over MCP so an
  assistant can play.

## Layout

```
python/                the Python side
  chopsticks.py        terminal game + reference rules engine
  remote_cpu_server.py example external CPU (HTTP)
  mcp_cpu_server.py    external CPU over MCP
web/                   Vue 3 + Vite single-page app (source of truth)
standalone/            no-build copy of the app (static files)
RULESETS.md            every rule axis + the shared presets
STRATEGY.md            solver + strategy notes
```
