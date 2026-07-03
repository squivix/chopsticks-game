/* Chopsticks rules engine — JS port of chopsticks.py (see RULESETS.md).
 * ES module: imported by the Vue app and by Node/Vitest for headless
 * unit-testing of the rules. Self-contained (no dependencies). */

const DEFAULT_RULES = {
  // Elimination (RULESETS.md 3.1-3.2)
  rollover: false,      // false: hand dies at >= base. true: wraps mod base, dies only on exact base
  base: 5,
  start: [1, 1],
  fraction: 1,          // display granularity: 1 whole, 2 knubs (halves), 4 quarter-knubs.
                        // base/start are already in these units; purely cosmetic to the engine.
  integers: false,      // negative/zero hands via a sign-flip move; a hand dies at magnitude base
  // Splits (3.3)
  transfers: true,
  divisions: true,
  suicide: false,
  swaps: false,
  swapsNeedDead: false, // Logan Clause
  swapLimit: 0,         // max consecutive swaps per player (0 = unlimited)
  passMove: false,
  evenSplitsOnly: false,
  oddNearEven: true,
  onePointSwitch: false,
  // Extra moves (3.4)
  meta: false,
  selfAttack: false,
  deathAttack: false,
  selfAdd: false,
  cherryBomb: false,
  // Win condition (3.5)
  misere: false,
  suddenDeath: false,
  repetitionDraw: 3,    // 0 = off
};

const PRESETS = {
  "standard":       ["Common schoolyard game: cutoff, transfers + divisions", {}],
  "rollover":       ["Wikipedia 'official' rules: wrap mod 5, exact-5 kill", { rollover: true }],
  "misere":         ["Standard, but losing both hands first WINS", { misere: true }],
  "suicide":        ["Standard + splits may kill your own hand", { suicide: true }],
  "swaps":          ["Standard + mirror swaps (max 3 in a row)", { swaps: true, swapLimit: 3 }],
  "logan":          ["Standard + Logan Clause (swap a dead hand for a live one)",
                     { swaps: true, swapsNeedDead: true }],
  "meta":           ["Rollover + Meta: combine hands totalling >5, subtract 5, redistribute",
                     { rollover: true, meta: true }],
  "sudden-death":   ["Standard, but a total of 1 finger loses", { suddenDeath: true }],
  "even-splits":    ["Cutoff + even splits only (Board Game Scholar's solved game)",
                     { evenSplitsOnly: true }],
  "attacks-only":   ["No splits at all — the short game", { transfers: false, divisions: false }],
  "transfers-only": ["Splits between living hands only, no reviving", { divisions: false }],
  "divisions-only": ["Splits must involve a dead hand", { transfers: false }],
  "death-attack":   ["Standard + attacking dead hands (revives them)", { deathAttack: true }],
  "self-attack":    ["Wikipedia's 'Unnamed': cutoff + swaps + self-attacks",
                     { selfAttack: true, swaps: true, swapLimit: 3 }],
  "self-adding":    ["Standard + may add 1 finger to a living hand", { selfAdd: true }],
  "cherry-bomb":    ["Rollover + exact-5 attacks explode", { rollover: true, cherryBomb: true }],
  "suns":           ["Standard from the unreachable 4444 position", { start: [4, 4] }],
  "senary":         ["Rollover in base 6", { rollover: true, base: 6 }],
  "childhood":      ["5-to-kill rollover with suicide splits, transfers/divisions, and mirror swaps (both hands alive, no stalling)",
                     { rollover: true, suicide: true, swaps: true }],
  "knubs":          ["Half-finger 'knubs': every hand splits into halves; still dies at 5 fingers",
                     { base: 10, start: [2, 2], fraction: 2 }],
  "quarter-knubs":  ["Knubs subdivided again into quarter-fingers",
                     { base: 20, start: [4, 4], fraction: 4 }],
  "integers":       ["Negative/zero hands: flip a hand to negate it (+3 → −3); a hand dies at +5 or −5",
                     { integers: true }],
  "kitchen-sink":   ["Everything legal at once",
                     { rollover: true, suicide: true, swaps: true, swapLimit: 3, meta: true,
                       selfAttack: true, deathAttack: true, selfAdd: true,
                       onePointSwitch: true, passMove: true }],
};

