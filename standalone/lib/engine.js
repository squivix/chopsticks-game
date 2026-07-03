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
  // Table (multiplayer)
  players: 2,           // number of seats (>= 2); everyone starts from `start`
  direction: 1,         // turn order around the table: +1 clockwise, -1 counter-clockwise
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
  r.players = r.players | 0;
  if (r.players < 2) throw new Error("a game needs at least 2 players");
  r.direction = r.direction < 0 ? -1 : 1;
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
  const r = makeRules(rules);
  const n = r.players;
  const g = {
    rules: r,
    names: names ? names.slice() : Array.from({ length: n }, (_, i) => `Player ${i + 1}`),
    hands: Array.from({ length: n }, () => r.start.slice()),
    turn: 0,
    swapStreak: Array(n).fill(0),
    switchUsed: Array(n).fill(false),
    eliminated: Array(n).fill(false), // a seat is out once both its hands are dead
    history: new Map(),
    log: [],
    result: null,
    winner: null, // seat index, or null (null + result = draw)
  };
  record(g);
  return g;
}

function stateKey(g) {
  return g.hands.map((h) => h.join()).join("|") + "|" + g.turn;
}

/* A seat is out when both hands are dead (or it has been eliminated another
   way, e.g. sudden death). Works on lightweight states that lack `eliminated`
   by falling back to the hands. */
function isOut(g, p) {
  if (g.eliminated) return g.eliminated[p];
  return g.hands[p][0] === 0 && g.hands[p][1] === 0;
}

function livePlayers(g) {
  const live = [];
  for (let p = 0; p < g.rules.players; p++) if (!isOut(g, p)) live.push(p);
  return live;
}

/* The next seat to move, walking in the table's direction and skipping any
   seat that is already out. For two players this is just the other seat. */
