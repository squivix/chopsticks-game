# Chopsticks — Complete Ruleset Catalog

A catalog of every rule and rule variation of the hand game **Chopsticks** (a.k.a. *Splits*, *Calculator*, *Sticks*) found across published sources. The local copy of the Wikipedia article lives at [reference/chopsticks-wikipedia.wiki](reference/chopsticks-wikipedia.wiki). All sources are listed at the [bottom](#sources).

The companion program [chopsticks.py](python/chopsticks.py) can play any combination of the rules below that applies to a two-player game (see [Presets](#presets-in-chopstickspy)).

---

## 1. The core game

- Two players. Each has two hands. Each hand shows a number of extended fingers — its **value**. Both players start with **1 finger on each hand** (position `1111`).
- A hand with value ≥ 1 is **alive**; a hand at 0 (or at/over the limit, see §3.1) is **dead** and is put behind the back.
- Players alternate turns. On your turn you must make exactly one move — either an **attack** or a **split**:
  - **Attack**: tap one of the opponent's live hands with one of your live hands. The tapped hand's value increases by your tapping hand's value. Your own hand is unchanged.
  - **Split** (tap your own two hands together): redistribute your total fingers between your two hands. The new distribution must differ from the old, and — in the standard game — a pure mirror swap (e.g. `1-3 → 3-1`) is **not** allowed.
- **Win**: knock out both of the opponent's hands. The last player with a live hand wins.

### Split terminology (Wikipedia)

- **Transfer** — a split between two *living* hands (e.g. `1-3 → 2-2`).
- **Division** — a split involving a *dead* hand, i.e. reviving it (e.g. `0-4 → 2-2`). Standard play allows both.
- A commonly-cited standard exception: a player whose only fingers are a single point (`0-1`) may switch it to the other hand **once per game** ("one-point switch").

### Notation

A two-player position is written `[ABCD]`: `A,B` = hands of the player to move (ascending), `C,D` = the other player's hands (ascending). Start = `1111`. With standard rules there are at most 14 distinct moves from any position, 204 reachable positions, and the shortest possible game is 5 moves.

---

## 2. Why "rulesets"?

Almost every rule above has schoolyard variants. They fall into independent **axes** — elimination rule, split rules, extra moves, win condition, starting position, counting base, player/hand count. A "ruleset" is a choice along each axis, and the named variations in §4 are just well-known points in that space.

---

## 3. The rule axes

### 3.1 Elimination rule (what happens at 5)

| Option | Rule |
|---|---|
| **Cutoff** (a.k.a. *Game of Five*) | A hand that reaches **5 or more** is dead. The most common way the game is taught. |
| **Rollover** (a.k.a. *exact five*, described by Wikipedia as the "official" rule) | Fingers wrap **modulo 5**: `3 + 4 = 7 → 2` and the hand stays alive. A hand dies only on **exactly 5**. Denise Gaskins calls this "Zombies" for 2 players (excess points "revive" the hand with the leftover). |

Note the two rules only differ for sums of 6–8; a sum of exactly 5 kills in both.

### 3.2 Counting base ("Different Numbers")

The death threshold `r` (normally 5) can be any number — e.g. **senary** finger counting (`r = 6`), Chinese hand numerals (up to 10), or finger binary (up to 32). Usually combined with rollover. Degenerate cases: `r = 1` is trivial (all hands start dead), `r = 2` reduces to hand-counting.

### 3.3 Split rules

| Option | Rule |
|---|---|
| **Transfers allowed / forbidden** | *Transfers only*: no divisions — dead hands cannot be revived. *Divisions only*: no transfers — only splits involving a dead hand are legal. Standard play allows both. |
| **No splits** ("attacks only") | Splits are omitted entirely — a common house rule for a shorter game. A middle variant allows transfers but bans revival of dead hands (same as *transfers only*). |
| **Even splits only** (the "Splits" variation) | A split must divide the total into two **equal halves** (even totals only), or optionally an odd total split as evenly as possible (e.g. `5 → 2-3`). Under even-splits with cutoff, the analyses disagree on who wins: Wikipedia says the second player can force a win; The Board Game Scholar's solution of cutoff + even-split finds a first-player win — the disagreement likely comes from odd-total splits being allowed or not. |
| **Suicide** | A split may reduce one of your own hands to **0**, killing it (e.g. `1-2 → 0-3`). With suicide on, the second player has a winning strategy (per Wikipedia, for divisions+suicide). |
| **Swaps** (a.k.a. *Cherri*) | Two unequal live hands may be mirror-swapped (`1-3 → 3-1`) as your whole turn. Invites infinite loops, so often played with a **limit on consecutive swaps** before you must attack. |
| **Logan Clause** | Suicide and swap are legal only **together**: you may swap a dead hand for a live one (`0-3 → 3-0`), nothing else. |
| **Pass-equivalent splits** | (GamesCrafters option) A split may result in the same distribution — effectively a **pass**. Normally illegal. |
| **Full transfers** | (GamesCrafters option) Move *all* fingers from one hand to the other when the total is ≤ 4 — equivalent to suicide-by-transfer. |
| **One-point switch** | The standard-rules exception: at `0-1` you may switch the point to the other hand once per game. |
| **Stumps / Knubs / Nubs** | Half-fingers: at `0-1` you may split into `½-½` (curled fingers). More generally, with knubs "everything can be split" — a knub is half a finger, so `3-0 → 1.5-1.5`, etc. Gaskins' "Nubs" combines this with even-splits-only so odd totals split into halves. (Implemented as the `knubs`/`quarter-knubs` presets — see §5.) |

### 3.4 Extra move types

| Option | Rule |
|---|---|
| **Meta** | If your two hands total **more than 5**, you may combine them, subtract 5, and redistribute the remainder (e.g. `4-4 = 8 → 3 → 1-2`). Adds moves `34→11`, `44→12`; with suicide also `24→01`, `33→01`, `34→02`, `44→03`. |
| **Death Attack** | You may attack a **dead** hand; it counts as 0, so the attack revives it with your hand's value. |
| **Self-attack** ("Unnamed" on Wikipedia) | You may attack your **own** other hand (adds `A→B`, `B→A`). Typically combined with Swaps and Cutoff. |
| **Self-adding** | On your turn you may simply add 1 finger to any of your living hands (enables self-destruction at 4) or transfer multiple fingers to a dead hand (resurrection). |
| **Cherry Bomb** | An attack summing to **exactly 5** "explodes": the target hand dies *and* the attacking hand resets to 1. (In a 2-player game this creates an easy forced win, so it is usually played with 3+ players. Wikipedia's description is terse; this is the interpretation consistent with its `[11]`/`[01]` example.) |

### 3.5 Win condition

| Option | Rule |
|---|---|
| **Normal** | Last player with a living hand wins. |
| **Misère** | First player to have **both own hands killed wins**. |
| **Sudden Death** | You **lose** as soon as you are down to a single finger total (`0-1`). Alternate lives version: start with 3 lives, lose one each time you hit `0-1`. |

Note on draws: with standard rules two perfect players loop forever, so play-by-repetition draws are common; a repetition rule (like chess's threefold) is a practical addition.

### 3.6 Starting position

| Option | Rule |
|---|---|
| **Standard** | `1111` — one finger per hand. |
| **Suns** | Both players start at **4 on each hand** (`4444`, a position unreachable in normal play). |
| Any custom start | Any values below the base work. |

### 3.7 Players, hands, and teams

- **Multiplayer**: 3+ players in a circle taking turns; the [ABCD] notation extends to 2 digits per player.
- **Zombies** (Wikipedia, by Chris Bandy; 3+ players): a knocked-out player stays in the game permanently reduced to one finger on one hand; they may attack on their turn but may not split or *be* attacked.
- **More Hands** (often teams of people acting as one "player"): with >2 hands per player the split rules generalize —
  - *Single transfer*: fingers move between exactly two hands.
  - *Multiple transfer*: fingers move among any number of hands (result must differ from start).
  - *Single division*: one hand feeds exactly one dead hand.
  - *Partition*: one hand feeds multiple dead hands.
  - *Transfer and partition*: multiple hands feed multiple dead hands.

### 3.8 Exotic

- **Integers**: you may flip a hand over to negate its sign; hands range −4…4 and die at ±5. With rollover this equals replacing a hand's value `v` with `5 − v`.
- **Stumps/half-fingers**: see §3.3.

---

## 4. Named variations, A–Z

Quick reference for every named variant found, expressed in the axes above:

| Name | Definition |
|---|---|
| **Attacks only** | No splits at all (house rule for short games). |
| **Cherri** | = Swaps. |
| **Cherry Bomb** | Exact-5 attack kills target hand and resets attacker hand to 1. |
| **Cutoff / Game of Five** | Hand dies at ≥ 5. |
| **Death Attack** | Attacking dead hands allowed (revives as 0 + attacker value). |
| **Divisions only** | Splits must involve a dead hand. |
| **Different Numbers** | Base other than 5 (senary, Chinese numerals, finger binary…). |
| **Integers** | Hand-sign flipping; values −4…4. |
| **Logan Clause** | Swap allowed only when exchanging a dead hand for a live one. |
| **Meta** | Combine hands totalling > 5, subtract 5, redistribute. |
| **Misère** | Losing both hands first *wins*. |
| **More Hands** | > 2 hands per side (teams); generalized transfer/division rules. |
| **Nubs** | Even splits enforced + half-fingers for odd totals (Gaskins). |
| **Rollover / exact five** | Sums wrap mod 5; death only on exactly 5. Gaskins calls the 2-player form "Zombies". |
| **Self-adding** | May add 1 finger to a living hand as a turn. |
| **Splits** (the variation) | Even splits only (optionally near-even for odd totals). |
| **Stumps / Knubs** | `0-1` may split into two half-fingers. |
| **Sudden Death** | Reaching a total of 1 finger loses (or costs a life). |
| **Suicide** | Splits may kill your own hand. |
| **Suns** | Start at `4444`. |
| **Swaps** | Mirror-swapping unequal hands as a turn; often with a consecutive-swap limit. |
| **Transfers only** | Splits must not involve a dead hand (no revival). |
| **Unnamed** (Wikipedia) | Self-attacks allowed; usually with Swaps + Cutoff. |
| **Zombies** (Bandy, 3+ players) | Knocked-out players linger with one finger; attack-only, untargetable. |

Strategy trivia from the sources: standard rollover rules are a draw by repetition with perfect play; **cutoff** is a first-player win (keep reaching `1211`, then `AB12`); **divisions+suicide** and (per Wikipedia) **even-splits** are second-player wins.

---

## 5. Presets in [chopsticks.py](python/chopsticks.py) and the [web app](web/)

Two equivalent implementations share these presets: the terminal game ([chopsticks.py](python/chopsticks.py)) and a Vue 3 + Vite web app with visual hands (in [web/](web/) — run `npm install && npm run dev` there, or use the no-build copy in [standalone/](standalone/); the rules engine lives in [web/src/lib/engine.js](web/src/lib/engine.js)). Run `python3 python/chopsticks.py --list-presets` for the live list. Highlights:

| Preset | Ruleset |
|---|---|
| `standard` | Cutoff, transfers + divisions, no swaps/suicide (the common schoolyard game) |
| `rollover` | Wikipedia's "official" rules: mod-5 wrap, exact-5 kill |
| `misere` | Standard + misère win condition |
| `suicide` | Standard + suicide splits |
| `swaps` | Standard + mirror swaps (3-swap consecutive limit) |
| `logan` | Standard + suicide/swap only combined (dead-for-live swap) |
| `meta` | Rollover + Meta combine move |
| `sudden-death` | Standard + total-of-1 loses |
| `even-splits` | Cutoff + even splits only (Board Game Scholar's solved game) |
| `attacks-only` | No splits (short game) |
| `transfers-only` / `divisions-only` | Split restriction variants |
| `death-attack` | Standard + attacking dead hands |
| `self-attack` | Cutoff + swaps + self-attacks (Wikipedia's "Unnamed") |
| `self-adding` | Standard + add-a-finger moves |
| `cherry-bomb` | Rollover + exact-5 explosion |
| `suns` | Standard from `4444` |
| `senary` | Rollover in base 6 |
| `childhood` | Rollover + suicide splits + swaps (a common playground ruleset) |
| `knubs` | Half-finger "knubs": every hand splits into halves (base-10 units, start `1-1`, dies at 5 fingers) |
| `quarter-knubs` | Knubs subdivided again into quarter-fingers (base-20 units) |
| `integers` | Negative/zero hands: flip a hand to negate it (`+3 → −3`); a hand dies at `+5` or `−5` |
| `kitchen-sink` | Everything legal at once |

Every axis is also individually overridable: `python3 python/chopsticks.py --preset rollover --set suicide=true --set base=6 --set start=2,2`.

**Implementation notes for the sparsely-specified variants.** The sources only
sketch these, so the engine fills the gaps with the most faithful, self-consistent
reading:

- **Knubs / half-fingers** (`knubs`, `quarter-knubs`). The sources say a knub is
  half a finger and that with knubs "everything can be split" (`1:0 → 0.5:0.5`,
  `3:0 → 1.5:1.5`). Rather than special-case `0-1`, the engine models the whole
  game one granularity finer: values are stored in ½-finger units (so knubs is
  literally base-10 Chopsticks starting `2-2`, quarter-knubs is base-20 from
  `4-4`), and the `fraction` field is a purely cosmetic display divisor. Death is
  still at 5 fingers. Every split, transfer and attack then works unchanged.
- **Integers / negative hands** (`integers`). New move: **flip a hand to negate
  it** (`+3 → −3`; under rollover this equals `base − v`, matching the source).
  Hands range `−4…4`; a hand dies at magnitude 5 **or** when it lands exactly on
  0 (so a negative hand can kill by neutralising an opponent to 0). Elimination is
  checked **per hand**, not by sum, so a live `+3/−3` (sum 0) is *not* a wipeout.
  Splitting a negative hand is left undefined by the sources, so it is disallowed
  (you attack or flip instead).

**Still not implemented** (out of scope for a 2-player engine): 3+ players (and
thus Zombies), More-Hands/team play, and the lives-based Sudden Death variant.

---

## Sources

- [Wikipedia — Chopsticks (hand game)](https://en.wikipedia.org/wiki/Chopsticks_(hand_game)) — primary source; local copy in [reference/chopsticks-wikipedia.wiki](reference/chopsticks-wikipedia.wiki)
- [GamesCrafters (UC Berkeley) — Chopsticks](https://gamescrafters.berkeley.edu/games.php?game=chopsticks) — formalized rules; pass-equivalent and full-transfer options
- [The Board Game Scholar — A Chopsticks Solution, Part 1](https://theboardgamescholar.com/2021/01/10/a-chopsticks-solution-part-1/) — cutoff + even-split ruleset and solution
- [Denise Gaskins — Math Game: Chopsticks](https://denisegaskins.com/2015/04/13/math-game-chopsticks/) — house rules: attacks-only, Nubs, 2-player "Zombies" (= rollover)
- [wikiHow — How to Play Chopsticks](https://www.wikihow.com/Play-Chopsticks) and [How to Always Win Chopsticks](https://www.wikihow.com/Always-Win-Chopsticks) — cited via Wikipedia (fetch blocked)
- [Activity Village — Chopsticks Game](https://www.activityvillage.co.uk/chopsticks-game) — basic rules