function makeRules(overrides) {
  const r = Object.assign({}, DEFAULT_RULES, overrides || {});
  r.start = (r.start || [1, 1]).slice();
  if (r.base < 2) throw new Error("base must be at least 2");
  if (r.start.length !== 2 || r.start.some((v) => v < 0 || v >= r.base)) {
    throw new Error(`start hands must be two values in 0..${r.base - 1}`);
  }
  if (r.start[0] + r.start[1] === 0) throw new Error("start position has no living hands");
  if (r.fraction < 1) throw new Error("fraction must be at least 1");
  return r;
}

/* Render a stored value (in 1/fraction-finger units) as a finger count:
   with fraction 2 ('knubs') a stored 5 shows as "2.5"; negatives keep sign. */
function fmtFingers(v, fraction) {
  if (!fraction || fraction === 1) return String(v);
  return String(Math.round((v / fraction) * 100) / 100);
}

function describeRules(r) {
  const f = (v) => fmtFingers(v, r.fraction);
  let elim;
  if (r.fraction > 1) {
    const unit = { 2: "knubs (half-fingers)", 4: "quarter-knubs" }[r.fraction] || `1/${r.fraction}-fingers`;
    elim = `death at ${f(r.base)} fingers (${r.rollover ? "rollover" : "cutoff"}), ${unit}`;
  } else {
    elim = r.rollover ? `death at exactly ${r.base} (rollover mod ${r.base})` : `death at ${r.base} or more (cutoff)`;
  }
  const lines = [elim, `start ${f(r.start[0])}-${f(r.start[1])}`];
  const splits = [];
  if (r.transfers) splits.push("transfers");
  if (r.divisions) splits.push("divisions");
  if (r.evenSplitsOnly) splits.push("even-only" + (r.oddNearEven ? "/near-even" : ""));
  lines.push("splits: " + (splits.length ? splits.join(", ") : "none"));
  const flags = [
    ["suicide", "suicide splits"], ["swaps", "swaps"],
    ["swapsNeedDead", "swaps only dead-for-live (Logan)"],
    ["passMove", "pass allowed"], ["onePointSwitch", "one-point switch"],
    ["meta", "meta combine"], ["selfAttack", "self-attacks"],
    ["deathAttack", "death attacks"], ["selfAdd", "self-adding"],
    ["cherryBomb", "cherry bomb"], ["misere", "misère (losing hands wins)"],
    ["suddenDeath", "sudden death at 1 finger"],
    ["integers", "integers (hands may go negative; flip a hand to negate it)"],
  ];
  for (const [flag, label] of flags) if (r[flag]) lines.push(label);
  if (r.swaps && r.swapLimit) lines.push(`max ${r.swapLimit} consecutive swaps`);
  if (r.repetitionDraw) lines.push(`${r.repetitionDraw}-fold repetition is a draw`);
  return lines.join("; ");
}

// -- game state ----------------------------------------------------------

function newGame(rules, names) {
  const g = {
    rules: makeRules(rules),
    names: names ? names.slice() : ["Player 1", "Player 2"],
    hands: null,
    turn: 0,
    swapStreak: [0, 0],
    switchUsed: [false, false],
    history: new Map(),
    log: [],
    result: null,
    winner: null, // 0 | 1 | null (null + result = draw)
  };
  g.hands = [g.rules.start.slice(), g.rules.start.slice()];
  record(g);
  return g;
}

function stateKey(g) {
  return g.hands[0].join() + "|" + g.hands[1].join() + "|" + g.turn;
}

function record(g) {
  const k = stateKey(g);
  const n = (g.history.get(k) || 0) + 1;
  g.history.set(k, n);
  return n;
}

function total(g, p) {
  return g.hands[p][0] + g.hands[p][1];
}

function hit(g, target, hitBy) {
  // Death is by magnitude so the integers rule works (a hand dies at +/-base
  // or when it lands on 0). The (((s%b)+b)%b) form folds negatives back into
  // 0..base-1 for rollover; both forms are unchanged for non-negative play.
  const b = g.rules.base;
  const s = target + hitBy;
  if (g.rules.rollover) return ((s % b) + b) % b;
  return Math.abs(s) >= b ? 0 : s;
}

