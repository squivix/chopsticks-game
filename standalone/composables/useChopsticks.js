/* The Chopsticks game store: all reactive state and behaviour for a session,
   created once in App.vue and shared with every component through provide/inject.
   The rules engine, solver and CPU adapters (../lib) are framework-agnostic; this
   module is the only place they meet Vue's reactivity. */
import {
  ref, shallowRef, reactive, computed, watch, triggerRef, provide, inject, markRaw,
} from "vue";
import C from "../lib/engine.js";
import Solver from "../lib/solver.js";
import ChopsticksCPU from "../lib/cpu.js";
import { handSVG, SKINS } from "../lib/hand-svg.js";
import { sideWord, fmtFingers, cap, SPLIT_ASIDE } from "../lib/format.js";
import { RULE_FIELDS } from "../lib/rule-fields.js";

const GameKey = Symbol("chopsticks-game");

const cpuNames = Object.keys(ChopsticksCPU.CPUS);
const builtinPresets = Object.entries(C.PRESETS).map(([name, [desc]]) => ({ name, desc }));

/* Provide the store to the component subtree. Call once, high up (App.vue). */
export function provideGame() {
  // reactive() so components can read `store.foo` and have refs auto-unwrap,
  // the way Vue unwraps refs returned from setup(); the game object itself is
  // markRaw'd (see startGame) so this wrapper never deep-proxies it.
  const store = reactive(createStore());
  provide(GameKey, store);
  return store;
}

/* Inject the shared store from any descendant component. */
export function useGame() {
  const store = inject(GameKey);
  if (!store) throw new Error("useGame() called with no game provided above it.");
  return store;
}

