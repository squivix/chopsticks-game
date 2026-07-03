import C from "./engine.js";

/* Chopsticks perfect-play solver.
 *
 * Chopsticks has a tiny state space (a few hundred to a few thousand positions,
 * even for exotic rulesets), so we don't approximate — we *solve* it exactly.
 * For a given ruleset we enumerate every reachable position and label each one
 * WIN / LOSS / DRAW for the player to move via retrograde analysis (backward
 * induction from terminal positions, endgame-tablebase style).
 *
 * Why retrograde and not plain minimax: transfers, swaps and passes let
 * positions repeat, so the game graph has *cycles*. Recursive minimax would
 * loop; retrograde analysis handles cycles correctly (a position nobody can
 * force a win from, but the mover can avoid losing, is a DRAW). This matches
 * the engine's repetition-draw rule, which realises those cycles as draws.
 *
 * Because the game is two-player, zero-sum and perfect-information, the label
 * IS the game-theoretic value: an `optimal` bot playing the table is a security
 * strategy — it secures at least the value against *any* opponent, with no need
 * to model who it's facing.
 *
 * ES module used by the app and Node/Vitest. Depends only on
 * the engine (engine.js), never on cpu.js. */

"use strict";


/* Solved tables are expensive-ish to build but constant per ruleset, so we
   memoise by a canonical signature of the rules object. */
const cache = new Map();
function rulesKey(r) {
  return Object.keys(r).sort().map((k) => k + ":" + JSON.stringify(r[k])).join("|");
}

/* A solver "state" is the minimum the engine needs to generate moves:
   both players' hands, whose turn it is, and the swap/switch bookkeeping. */
function movesOf(rules, s) {
  return C.legalMoves({
    rules, turn: s.turn, hands: s.hands,
    swapStreak: s.swapStreak, switchUsed: s.switchUsed,
  });
}

/* Successor state after playing `move` — mirrors engine.applyMove's state
   transitions (turn flips, swap streak advances/resets, switch is spent). */
function successor(s, move) {
  const me = s.turn;
  const swapStreak = s.swapStreak.slice();
  swapStreak[me] = move.isSwap ? swapStreak[me] + 1 : 0;
  const switchUsed = s.switchUsed.slice();
  if (move.usesSwitch) switchUsed[me] = true;
  return {
    hands: [move.hands[0].slice(), move.hands[1].slice()],
    turn: 1 - me,
    swapStreak,
    switchUsed,
  };
}

/* Terminal-by-elimination check, mirroring engine.checkEnd's first pass:
   returns the winning player, or null if nobody is out yet. Player 0 is
   tested first, exactly as the engine does. */
function eliminationWinner(rules, hands) {
  for (let p = 0; p < 2; p++) {
    // Both hands out — checked per-hand, not by sum, so the integers rule's
    // live +3/−3 (sum 0) isn't mistaken for a wipeout.
    const bothOut = hands[p][0] === 0 && hands[p][1] === 0;
    const t = hands[p][0] + hands[p][1];
    if (bothOut || (rules.suddenDeath && t === 1)) return rules.misere ? p : 1 - p;
  }
  return null;
}

/* Solve a ruleset: returns { get(state) -> {result, depth}, size, keyOf }.
   `result` is 'W' | 'L' | 'D' from the perspective of the state's mover;
   `depth` is distance-to-conversion (0 at terminals, Infinity for draws),
   used to pick the fastest win / longest resistance. */