// -- move generation -----------------------------------------------------

const SIDE = ["L", "R"];

function legalMoves(g) {
  const r = g.rules, me = g.turn, opp = 1 - me;
  const [a, b] = g.hands[me];
  const moves = [];
  const uf = (v) => fmtFingers(v, r.fraction); // format a unit value as fingers

  const mk = (myPair, oppPair) => {
    const h = [null, null];
    h[me] = myPair.slice();
    h[opp] = oppPair.slice();
    return h;
  };

  // Attacks
  for (let i = 0; i < 2; i++) {
    const h = g.hands[me][i];
    if (h === 0) continue;
    for (let j = 0; j < 2; j++) {
      const t = g.hands[opp][j];
      if (t === 0 && !r.deathAttack) continue;
      const raw = t + h;
      if (r.cherryBomb && raw === r.base) {
        const my = [a, b]; my[i] = 1;
        const op = g.hands[opp].slice(); op[j] = 0;
        moves.push({
          kind: "attack", cherry: true, from: { p: me, h: i }, to: { p: opp, h: j },
          label: `Cherry bomb! ${SIDE[i]}(${uf(h)}) hits their ${SIDE[j]}(${uf(t)}) = ${uf(r.base)} — their hand dies, yours resets to 1`,
          hands: mk(my, op),
        });
        continue;
      }
      const nv = hit(g, t, h);
      const op = g.hands[opp].slice(); op[j] = nv;
      const tag = nv === 0 ? " (dead)" : (r.rollover && raw > r.base ? " (rollover)" : "");
      const verb = t === 0 ? "revives" : "hits";
      moves.push({
        kind: "attack", from: { p: me, h: i }, to: { p: opp, h: j },
        label: `Attack: ${SIDE[i]}(${uf(h)}) ${verb} their ${SIDE[j]}(${uf(t)}) → ${uf(nv)}${tag}`,
        hands: mk([a, b], op),
      });
    }
  }

  // Self-attack
  if (r.selfAttack) {
    for (const [i, j] of [[0, 1], [1, 0]]) {
      const h = g.hands[me][i], t = g.hands[me][j];
      if (h === 0 || t === 0) continue;
      const nv = hit(g, t, h);
      const my = [a, b]; my[j] = nv;
      moves.push({
        kind: "selfattack", from: { p: me, h: i }, to: { p: me, h: j },
        label: `Self-attack: ${SIDE[i]}(${uf(h)}) hits own ${SIDE[j]}(${uf(t)}) → ${uf(nv)}${nv === 0 ? " (dead)" : ""}`,
        hands: mk(my, g.hands[opp]),
      });
    }
  }

  // Self-add
  if (r.selfAdd) {
    for (let i = 0; i < 2; i++) {
      const h = g.hands[me][i];
      if (h === 0) continue;
      const nv = hit(g, h, 1);
      const my = [a, b]; my[i] = nv;
      moves.push({
        kind: "add", to: { p: me, h: i },
        label: `Add 1 finger to ${SIDE[i]}(${uf(h)}) → ${uf(nv)}${nv === 0 ? " (dead)" : ""}`,
        hands: mk(my, g.hands[opp]),
      });
    }
  }

  // Sign flip (integers rule): negate a living hand
  if (r.integers) {
    for (let i = 0; i < 2; i++) {
      const h = g.hands[me][i];
      if (h === 0) continue;
      const nv = r.rollover ? (((-h) % r.base) + r.base) % r.base : -h;
      const my = [a, b]; my[i] = nv;
      moves.push({
        kind: "flip", to: { p: me, h: i },
        label: `Flip ${SIDE[i]}(${uf(h)}) → ${uf(nv)}`,
        hands: mk(my, g.hands[opp]),
      });
    }
  }

  // Splits (incl. swaps, pass, one-point switch) — only among non-negative
  // hands (splitting a negative hand is undefined in the integers variant).
  const tot = a + b;
  if (a >= 0 && b >= 0) {
    for (let c = 0; c <= Math.min(tot, r.base - 1); c++) {
      const d = tot - c;
      if (d < 0 || d >= r.base) continue;
      const kind = splitKind(g, a, b, c, d);
      if (!kind) continue;
      moves.push({
        kind: "split", splitName: kind,
        label: `${kind}: ${uf(a)}-${uf(b)} → ${uf(c)}-${uf(d)}`,
        hands: mk([c, d], g.hands[opp]),
        isSwap: kind === "Swap",
        usesSwitch: kind === "One-point switch",
      });
    }
  }

  // Meta
  if (r.meta && tot > r.base && a >= 0 && b >= 0) {
    const rem = tot - r.base;
    for (let c = 0; c <= Math.min(rem, r.base - 1); c++) {
      const d = rem - c;
      if (d < 0 || d >= r.base) continue;
      if ((c === 0 || d === 0) && !r.suicide) continue;
      moves.push({
        kind: "meta",
        label: `Meta: combine ${uf(a)}-${uf(b)} (${uf(tot)}), subtract ${uf(r.base)} → ${uf(c)}-${uf(d)}`,
        hands: mk([c, d], g.hands[opp]),
      });
    }
  }

  return moves;
}