function createStore() {
  /* ---------------- persisted / reactive state ---------------- */
  const view = ref("setup");
  const theme = ref(localStorage.getItem("chopsticks.theme") || "dark");
  const currentPreset = ref(localStorage.getItem("chopsticks.preset") || "standard");
  const currentOverrides = ref(
    JSON.parse(localStorage.getItem("chopsticks.rules") || "null")
    || Object.assign({}, C.PRESETS[currentPreset.value] ? C.PRESETS[currentPreset.value][1] : {}));
  const names = ref(JSON.parse(localStorage.getItem("chopsticks.names") || '["",""]'));
  const controllers = ref(
    JSON.parse(localStorage.getItem("chopsticks.controllers") || '["human","human"]')
      .map((c) => (c === "human" || ChopsticksCPU.CPUS[c]) ? c : "human"));
  const customPresets = ref(JSON.parse(localStorage.getItem("chopsticks.customPresets") || "{}"));
  const remotePorts = ref(
    JSON.parse(localStorage.getItem("chopsticks.remotePorts") || "null")
    || ChopsticksCPU.config.ports.slice());
  ChopsticksCPU.config.ports = remotePorts.value.slice();

  const watchStep = ref(localStorage.getItem("chopsticks.watchStep") === "1");
  const cheat = ref(false); // always off at the start of a session; not persisted
  const game = shallowRef(null);
  const selected = ref(null);   // {p, h} of the selected origin hand
  const rearrange = ref(null);  // [left, right] working values while moving fingers
  const undoStack = ref([]);
  const pop = ref([]);          // "p-h" keys currently playing the pop animation
  const cpuError = ref("");     // transient CPU-failure message shown in the hint line
  const presetName = ref("");   // "new preset" text field
  const fv = reactive({});      // rule-form values

  // Non-reactive: async CPU bookkeeping.
  let cpuTimer = null;
  let cpuToken = 0; // bumped whenever the position changes, to discard stale async CPU replies

  /* ---------------- text helpers (read live state) ---------------- */
  const show = (v) => (v === 0 ? "✊" : fmtFingers(v, game.value.rules.fraction));

  function engineName(p) {
    return (controllers.value[p] !== "human" && ChopsticksCPU.config.reportedNames[p]) || "";
  }
  /* Display name for player p. game.names holds the resolved name part (entered
     name, or the "Player N" / "CPU N" default). Humans show it as-is; CPUs always
     get their strategy appended in parentheses — "<name> (dummy)". A remote
     engine's self-reported name refines a still-default CPU name. */
  function playerLabel(p) {
    if (controllers.value[p] === "human") return game.value.names[p];
    const isDefault = game.value.names[p] === `CPU ${p + 1}`;
    const nm = (isDefault && engineName(p)) || game.value.names[p];
    return `${nm} (${controllers.value[p]})`;
  }
  /* Resolve the raw entered names into display name parts: an entered name wins;
     otherwise a human is "Player N" and a CPU is "CPU N". */
  function resolveNames() {
    return names.value.map((nm, p) =>
      (nm && nm.trim()) || `${controllers.value[p] === "human" ? "Player" : "CPU"} ${p + 1}`);
  }

  function describeMove(m) {
    const g = game.value, me = g.turn;
    const opName = playerLabel(1 - me);
    const base = g.rules.base;
    const F = (v) => fmtFingers(v, g.rules.fraction);
    if (m.kind === "attack") {
      const sideT = sideWord(m.to.p, m.to.h);
      const using = `with the ${sideWord(m.from.p, m.from.h)} hand`;
      const h = g.hands[m.from.p][m.from.h];
      const t = g.hands[m.to.p][m.to.h];
      const nv = m.hands[m.to.p][m.to.h];
      if (m.cherry) return `cherry-bombs ${opName}'s ${sideT} hand ${using} (${F(t)} + ${F(h)} = ${F(base)}): it's out, and the tapping hand resets to 1`;
      if (t === 0) return `taps ${opName}'s dead ${sideT} hand ${using}, back to life at ${F(nv)}`;
      if (nv === 0) return `taps ${opName}'s ${sideT} hand ${using}: ${F(t)} + ${F(h)} = ${F(t + h)} — hand out!`;
      if (nv !== t + h) return `taps ${opName}'s ${sideT} hand ${using}: ${F(t)} + ${F(h)} = ${F(t + h)}, wraps around to ${F(nv)}`;
      return `taps ${opName}'s ${sideT} hand ${using}: ${F(t)} + ${F(h)} = ${F(nv)}`;
    }
    if (m.kind === "selfattack") {
      const h = g.hands[me][m.from.h], t = g.hands[me][m.to.h];
      const nv = m.hands[me][m.to.h];
      return `taps own ${sideWord(me, m.to.h)} hand with the ${sideWord(me, m.from.h)} hand: ${F(t)} + ${F(h)} = ${F(t + h)}` +
        (nv === 0 ? " — hand out!" : nv !== t + h ? `, wraps around to ${F(nv)}` : "");
    }
    if (m.kind === "add") {
      const v = g.hands[me][m.to.h], nv = m.hands[me][m.to.h];
      return nv === 0
        ? `raises a finger on the ${sideWord(me, m.to.h)} hand: ${F(v)} + 1 = ${F(v + 1)} — hand out!`
        : `raises a finger on the ${sideWord(me, m.to.h)} hand (${F(v)} → ${F(nv)})`;
    }
    if (m.kind === "flip") {
      const v = g.hands[me][m.to.h], nv = m.hands[me][m.to.h];
      return `flips the ${sideWord(me, m.to.h)} hand over: ${F(v)} → ${F(nv)}`;
    }
    const [a, b] = g.hands[me], [c, d] = m.hands[me];
    if (m.kind === "meta")
      return `combines both hands (${F(a)} + ${F(b)} = ${F(a + b)}), drops ${F(base)}, and regrows ${show(c)} & ${show(d)}`;
    switch (m.splitName) {
      case "Pass": return "passes";
      case "Swap": return `swaps hands (${F(a)} & ${F(b)} → ${F(b)} & ${F(a)})`;
      case "One-point switch": return "switches the last finger to the other hand";
      case "Division": return `revives the dead hand: ${show(a)} & ${show(b)} → ${F(c)} & ${F(d)}`;
      case "Suicide split": return `folds a hand away: ${F(a)} & ${F(b)} → ${show(c)} & ${show(d)}`;
      default: return `moves fingers around: ${F(a)} & ${F(b)} → ${F(c)} & ${F(d)}`;
    }
  }

  /* Short verdict; who "you" is depends on who was playing. */
  function outcomeText() {
    const g = game.value;
    if (g.winner == null) return g.result; // draw
    const w = g.winner;
    const humans = controllers.value.filter((c) => c === "human").length;
    if (humans === 2) return `${g.names[w]} wins!`;
    if (humans === 1) return controllers.value[w] === "human" ? "You win!" : "You lose!";
    return `${playerLabel(w)} wins!`;
  }

  function isWatch() {
    return controllers.value[0] !== "human" && controllers.value[1] !== "human";
  }
  function rearrangeMatch(moves) {
    const g = game.value, ra = rearrange.value;
    return moves.find((m) => m.kind === "split"
      && m.hands[g.turn][0] === ra[0] && m.hands[g.turn][1] === ra[1]);
  }

  /* ---------------- derived rendering state ---------------- */
  const legal = computed(() =>
    (game.value && !game.value.result) ? C.legalMoves(game.value) : []);

  const origins = computed(() => {
    const s = new Set();
    for (const m of legal.value) if (m.from) s.add(`${m.from.p}-${m.from.h}`);
    return s;
  });
  const targets = computed(() => {
    const map = new Map(), sel = selected.value;
    if (sel) for (const m of legal.value)
      if (m.from && m.from.p === sel.p && m.from.h === sel.h) map.set(`${m.to.p}-${m.to.h}`, m);
    return map;
  });

  function handHtml(p, h) {
    const g = game.value;
    if (!g) return "";
    const me = g.turn;
    const v = (rearrange.value && p === me) ? rearrange.value[h] : g.hands[p][h];
    const fr = g.rules.fraction || 1;
    const dead = v === 0;
    return handSVG(Math.abs(v) / fr, Object.assign({
      dead, mirror: h === 1, flip: p === 1, negative: v < 0,
      label: dead ? "" : fmtFingers(v, fr).replace("-", "−"),
    }, SKINS[p]));
  }

  function handMods(p, h) {
    const g = game.value, mods = {};
    if (!g) return mods;
    const me = g.turn, key = `${p}-${h}`;
    if (pop.value.includes(key)) mods.pop = true;
    if (g.result || controllers.value[me] !== "human") return mods;
    if (rearrange.value) {
      if (p === me && rearrange.value[h] > 0 && rearrange.value[1 - h] < g.rules.base - 1) mods.selectable = true;
      else if (p !== me) mods.dim = true;
      return mods;
    }
    const sel = selected.value;
    if (sel && sel.p === p && sel.h === h) mods.selected = true;
    else if (targets.value.has(key)) mods.target = true;
    else if (p === me && origins.value.has(key)) mods.selectable = true;
    return mods;
  }

  const activeP = computed(() =>
    (game.value && !game.value.result) ? game.value.turn : -1);
  const labelTop = computed(() => game.value ? playerLabel(1) : "");
  const labelBottom = computed(() => game.value ? playerLabel(0) : "");

  /* Hint line + move buttons, built together (the "use the buttons below" hint
     depends on whether any buttons exist). */
  const play = computed(() => {
    const g = game.value;
    if (!g) return { hint: "", buttons: [] };
    const me = g.turn, moves = legal.value, buttons = [];
    const add = (text, action, primary = false, disabled = false) =>
      buttons.push({ text, action, primary, disabled });

    if (g.result) return { hint: "", buttons: [] };

    if (controllers.value[me] !== "human") {
      const who = playerLabel(me);
      return {
        hint: (isWatch() && watchStep.value) ? `🤖 ${who} to move — press Step.` : `🤖 ${who} is thinking…`,
        buttons: [],
      };
    }

    if (rearrange.value) {
      const ra = rearrange.value;
      const match = rearrangeMatch(moves);
      const unchanged = ra[0] === g.hands[me][0] && ra[1] === g.hands[me][1];
      let hint;
      if (unchanged) {
        hint = "Tap one of your hands to move a finger to the other.";
      } else if (match) {
        hint = `${cap(describeMove(match))} (${SPLIT_ASIDE[match.splitName] || "a split"}) — confirm?`;
      } else {
        const legalArr = moves.filter((m) => m.kind === "split")
          .map((m) => `${show(m.hands[me][0])} & ${show(m.hands[me][1])}`);
        hint = `${show(ra[0])} & ${show(ra[1])} isn't allowed with these rules.` +
          (legalArr.length ? ` Legal: ${legalArr.join(", ")}.` : "");
      }
      add("✓ Confirm", () => { if (match) doMove(match); }, true, !match);
      const legalTargets = moves.filter((m) => m.kind === "split").map((m) => m.hands[me]);
      const matchesLegal = (arr) => legalTargets.some((t) => t[0] === arr[0] && t[1] === arr[1]);
      if (ra[0] !== ra[1]) {
        const mirrored = [ra[1], ra[0]];
        if (matchesLegal(mirrored)) add("Swap hands", () => { rearrange.value = mirrored; });
      }
      if ((ra[0] === 0) !== (ra[1] === 0)) {
        const tot = ra[0] + ra[1];
        const even = ra[0] >= ra[1]
          ? [Math.ceil(tot / 2), Math.floor(tot / 2)]
          : [Math.floor(tot / 2), Math.ceil(tot / 2)];
        if ((even[0] !== ra[0] || even[1] !== ra[1]) && matchesLegal(even))
          add("Split evenly", () => { rearrange.value = even; });
      }
      if (ra[0] !== 0 && ra[1] !== 0) {
        const tot = ra[0] + ra[1];
        // Pile everything onto the hand that already holds more (Swap covers
        // the other side). The mirror of Split evenly.
        const merged = ra[0] >= ra[1] ? [tot, 0] : [0, tot];
        if (matchesLegal(merged))
          add("Merge onto one hand", () => { rearrange.value = merged; });
      }
      add("Cancel", () => { rearrange.value = null; });
      return { hint, buttons };
    }

    const canRearrange = moves.some((m) => m.kind === "split" && !m.usesSwitch && m.splitName !== "Pass");
    if (canRearrange)
      add("Move fingers…", () => { rearrange.value = g.hands[me].slice(); selected.value = null; });
    for (const m of moves) {
      if (m.from) continue; // attacks & self-attacks are played by tapping hands
      if (m.kind === "split" && !m.usesSwitch && m.splitName !== "Pass") continue;
      if (m.usesSwitch) add("Switch last finger over", () => doMove(m));
      else if (m.splitName === "Pass") add("Pass", () => doMove(m));
      else if (m.kind === "add") add(`Raise a finger (${sideWord(me, m.to.h)} hand)`, () => doMove(m));
      else if (m.kind === "flip") {
        const v = g.hands[me][m.to.h], nv = m.hands[me][m.to.h];
        add(`Flip ${sideWord(me, m.to.h)} hand (${show(v)} → ${show(nv)})`, () => doMove(m));
      } else if (m.kind === "meta") {
        const [a, b] = g.hands[me], [c, d] = m.hands[me];
        add(`Combine hands: ${show(a)}+${show(b)}−${fmtFingers(g.rules.base, g.rules.fraction)} → ${show(c)} & ${show(d)}`, () => doMove(m));
      } else add(m.label, () => doMove(m));
    }

    let hint;
    if (selected.value) {
      hint = "Now tap a highlighted target hand — or tap your hand again to cancel.";
    } else {
      const hasAttack = moves.some((m) => m.from);
      const hasOther = buttons.length > 0;
      hint = `${g.names[me]}'s turn — ` +
        (hasAttack ? "tap one of your outlined hands to attack" : "") +
        (hasAttack && hasOther ? ", or " : "") +
        (hasOther ? "use the buttons below" : "") + ".";
    }
    return { hint, buttons };
  });

  const hintText = computed(() => cpuError.value || play.value.hint);

  /* Cheat mode: reveal the optimal move for the human to move. Uses the solver's
     own choice with a fixed selector so the hint is stable across re-renders. */
  const cheatUI = computed(() => {
    const g = game.value, me = g && g.turn;
    const on = cheat.value && g && !g.result && controllers.value[me] === "human";
    if (!on) return { on: false, text: "" };
    const moves = legal.value;
    if (!moves.length) return { on: true, text: "" };
    let best;
    try { best = Solver.chooseMove(g, moves, () => 0); }
    catch (e) { return { on: true, text: "💡 no hint available" }; }
    return { on: true, text: `💡 ${cap(describeMove(best))}` };
  });

  const logEntries = computed(() => {
    const g = game.value;
    if (!g) return [];
    return g.log.map((e) => ({ player: e.player, who: playerLabel(e.player), label: e.label }));
  });
  const outcome = computed(() => (game.value && game.value.result) ? outcomeText() : "");

  const showResult = computed(() => !!(game.value && game.value.result));
  const verdict = computed(() => showResult.value ? outcomeText() : "");
  const reason = computed(() =>
    (showResult.value && game.value.winner != null) ? game.value.result.split(" — ")[0] + "." : "");

  const watchLive = computed(() => isWatch() && !!game.value && !game.value.result);
  const autoToggleText = computed(() => watchStep.value ? "▶ Auto-play" : "⏸ Pause (step mode)");
  const showStep = computed(() => watchLive.value && watchStep.value);
  const stepDisabled = computed(() => !!(game.value && controllers.value[game.value.turn] === "human"));

  const rulesLine = computed(() =>
    game.value ? `${currentPreset.value} — ${C.describeRules(game.value.rules)}` : "");

  const undoDisabled = computed(() => undoStack.value.length === 0);
  const themeIcon = computed(() => theme.value === "dark" ? "☀️" : "🌙");
  const anyRemote = computed(() => controllers.value.includes("remote"));

  /* ---------------- setup-screen derived ---------------- */
  const currentMode = computed(() => {
    const [a, b] = controllers.value;
    if (a === "human" && b === "human") return "two";
    if (a === "human" && b !== "human") return "single";
    if (a !== "human" && b !== "human") return "watch";
    return null; // CPU vs human — no named mode, still valid
  });
  const customPresetNames = computed(() => Object.keys(customPresets.value));
  const namePlaceholder = (p) =>
    controllers.value[p] === "human" ? `Player ${p + 1}` : `CPU ${p + 1} (${controllers.value[p]})`;
  const presetTitle = (n) => C.describeRules(C.makeRules(customPresets.value[n]));

  /* ---------------- snapshot / undo ---------------- */
  function snapshot() {
    const g = game.value;
    return JSON.stringify({
      hands: g.hands, turn: g.turn, swapStreak: g.swapStreak,
      switchUsed: g.switchUsed, history: [...g.history], log: g.log,
      result: g.result, winner: g.winner,
    });
  }
  function restore(s) {
    const d = JSON.parse(s);
    Object.assign(game.value, d, { history: new Map(d.history) });
    triggerRef(game);
  }

  /* ---------------- moves ---------------- */
  function doMove(move) {
    cancelCPU();
    cpuError.value = "";
    undoStack.value.push(snapshot());
    const g = game.value;
    const before = [g.hands[0].slice(), g.hands[1].slice()];
    const friendly = describeMove(move);
    C.applyMove(g, move);
    g.log[g.log.length - 1].label = friendly;
    selected.value = null;
    rearrange.value = null;
    triggerRef(game);
    maybeScheduleCPU();
    const changed = [];
    for (let p = 0; p < 2; p++)
      for (let h = 0; h < 2; h++)
        if (g.hands[p][h] !== before[p][h]) changed.push(`${p}-${h}`);
    if (changed.length) {
      pop.value = [...pop.value, ...changed];
      setTimeout(() => { pop.value = pop.value.filter((k) => !changed.includes(k)); }, 380);
    }
  }

  function onHandClick(p, h) {
    const g = game.value;
    if (!g || g.result || controllers.value[g.turn] !== "human") return;
    if (rearrange.value) {
      if (p !== g.turn) return;
      if (rearrange.value[h] > 0 && rearrange.value[1 - h] < g.rules.base - 1) {
        const ra = rearrange.value.slice();
        ra[h]--; ra[1 - h]++;
        rearrange.value = ra;
      }
      return;
    }
    const moves = C.legalMoves(g);
    const sel = selected.value;
    if (sel) {
      const m = moves.find((m) => m.from && m.from.p === sel.p && m.from.h === sel.h
        && m.to.p === p && m.to.h === h);
      if (m) { doMove(m); return; }
      if (sel.p === p && sel.h === h) { selected.value = null; return; }
    }
    if (p === g.turn && moves.some((m) => m.from && m.from.p === p && m.from.h === h))
      selected.value = { p, h };
    else
      selected.value = null;
  }

  /* ---------------- CPU control ---------------- */
  function cancelCPU() {
    if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
    cpuToken++; // invalidate any in-flight (possibly async) CPU decision
  }
  /* Ask the current CPU for a move. choose() may be synchronous or async (the
     remote adapter awaits a separate process), so guard against the position
     changing while we wait and surface engine failures without crashing. */
  function runCPU() {
    const g = game.value;
    if (!g || g.result || controllers.value[g.turn] === "human") return;
    const token = cpuToken, ctrl = controllers.value[g.turn];
    cpuError.value = "";
    Promise.resolve()
      .then(() => ChopsticksCPU.CPUS[ctrl].choose(g, C.legalMoves(g)))
      .then((move) => {
        if (token !== cpuToken || g !== game.value || game.value.result) return; // stale — discard
        if (move) doMove(move);
      })
      .catch((err) => {
        if (token !== cpuToken || g !== game.value) return; // stale failure — ignore
        cancelCPU();
        cpuError.value = "⚠ " + (err && err.message ? err.message : "CPU error") +
          " — Undo to retry, or pick another player in the main menu.";
        console.warn("CPU error:", err);
      });
  }
  function maybeScheduleCPU() {
    cancelCPU();
    const g = game.value;
    if (!g || g.result || controllers.value[g.turn] === "human") return;
    // In a watch game paused into step mode, wait for a manual "Step" instead.
    if (isWatch() && watchStep.value) return;
    cpuTimer = setTimeout(() => { cpuTimer = null; runCPU(); }, 700);
  }
  function stepCPU() {
    const g = game.value;
    if (!g || g.result || controllers.value[g.turn] === "human") return;
    cancelCPU();
    runCPU();
  }

  /* ---------------- rule form ---------------- */
  function fillForm(overrides) {
    const r = Object.assign({}, C.DEFAULT_RULES, overrides);
    for (const f of RULE_FIELDS) {
      if (f.group) continue;
      if (f.key === "startL") fv.startL = r.start[0];
      else if (f.key === "startR") fv.startR = r.start[1];
      else if (f.type === "bool") fv[f.key] = !!r[f.key];
      else fv[f.key] = r[f.key];
    }
  }
  function readForm() {
    const o = {};
    for (const f of RULE_FIELDS) {
      if (f.group || f.key === "startL" || f.key === "startR") continue;
      o[f.key] = f.type === "bool" ? !!fv[f.key] : parseInt(fv[f.key] || 0, 10);
    }
    o.start = [parseInt(fv.startL || 0, 10), parseInt(fv.startR || 0, 10)];
    return o;
  }
  function markCustom() { currentPreset.value = "custom"; }

  function presetOverrides(name) {
    if (customPresets.value[name]) return Object.assign({}, customPresets.value[name]);
    if (C.PRESETS[name]) return Object.assign({}, C.PRESETS[name][1]);
    return null;
  }
  function presetChanged() {
    if (currentPreset.value !== "custom") {
      currentOverrides.value = presetOverrides(currentPreset.value) || {};
      fillForm(currentOverrides.value);
    }
  }
  function savePreset() {
    const name = presetName.value.trim();
    if (!name) { alert("Type a name for the preset first."); return; }
    if (C.PRESETS[name]) { alert(`"${name}" is a built-in preset — choose another name.`); return; }
    const o = readForm();
    try { C.makeRules(o); } catch (e) { alert("Invalid rules: " + e.message); return; }
    customPresets.value = Object.assign({}, customPresets.value, { [name]: o });
    localStorage.setItem("chopsticks.customPresets", JSON.stringify(customPresets.value));
    currentPreset.value = name; currentOverrides.value = o; presetName.value = "";
  }
  function deletePreset() {
    const name = currentPreset.value;
    if (!customPresets.value[name]) return;
    if (!confirm(`Delete saved preset "${name}"?`)) return;
    const cp = Object.assign({}, customPresets.value); delete cp[name];
    customPresets.value = cp;
    localStorage.setItem("chopsticks.customPresets", JSON.stringify(customPresets.value));
    currentPreset.value = "standard";
    currentOverrides.value = presetOverrides("standard") || {};
    fillForm(currentOverrides.value);
  }

  /* ---------------- controllers, modes, ports ---------------- */
  function persistControllers() {
    localStorage.setItem("chopsticks.controllers", JSON.stringify(controllers.value));
    localStorage.setItem("chopsticks.names", JSON.stringify(names.value));
  }
  // A CPU uses the CPU(strategy) default, so clear any stale name in its field.
  function clearNameIfCPU(p) { if (controllers.value[p] !== "human") names.value[p] = ""; }
  function ctrlChanged(p) { clearNameIfCPU(p); persistControllers(); }
  function setMode(mode) {
    const cpu = cpuNames[0] || "human";
    if (mode === "single") controllers.value = ["human", cpu];
    else if (mode === "two") controllers.value = ["human", "human"];
    else controllers.value = [cpu, cpu];
    for (const p of [0, 1]) clearNameIfCPU(p);
    persistControllers();
  }
  function applyRemotePorts() {
    ChopsticksCPU.config.ports = remotePorts.value.slice();
    localStorage.setItem("chopsticks.remotePorts", JSON.stringify(remotePorts.value));
  }
  function setPort(p, raw) {
    const v = parseInt(raw, 10);
    if (Number.isInteger(v) && v >= 1 && v <= 65535) remotePorts.value[p] = v;
    else remotePorts.value = remotePorts.value.slice(); // force input back to the canonical value
    applyRemotePorts();
  }
  function readPortInputs() { applyRemotePorts(); }

  /* ---------------- navigation ---------------- */
  function openSetup() {
    fillForm(currentOverrides.value);
    view.value = "setup";
  }
  function start() {
    const o = readForm();
    try { C.makeRules(o); } catch (e) { alert("Invalid rules: " + e.message); return; }
    names.value = names.value.map((n) => n.trim());
    currentOverrides.value = o;
    readPortInputs();
    startGame();
  }
  function startGame() {
    const display = resolveNames();
    try {
      game.value = markRaw(C.newGame(currentOverrides.value, display));
    } catch (e) {
      alert("Invalid rules: " + e.message);
      currentPreset.value = "standard"; currentOverrides.value = {};
      game.value = markRaw(C.newGame({}, display));
    }
    selected.value = null;
    rearrange.value = null;
    undoStack.value = [];
    cpuError.value = "";
    ChopsticksCPU.config.reportedNames = [null, null]; // re-learned from the engine per game
    localStorage.setItem("chopsticks.preset", currentPreset.value);
    localStorage.setItem("chopsticks.rules", JSON.stringify(currentOverrides.value));
    localStorage.setItem("chopsticks.names", JSON.stringify(names.value));
    localStorage.setItem("chopsticks.controllers", JSON.stringify(controllers.value));
    view.value = "play";
    maybeScheduleCPU();
  }
  function reset() {
    for (const k of ["preset", "rules", "names", "controllers"])
      localStorage.removeItem("chopsticks." + k);
    currentPreset.value = "standard";
    currentOverrides.value = Object.assign({}, C.PRESETS.standard ? C.PRESETS.standard[1] : {});
    names.value = ["", ""];
    controllers.value = ["human", "human"];
    openSetup();
  }
  function undo() {
    if (!undoStack.value.length) return;
    cancelCPU();
    cpuError.value = "";
    restore(undoStack.value.pop());
    // keep popping past CPU moves so undo lands on the human's previous turn
    while (controllers.value.includes("human") && undoStack.value.length
      && controllers.value[game.value.turn] !== "human")
      restore(undoStack.value.pop());
    selected.value = null;
    rearrange.value = null;
    maybeScheduleCPU();
  }

  /* ---------------- toggles ---------------- */
  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    localStorage.setItem("chopsticks.theme", theme.value);
  }
  function toggleCheat() {
    cheat.value = !cheat.value; // intentionally not persisted — always off by default
  }
  function toggleAuto() {
    watchStep.value = !watchStep.value;
    localStorage.setItem("chopsticks.watchStep", watchStep.value ? "1" : "0");
    maybeScheduleCPU(); // switching back to auto resumes play
  }

  /* ---------------- global side effects ---------------- */
  watch(theme, (t) => document.documentElement.setAttribute("data-theme", t), { immediate: true });
  watch(view, (v) => {
    document.body.classList.toggle("in-play", v === "play");
    if (v === "setup") cancelCPU();
  }, { immediate: true });

  fillForm(currentOverrides.value);

  return {
    // state
    view, theme, currentPreset, currentOverrides, names, controllers, customPresets,
    remotePorts, watchStep, cheat, game, selected, rearrange, presetName, fv,
    // static
    RULE_FIELDS, cpuNames, builtinPresets,
    // derived
    hintText, cheatUI, play, logEntries, outcome, showResult, verdict, reason,
    watchLive, autoToggleText, showStep, stepDisabled, rulesLine, undoDisabled,
    themeIcon, anyRemote, currentMode, customPresetNames, activeP, labelTop, labelBottom,
    // methods
    handHtml, handMods, onHandClick, namePlaceholder, presetTitle, presetChanged,
    markCustom, savePreset, deletePreset, ctrlChanged, setMode, setPort,
    openSetup, start, startGame, reset, undo, stepCPU,
    toggleTheme, toggleCheat, toggleAuto,
    // exposed for unit tests
    describeMove, resolveNames, doMove, snapshot, restore,
  };
}