function solve(rules) {
  const ck = rulesKey(rules);
  if (cache.has(ck)) return cache.get(ck);

  // Only fold swap-streak / switch flags into the state identity when the
  // rules actually make them matter — otherwise they're constant, and (for
  // unlimited swaps) an ever-growing streak counter would blow up the space.
  const trackSwap = !!(rules.swaps && rules.swapLimit > 0);
  const trackSwitch = !!rules.onePointSwitch;
  const keyOf = (s) => {
    let k = s.hands[0][0] + "." + s.hands[0][1] + "|" +
            s.hands[1][0] + "." + s.hands[1][1] + "|" + s.turn;
    if (trackSwap) k += "|" + s.swapStreak[0] + "." + s.swapStreak[1];
    if (trackSwitch) k += "|" + (s.switchUsed[0] ? 1 : 0) + (s.switchUsed[1] ? 1 : 0);
    return k;
  };

  const nodes = new Map(); // key -> { s, children:[key], remaining, result, depth }
  const start = {
    hands: [rules.start.slice(), rules.start.slice()],
    turn: 0, swapStreak: [0, 0], switchUsed: [false, false],
  };
  const startKey = keyOf(start);
  nodes.set(startKey, { s: start });

  // 1) Enumerate every reachable position (BFS), classifying terminals.
  const bfs = [startKey];
  for (let head = 0; head < bfs.length; head++) {
    const node = nodes.get(bfs[head]);
    const s = node.s;

    const elim = eliminationWinner(rules, s.hands);
    if (elim !== null) {
      node.result = elim === s.turn ? "W" : "L"; // mover already won/lost
      node.depth = 0; node.children = [];
      continue;
    }
    const moves = movesOf(rules, s);
    if (moves.length === 0) { // stuck: normally win-by-no-moves, flipped in misère
      const winner = rules.misere ? s.turn : 1 - s.turn;
      node.result = winner === s.turn ? "W" : "L";
      node.depth = 0; node.children = [];
      continue;
    }

    const seen = new Set();
    const children = [];
    for (const m of moves) {
      const cs = successor(s, m);
      const cKey = keyOf(cs);
      if (!seen.has(cKey)) { seen.add(cKey); children.push(cKey); }
      if (!nodes.has(cKey)) { nodes.set(cKey, { s: cs }); bfs.push(cKey); }
    }
    node.children = children;
  }

  // 2) Retrograde propagation from the terminals.
  //    A node is WIN as soon as one child is a LOSS (for that child's mover =
  //    the opponent); a node is LOSS once *every* child is a WIN; anything
  //    still unlabelled at the fixpoint is a DRAW.
  const parents = new Map(); // key -> [parent key]
  for (const [k, node] of nodes) {
    node.remaining = node.children.length;
    for (const cKey of node.children) {
      (parents.get(cKey) || parents.set(cKey, []).get(cKey)).push(k);
    }
  }
  const queue = [];
  for (const [k, node] of nodes) if (node.result) queue.push(k);
  for (let qi = 0; qi < queue.length; qi++) {
    const node = nodes.get(queue[qi]);
    for (const pKey of parents.get(queue[qi]) || []) {
      const parent = nodes.get(pKey);
      if (parent.result) continue;
      if (node.result === "L") {              // opponent loses here → parent wins
        parent.result = "W";
        parent.depth = node.depth + 1;        // fastest win: first (shortest) loss found
        queue.push(pKey);
      } else {                                // node.result === "W"
        parent.remaining--;
        parent.depth = Math.max(parent.depth || 0, node.depth + 1); // longest resistance
        if (parent.remaining === 0) { parent.result = "L"; queue.push(pKey); }
      }
    }
  }
  for (const node of nodes.values())
    if (!node.result) { node.result = "D"; node.depth = Infinity; }

  const table = {
    keyOf,
    size: nodes.size,
    get: (s) => nodes.get(keyOf(s)),
    // Introspection for tooling/explainability: every solved position with
    // its value, distance-to-conversion, and whether it's terminal.
    entries: () => [...nodes.values()].map((n) => ({
      hands: [n.s.hands[0].slice(), n.s.hands[1].slice()],
      turn: n.s.turn, swapStreak: n.s.swapStreak.slice(), switchUsed: n.s.switchUsed.slice(),
      result: n.result, depth: n.depth, terminal: n.children.length === 0,
    })),
  };
  cache.set(ck, table);
  return table;
}

/* Pick a perfect move for the side to move in game `g` from its legal `moves`.
   Winning: take the fastest mate. Losing: resist longest (also maximises the
   chances a fallible opponent slips). Drawn: play a "swindle" — the drawn
   move that leaves the opponent the most ways to blunder into a loss. */
function chooseMove(g, moves, rng = Math.random) {
  const table = solve(g.rules);
  const s = {
    hands: g.hands, turn: g.turn,
    swapStreak: g.swapStreak, switchUsed: g.switchUsed,
  };

  const evals = moves.map((m) => {
    const node = table.get(successor(s, m));
    return { m, result: node ? node.result : "D", depth: node ? node.depth : Infinity };
  });
  // A move's node is scored from the *opponent's* perspective (they move next):
  // opponent 'L' means we win, 'W' means we lose, 'D' means draw.
  const wins = evals.filter((e) => e.result === "L");
  const draws = evals.filter((e) => e.result === "D");
  const losses = evals.filter((e) => e.result === "W");

  let pool;
  if (wins.length) {
    const best = Math.min(...wins.map((e) => e.depth));   // shortest forced win
    pool = wins.filter((e) => e.depth === best);
  } else if (draws.length) {
    pool = swindle(g.rules, table, s, draws);
  } else {
    const best = Math.max(...losses.map((e) => e.depth)); // drag the loss out
    pool = losses.filter((e) => e.depth === best);
  }
  return pool[Math.floor(rng() * pool.length)].m;
}

/* Among drawn continuations, prefer the one where the opponent has the most
   replies that would hand us the win — i.e. maximise their chance to err.
   (From a drawn position the opponent can always hold the draw, so no reply
   of theirs loses *our* thread; we're only counting their potential slips.) */
function swindle(rules, table, s, draws) {
  let best = -1, pool = draws;
  for (const e of draws) {
    const cs = successor(s, e.m);
    let blunders = 0;
    for (const reply of movesOf(rules, cs)) {
      const node = table.get(successor(cs, reply));
      if (node && node.result === "W") blunders++; // 'W' for us, the mover after their slip
    }
    if (blunders > best) { best = blunders; pool = [e]; }
    else if (blunders === best) pool.push(e);
  }
  return pool;
}

const api = { solve, chooseMove, successor };

export default api;