function splitKind(g, a, b, c, d) {
  const r = g.rules, me = g.turn;
  if (c === a && d === b) return r.passMove ? "Pass" : null;
  if (c === b && d === a) { // pure mirror swap (a != b)
    if (r.onePointSwitch && !g.switchUsed[me] && a + b === 1) return "One-point switch";
    if (!r.swaps) return null;
    // plain swaps need two live hands; Logan Clause swaps need a dead one
    if ((a === 0 || b === 0) !== r.swapsNeedDead) return null;
    if (r.swapLimit && g.swapStreak[me] >= r.swapLimit) return null;
    return "Swap";
  }
  if (r.evenSplitsOnly) {
    if (!(c === d || (r.oddNearEven && Math.abs(c - d) === 1))) return null;
  }
  const kills = (a > 0 && c === 0) || (b > 0 && d === 0);
  const revives = (a === 0 && c > 0) || (b === 0 && d > 0);
  if (kills && !r.suicide) return null;
  if (revives && !r.divisions) return null;
  if (!kills && !revives && !r.transfers) return null;
  if (kills) return "Suicide split";
  if (revives) return "Division";
  return "Transfer";
}

// -- applying moves ------------------------------------------------------

function applyMove(g, move) {
  const me = g.turn;
  g.log.push({ player: me, label: move.label });
  g.hands = [move.hands[0].slice(), move.hands[1].slice()];
  g.swapStreak[me] = move.isSwap ? g.swapStreak[me] + 1 : 0;
  if (move.usesSwitch) g.switchUsed[me] = true;
  g.turn = 1 - g.turn;
  checkEnd(g);
}

function checkEnd(g) {
  const r = g.rules;
  for (let p = 0; p < 2; p++) {
    const bothOut = g.hands[p][0] === 0 && g.hands[p][1] === 0;
    const t = total(g, p);
    if (bothOut || (r.suddenDeath && t === 1)) {
      const winner = r.misere ? p : 1 - p;
      const how = bothOut ? "lost both hands" : "is down to 1 finger";
      const verb = r.misere ? "wins" : "loses";
      g.winner = winner;
      g.result = `${g.names[p]} ${how} — and ${verb}! ${g.names[winner]} is the winner.`;
      return;
    }
  }
  if (r.repetitionDraw && record(g) >= r.repetitionDraw) {
    g.result = `Draw by ${r.repetitionDraw}-fold repetition.`;
    return;
  }
  if (legalMoves(g).length === 0) {
    const stuck = g.turn;
    const winner = r.misere ? stuck : 1 - stuck;
    g.winner = winner;
    g.result = `${g.names[stuck]} has no legal moves — ${g.names[winner]} is the winner.`;
  }
}

const Chopsticks = {
  DEFAULT_RULES, PRESETS,
  makeRules, describeRules, newGame, legalMoves, applyMove, stateKey,
};

export default Chopsticks;
