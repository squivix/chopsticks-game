# Chopsticks — What Optimal Play Actually Looks Like

Chopsticks is small enough to **solve exactly**. The engine's solver
([web/src/lib/solver.js](web/src/lib/solver.js)) enumerates every reachable position for a given
ruleset and labels it **Win / Loss / Draw** for the player to move (retrograde
analysis — see the header comment in that file). This document is *not* hand
theory: every number and position list below was read straight out of the
solved tables via `solver.solve(rules).entries()`. See [Reproducing](#reproducing-the-numbers).

Because Chopsticks is two-player, zero-sum and perfect-information, those W/L/D
labels *are* the game-theoretic value. Optimal play needs no model of the
opponent; it secures the value against anyone. The interesting question this doc
answers is: **once you have the perfect table, what does the strategy hiding in
it look like — and can it be written as a simple rule?**

### Notation

We use the same `[ABCD]` convention as [RULESETS.md](RULESETS.md): `A,B` are the
**hands of the player to move** (ascending), `C,D` the opponent's (ascending).
Start is `[1111]`. Positions are canonicalised by hand order (left/right never
matters — the solver confirms this: **0 order-inconsistencies** across every
ruleset), and always shown from the mover's point of view.

---

## The master table

Value is for the **first player** from the standard `[1111]` start (or the
ruleset's own start). "Draw %" is the share of all reachable non-terminal
positions that are drawn under perfect play.

| Ruleset | 1st-player value | Draw % | Winning move is a capture |
|---|---|---:|---:|
| standard | **Draw** | 69% | 256/256 (100%) |
| rollover | **Draw** | 85% | 158/170 (93%) |
| even-splits | **Draw** | 68% | 256/256 (100%) |
| senary (base 6) | **Draw** | 90% | 230/246 (93%) |
| suns (`[4444]` start) | **1st wins** | 69% | 257/257 (100%) |
| misère | **Draw** | 57% | 88/270 (**33%**) |
| attacks-only | **1st loses** | 0% | 301/345 (87%) |
| transfers-only | **1st loses** | 0% | 508/580 (88%) |
| suicide | **1st loses** | 6% | 582/744 (78%) |
| sudden-death | **1st loses** | 5% | 518/572 (91%) |
| self-attack | **1st wins** | 0% | 626/818 (77%) |
| knubs (½-fingers) | **Draw** | 51% | 6820/7542 (90%) |
| integers (±, flip) | **Draw** | 60% | 4124/4560 (90%) |

Two things jump out and organise everything below:

1. **The full games are draws; the stripped-down ones are decided by move one.**
   Every ruleset that keeps *both* attacks and reviving splits is a draw.
   Remove reviving (or splits entirely) and it collapses into a forced win or
   loss with **no draws at all**.
2. **"Take the capture" is almost the whole strategy.** In nearly every ruleset,
   when the solver has a forced win it wins by *killing an opponent hand right
   now* 77–100% of the time. The lone exception is misère, which inverts the
   instinct (see below).

---

## Family 1 — the "real" games are draws (standard, rollover, even-splits, senary, suns)

These play like the schoolyard game and they are **draws under perfect play**.
Most of the board is drawn (69–90% of positions), and the strategy fits on a
matchbook.

### The danger set is tiny and has an obvious shape

Standard has only **7** losing positions for the player to move, out of 160:

```
[0103]  [0133]  [0333]  [0244]  [0344]  [0444]   and   [0144]
```

Every one of them has the same shape: **the mover is down to a single live hand
(`0x`) against an opponent sitting on a strong hand** (a `3`, `4`, or a full
`33`/`44`). `even-splits` has the *identical* seven; `suns` has the same family;
`rollover` and `senary` shrink it further to the three positions where you hold a
lone `1` against a near-max opponent (`[0133] [0103] [0144]`, and base-6
`[0104] [0144] [0155]`).

The fitted rule for the losing set is therefore:

> **You only lose if you let yourself get reduced to one hand while the
> opponent still has a commanding hand.** Keep both hands alive and you are never
> in the danger set — the game is a draw.

(Single-feature classifiers agree: "symmetric hands" and "one dead hand" each
explain ~87–94% of the label, but the exact set is just those handful of
one-hand-vs-strong positions.)

### The winning move, when there is one, is always a capture

In standard / even-splits / suns, **100%** of forced wins are executed by a move
that immediately kills a live opponent hand (256/256, 257/257). Rollover and
senary are 93% — the other 7% are rollover-wrap attacks that *set up* an
unavoidable kill next turn. There is **no deep positional plan**: you only ever
have a forced win because the opponent blundered into letting you start a killing
sequence, and you cash it immediately.

### Pocket strategy (near-optimal for the whole draw family)

> 1. **If a move kills an opponent hand, play it.**
> 2. **Never voluntarily drop to a single live hand** when the opponent holds a
>    3, 4, or a full pair — split to keep two moderate hands instead.
> 3. Otherwise anything safe draws.

That's it. Against a perfect opponent this draws; against a flawed one it
punishes every slip. (The built-in `dummy` bot is essentially rule 1 + a
one-ply safety check, which is why it already never loses in standard.)

---

## Family 2 — strip the game down and move one decides it (attacks-only, transfers-only, suicide, sudden-death, self-attack)

Take away the ability to revive a dead hand and the draws vanish entirely —
`attacks-only`, `transfers-only` and `self-attack` have **zero** drawn positions.
The game becomes a pure combinatorial race that one side wins outright:

- **`attacks-only`** and **`transfers-only`** → the **first player loses**.
- **`self-attack`** and **`suns`** → the **first player wins**.

"Take the capture" still dominates the winning move (77–91%), but here the
*losing set* is where the interesting structure would live — and mostly it
**does not reduce to a clean function**:

- **`attacks-only`** is a genuine combinatorial game. Its 27 losing positions
  (`[1111] [1212] [0113] [0324] …`) fit **no** simple predicate — the best
  single feature ("my total < opponent's total") is only 79% accurate. There is
  no pocket rule; the solver is the oracle. (This is the honest answer to "can
  we fit a function to it?" — for this ruleset, no.)
- **`transfers-only`** has one clean signal: because you can never revive a dead
  hand, **"do I have a dead hand?" predicts a loss ~80% of the time.** Losing a
  hand here is close to losing the game.
- **`suicide` / `sudden-death`** lean on material: "my total < opponent's total"
  is the best ~76% predictor, which matches intuition (you're racing on fingers,
  and suicide splits / the 1-finger death rule punish falling behind).

The lesson: the *value* of every ruleset is known exactly, but a **compact
human rule only exists for the draw family**. The decisive no-revive games are
real puzzles — solvable, but not summarisable.

---

## The odd one out — misère inverts your instincts

Misère (lose both hands first → you **win**) is a draw like the standard game,
but its play is upside-down. Only **33%** of its winning moves are captures,
versus ~100% everywhere else — because **killing the opponent usually helps
them**. Winning play in misère is about shedding your *own* fingers and forcing
the opponent to keep material. If your instinct in every other ruleset is "take
the capture," in misère the instinct is closer to "avoid it."

---

## Knubs & Integers — stretching the number line

These two variants extend the game off the whole-number line — one into
fractions (**knubs**, half- and quarter-fingers), one into negatives
(**integers**, flip a hand to negate it). Both keep attacks *and* reviving
splits, so both are **draws** under perfect play, exactly as the "real games are
draws" rule predicts. But the solver's verdict on the two is a study in
contrasts: the humble one is deep, the flashy one is shallow.

### Knubs — the schoolyard draw, but the deepest game in the catalog

Knubs plays and *feels* like standard Chopsticks (grab captures — **90%** of
forced wins are an immediate kill, only **9%** must play a quiet move). Two
numbers, though, make it the richest of the draw family:

- **It has the deepest forced lines of any ruleset — up to 79 plies** (standard
  tops out at 6). Because every finger now moves in half-steps, forced
  conversions stretch out an order of magnitude longer. This is why knubs climbs
  to the top of the interestingness ranking despite being a draw.
- **Its danger set explodes from 7 positions to 206** — and crucially, **67 of
  those are losses with *both* hands still alive.** In whole-finger Chopsticks
  you are only ever lost when cornered to a single hand; the half-finger
  resolution creates genuine two-live-hand zugzwangs that simply don't exist on
  the integer board. (Quarter-knubs, base-20, pushes this further still.)

> **Pocket rule:** play it like the draw family — take captures, don't get
> cornered — but "don't get cornered" is now subtler. You can be lost with two
> live hands, so keep your material *balanced*, not merely alive.

### Integers — sounds exotic, plays tame

Flipping a hand to negate it (`+3 → −3`), letting hands go negative, and dying at
`±5` looks like it should blow the game wide open. The tables say otherwise — it
is one of the *quietest* variants:

- **90%** of forced wins are still ordinary kills; the shiny new **flip move is
  the winning move only ~2% of the time** (108 of 4560 won positions).
- Its **losing set is the most regular in the whole catalog** (a single feature —
  "one hand dead, opponent strong" — fits **91%** of it). The danger positions
  are all the familiar `[−x 0 | strong]` shapes; nothing surprising hides there.

The one genuinely new idea worth knowing: a negative hand can **kill by
neutralising** — drop your `−3` onto their `+3` and it lands on exactly `0`
(dead) — and you flip a hand to line that shot up. It's a cute tactic, but it
rarely changes the game's value.

> **Pocket rule:** play it like standard. Keep one negative hand around as a
> "neutraliser" to snipe an exposed opponent hand down to `0`, and, as ever,
> don't let a lone hand get cornered.

---

## The base sweep — parity, not size, sets the character

Knubs is just Chopsticks in base 10, which invites the obvious experiment: hold
everything standard (start `[1,1]`, cutoff death, splits on) and **vary only the
base** — the death threshold — solving each with retrograde analysis. The base
must be ≥ 2 (a `1`-finger hand has to be legal), and the state space grows as
**~base⁴**, so the tractable range runs `base 2 … 23` (base 23 ≈ 540k states,
~17 s to solve; base 24 exhausts a 4 GB heap).

The result is a clean **parity split**. Every base ≥ 5 is a first-player
**draw** — the only decisive bases are the degenerate `base 2` and, oddly,
`base 4` (both first-player wins). But *how* the draw plays depends entirely on
whether the base is odd or even:

| base | value | draw % | losing positions | …both hands alive | longest forced line |
|---:|:--:|---:|---:|---:|---:|
| 5 (standard) | Draw | 69% | 7 | 0 | 6 |
| 6 | Draw | 41% | 42 | 11 | 35 |
| 7 | Draw | 81% | 10 | 0 | 7 |
| 8 | Draw | 44% | 116 | 39 | 55 |
| 9 | Draw | 87% | 13 | 0 | 9 |
| 10 (knubs) | Draw | 52% | 206 | 67 | 79 |
| 22 | Draw | 80% | 896 | 285 | 173 |
| 23 | Draw | 96% | 34 | 0 | 23 |

**Odd bases are trivially tame.** For every odd base ≥ 7 the solver returns exact
closed forms: the longest forced line is **exactly `base` plies**, and the loss
set has **exactly `(3·base − 1)/2`** positions — *all* of them the familiar
"cornered to one live hand vs a strong opponent" shape. Mean forced-win distance
stays pinned near ~1.8 plies however large the base gets. Grab the capture; draw.

**Even bases are deep.** Depth climbs ~8 plies per base step (`base 10 → 79`,
`base 22 → 173`), the loss set grows into the hundreds, and — the real signature —
**hundreds of those losses have both hands still alive** (base 22: 285). Those
two-live-hand zugzwangs simply do not exist on any odd board. The even branch is
where the game becomes a genuine puzzle.

**This reframes knubs.** Its headline depth-79 was never about half-fingers:
knubs *is* base 10, `10` is even, and 79 is exactly the even-base depth law
evaluated at 10. Quarter-knubs (base 20, even) → 157, right on the same curve.
"The deepest game in the catalog" just meant "the deepest even base anyone had
solved" — base 22 is deeper still. Standard Chopsticks (base 5, **odd**) sits on
the shallow branch purely by the accident of a hand having four fingers and a
thumb; base 6 would have made the schoolyard game an order of magnitude deeper.

Why parity? The tempting explanation — that even bases carry a self-killing
midpoint value (`b/2 + b/2 = base`) — **does not survive checking**: the two-hand
losses do not concentrate on `b/2` (the share containing it *falls* from 38% at
base 8 to 13% at base 14), and many are plain balanced shapes like `[1,1 | 2,6]`
where the mover holds two live `1`s and is still lost. The even-base complexity
is real structure, not the artifact of one special value — which is exactly this
doc's recurring lesson: the deep games resist a one-line rule.

---

## Reproducing the numbers

Everything here is derived, not asserted. The engine and solver are ES modules
under `web/src/lib/`; from a `.mjs` script (or Vitest) in `web/`:

```js
import C from "./src/lib/engine.js";
import Solver from "./src/lib/solver.js";

const table = Solver.solve(C.makeRules({ /* overrides, e.g. rollover:true */ }));
console.log("positions:", table.size);

// value of any position (from the mover's perspective):
table.get({ hands: [[1,1],[1,1]], turn: 0, swapStreak: [0,0], switchUsed: [false,false] }).result; // 'W' | 'L' | 'D'

// dump the whole solved graph for analysis:
for (const e of table.entries()) {
  // { hands, turn, result, depth, terminal, ... }
}
```

The probe that produced the tables above solves each ruleset, canonicalises by
hand order and mover perspective, counts W/L/D, extracts the losing set, and
classifies each forced-win move as a capture or not.

---

## TL;DR

- **Full Chopsticks is a draw.** With both hands alive you are never lost;
  grab any capture and you draw against anyone and beat anyone who errs.
- **You only lose by getting cornered to a single hand vs a strong opponent** —
  a set of just 3–7 positions per draw-ruleset.
- **Remove the ability to revive a hand and move one decides the game** — and
  those decisive variants generally have *no* tidy closed-form strategy; that's
  what the solver is for.
- **Fractions run deep, negatives don't.** Knubs (half-fingers) is still a draw,
  but the *deepest* game in the catalog (79-ply forced lines) and the only
  draw-family variant where you can be lost with two live hands. Integers
  (negatives + sign-flip) looks exotic but plays like standard — 90% of wins are
  plain kills and the flip almost never matters.
- **Base parity splits the game.** Vary only the death threshold and every base
  ≥ 5 is a draw, but **odd** bases are shallow (depth = base, ~`(3·base−1)/2`
  one-hand losses) while **even** bases are deep (depth ~8× base, hundreds of
  two-live-hand zugzwangs). Knubs is "deep" only because 10 is even.
- **Misère flips everything**: don't take the capture.