function nextTurn(g, from) {
  const n = g.rules.players, dir = g.rules.direction;
  let p = from;
  for (let k = 0; k < n; k++) {
    p = ((p + dir) % n + n) % n;
    if (!isOut(g, p)) return p;
  }
  return from;
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
  const r = g.rules, me = g.turn, n = r.players;
  const [a, b] = g.hands[me];
  const moves = [];
  const uf = (v) => fmtFingers(v, r.fraction); // format a unit value as fingers
  const multi = n > 2; // name the target explicitly when there's more than one opponent

  // Full post-move hands: clone every seat, callers overwrite what changed.
  const clone = () => g.hands.map((hand) => hand.slice());

  // Attacks — against any living opponent's hand.
  for (let i = 0; i < 2; i++) {
    const h = g.hands[me][i];
    if (h === 0) continue;
    for (let q = 0; q < n; q++) {
      if (q === me || isOut(g, q)) continue;
      const theirs = multi ? `${g.names ? g.names[q] : "P" + (q + 1)}'s` : "their";
      for (let j = 0; j < 2; j++) {
        const t = g.hands[q][j];
        if (t === 0 && !r.deathAttack) continue;
        const raw = t + h;
        if (r.cherryBomb && raw === r.base) {
          const H = clone(); H[me][i] = 1; H[q][j] = 0;
          moves.push({
            kind: "attack", cherry: true, from: { p: me, h: i }, to: { p: q, h: j },
            label: `Cherry bomb! ${SIDE[i]}(${uf(h)}) hits ${theirs} ${SIDE[j]}(${uf(t)}) = ${uf(r.base)} — that hand dies, yours resets to 1`,
            hands: H,
          });
          continue;
        }
        const nv = hit(g, t, h);
        const H = clone(); H[q][j] = nv;
        const tag = nv === 0 ? " (dead)" : (r.rollover && raw > r.base ? " (rollover)" : "");
        const verb = t === 0 ? "revives" : "hits";
        moves.push({
          kind: "attack", from: { p: me, h: i }, to: { p: q, h: j },
          label: `Attack: ${SIDE[i]}(${uf(h)}) ${verb} ${theirs} ${SIDE[j]}(${uf(t)}) → ${uf(nv)}${tag}`,
          hands: H,
        });
      }
    }
  }

  // Self-attack
  if (r.selfAttack) {
    for (const [i, j] of [[0, 1], [1, 0]]) {
      const h = g.hands[me][i], t = g.hands[me][j];
      if (h === 0 || t === 0) continue;
      const nv = hit(g, t, h);
      const H = clone(); H[me][j] = nv;
      moves.push({
        kind: "selfattack", from: { p: me, h: i }, to: { p: me, h: j },
        label: `Self-attack: ${SIDE[i]}(${uf(h)}) hits own ${SIDE[j]}(${uf(t)}) → ${uf(nv)}${nv === 0 ? " (dead)" : ""}`,
        hands: H,
      });
    }
  }

  // Self-add
  if (r.selfAdd) {
    for (let i = 0; i < 2; i++) {
      const h = g.hands[me][i];
      if (h === 0) continue;
      const nv = hit(g, h, 1);
      const H = clone(); H[me][i] = nv;
      moves.push({
        kind: "add", to: { p: me, h: i },
        label: `Add 1 finger to ${SIDE[i]}(${uf(h)}) → ${uf(nv)}${nv === 0 ? " (dead)" : ""}`,
        hands: H,
      });
    }
  }

  // Sign flip (integers rule): negate a living hand
  if (r.integers) {
    for (let i = 0; i < 2; i++) {
      const h = g.hands[me][i];
      if (h === 0) continue;
      const nv = r.rollover ? (((-h) % r.base) + r.base) % r.base : -h;
      const H = clone(); H[me][i] = nv;
      moves.push({
        kind: "flip", to: { p: me, h: i },
        label: `Flip ${SIDE[i]}(${uf(h)}) → ${uf(nv)}`,
        hands: H,
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
      const H = clone(); H[me] = [c, d];
      moves.push({
        kind: "split", splitName: kind,
        label: `${kind}: ${uf(a)}-${uf(b)} → ${uf(c)}-${uf(d)}`,
        hands: H,
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
      const H = clone(); H[me] = [c, d];
      moves.push({
        kind: "meta",
        label: `Meta: combine ${uf(a)}-${uf(b)} (${uf(tot)}), subtract ${uf(r.base)} → ${uf(c)}-${uf(d)}`,
        hands: H,
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
  const r = g.rules, me = g.turn;
  g.log.push({ player: me, label: move.label });
  g.hands = move.hands.map((h) => h.slice());
  g.swapStreak[me] = move.isSwap ? g.swapStreak[me] + 1 : 0;
  if (move.usesSwitch) g.switchUsed[me] = true;

  // Knock out any newly-dead seats *before* passing the turn, so the hand-off
  // skips a seat this move just eliminated.
  const newly = markEliminations(g);

  // Misère: the goal is to be knocked out, so the first seat to fall wins.
  if (r.misere && newly.length) {
    const w = newly[0].p;
    const how = newly[0].bothOut ? "lost both hands" : "is down to 1 finger";
    return win(g, w, `${g.names[w]} ${how} first — and wins the misère game!`);
  }

  // Normal: last seat standing takes it.
  let live = livePlayers(g);
  if (live.length <= 1) {
    if (!live.length) { g.result = "Everyone is out at once — a draw."; g.winner = null; return; }
    let how;
    if (newly.length === 1)
      how = `${g.names[newly[0].p]} ${newly[0].bothOut ? "lost both hands" : "is down to 1 finger"}`;
    else if (newly.length > 1)
      how = `${newly.map((x) => g.names[x.p]).join(" & ")} are out`;
    else
      how = `${g.names[live[0]]} is the only one left`;
    return win(g, live[0], how + " —");
  }

  g.turn = nextTurn(g, me);

  if (r.repetitionDraw && record(g) >= r.repetitionDraw) {
    g.result = `Draw by ${r.repetitionDraw}-fold repetition.`;
    return;
  }

  // The seat to move can't: it's stuck. In misère that's a win; otherwise the
  // seat drops out and play carries on (in a 2-player game that ends it).
  if (legalMoves(g).length === 0) {
    const stuck = g.turn;
    if (r.misere)
      return win(g, stuck, `${g.names[stuck]} has no legal moves — and wins the misère game!`);
    g.eliminated[stuck] = true;
    live = livePlayers(g);
    if (live.length <= 1) {
      const w = live.length ? live[0] : null;
      g.winner = w;
      g.result = `${g.names[stuck]} has no legal moves — ${w != null ? g.names[w] : "nobody"} is the winner.`;
      return;
    }
    g.turn = nextTurn(g, stuck);
  }
}

/* Record a decided game. `lead` is the "why" clause; the winner sentence is
   appended after " — " so the UI can split the reason from the verdict. */
function win(g, w, lead) {
  g.winner = w;
  g.result = `${lead} ${g.names[w]} is the winner.`;
}

/* Newly-dead seats at the current position: mark them out and report how they
   fell (for the result text). */
function markEliminations(g) {
  const r = g.rules, newly = [];
  for (let p = 0; p < r.players; p++) {
    if (g.eliminated[p]) continue;
    const bothOut = g.hands[p][0] === 0 && g.hands[p][1] === 0;
    const sudden = r.suddenDeath && total(g, p) === 1;
    if (bothOut || sudden) { g.eliminated[p] = true; newly.push({ p, bothOut }); }
  }
  return newly;
}

const Chopsticks = {
  DEFAULT_RULES, PRESETS,
  makeRules, describeRules, newGame, legalMoves, applyMove, stateKey,
  nextTurn, livePlayers, isOut,
};

export default Chopsticks;
