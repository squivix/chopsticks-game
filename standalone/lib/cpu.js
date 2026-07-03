import C from "./engine.js";
import Solver from "./solver.js";

/* Chopsticks CPU players. Extendable: add an entry to CPUS with a
 * description and a choose(game, moves, rng) -> move function. `choose` may
 * return the move directly, or a Promise for it (used by the `remote` adapter,
 * which delegates the decision to a separate process over HTTP).
 * ES module used by the app and Node/Vitest. */


/* Tunable at runtime (the web app pushes the user's settings in here).
   ports[player] is the localhost port for that side's remote engine;
   reportedNames[player] is the name the engine most recently sent back. */
const config = {
  host: "localhost",
  path: "/move",
  ports: [8765, 8765],
  reportedNames: [null, null],
  // Generous by design: a remote engine may be a slow search or a
  // human/AI-in-the-loop (e.g. the Claude MCP CPU), so wait patiently.
  timeoutMs: 600000,
};

/* Lightweight state after `move`, sufficient for Chopsticks.legalMoves. */
function successorState(g, move) {
  const me = g.turn;
  const swapStreak = g.swapStreak.slice();
  swapStreak[me] = move.isSwap ? swapStreak[me] + 1 : 0;
  const switchUsed = g.switchUsed.slice();
  if (move.usesSwitch) switchUsed[me] = true;
  return {
    rules: g.rules,
    hands: [move.hands[0].slice(), move.hands[1].slice()],
    turn: 1 - me,
    swapStreak,
    switchUsed,
  };
}

/* After we play `move`, does the opponent have a reply that knocks out
 * one of our then-living hands? */
function opponentCanKillMyHand(g, move) {
  const me = g.turn;
  const succ = successorState(g, move);
  return C.legalMoves(succ).some((reply) =>
    [0, 1].some((h) => move.hands[me][h] > 0 && reply.hands[me][h] === 0));
}

/* Build-time switch. Vite replaces the bare `__REMOTE_CPU__` token with a
   literal boolean (see vite.config.js's `define`), so a static build made with
   CHOPSTICKS_NO_REMOTE_CPU=1 constant-folds the `if` below to `false` and
   tree-shakes the remote adapter out of the bundle entirely — the option never
   reaches the UI, which lists CPUs from Object.keys(CPUS). Outside a bundler
   (Node/Vitest) the token is an undeclared global; `typeof` on it is safely
   "undefined", so headless runs keep the adapter. */
const REMOTE_CPU = typeof __REMOTE_CPU__ === "undefined" ? true : __REMOTE_CPU__;

const CPUS = {
  dummy: {
    description: "Attacks the lowest hand with its lowest; if that would let " +
      "the opponent knock out one of its hands, plays randomly instead.",
    choose(g, moves, rng = Math.random) {
      const me = g.turn, opp = 1 - me;
      const attacks = moves.filter((m) => m.kind === "attack");
      // prefer live targets (death-attack rules also offer dead ones)
      const pool = attacks.filter((m) => g.hands[opp][m.to.h] > 0);
      let favorite = null;
      for (const m of (pool.length ? pool : attacks)) {
        if (!favorite) { favorite = m; continue; }
        const t = g.hands[opp][m.to.h], a = g.hands[me][m.from.h];
        const ft = g.hands[opp][favorite.to.h], fa = g.hands[me][favorite.from.h];
        if (t < ft || (t === ft && a < fa)) favorite = m;
      }
      if (favorite && !opponentCanKillMyHand(g, favorite)) return favorite;
      const others = moves.filter((m) => m !== favorite);
      if (!others.length) return favorite || moves[0];
      return others[Math.floor(rng() * others.length)];
    },
  },

  optimal: {
    description: "Perfect play. Solves the current ruleset exactly (retrograde " +
      "analysis over the whole position graph) and plays a game-theoretically " +
      "optimal move: the fastest forced win when winning, the longest resistance " +
      "when losing, and a trap-setting 'swindle' in drawn positions. Unbeatable — " +
      "the best you can do against it is whatever the ruleset's value allows.",
    choose(g, moves, rng = Math.random) {
      return Solver.chooseMove(g, moves, rng);
    },
  },
};

/* The remote adapter delegates the decision to a separate process on a chosen
   localhost port — useless on a static host, so builds can drop it entirely. */
if (REMOTE_CPU) {
  CPUS.remote = {
    description: "Delegates the decision to a separate process on a chosen " +
      "localhost port; it receives the position and the list of legal moves " +
      "as JSON and returns the chosen move's index (and, optionally, its name).",
    async choose(g, moves) {
      const port = config.ports[g.turn];
      const url = `http://${config.host}:${port}${config.path}`;
      if (typeof fetch !== "function")
        throw new Error("The remote CPU needs a browser fetch(); not available here.");
      const payload = {
        hands: g.hands, turn: g.turn, names: g.names, rules: g.rules, moves,
      };
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), config.timeoutMs);
      let data;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        data = await res.json();
      } catch (e) {
        const why = e.name === "AbortError" ? "timed out" : e.message;
        throw new Error(`Remote engine on port ${port} — ${why}.`);
      } finally {
        clearTimeout(timer);
      }
      // Let the engine introduce itself; the UI shows this name in game.
      if (data && typeof data.name === "string" && data.name.trim())
        config.reportedNames[g.turn] = data.name.trim().slice(0, 24);
      const idx = typeof data === "number" ? data : data && data.move;
      if (!Number.isInteger(idx) || idx < 0 || idx >= moves.length)
        throw new Error(`Remote engine returned an invalid move index: ${idx}.`);
      return moves[idx];
    },
  };
}

const api = { CPUS, config, successorState, opponentCanKillMyHand };

export default api;
