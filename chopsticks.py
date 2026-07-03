#!/usr/bin/env python3
"""Two-player Chopsticks with configurable rulesets.

Every rule axis documented in RULESETS.md that applies to a two-player game
is a field on Rules. Play with a named preset, a JSON rules file, and/or
individual --set overrides:

    python3 chopsticks.py                          # standard schoolyard rules
    python3 chopsticks.py --preset rollover
    python3 chopsticks.py --preset swaps --set suicide=true --set base=6
    python3 chopsticks.py --list-presets
    python3 chopsticks.py --preset meta --show-rules
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import sys
from dataclasses import dataclass, fields, replace
from collections import Counter


def fmt_fingers(v: int, fraction: int) -> str:
    """Render a stored value (in 1/fraction-finger units) as a finger count.

    With fraction == 1 this is just the integer. With fraction 2 ('knubs',
    half-fingers) a stored 5 shows as '2.5'; with fraction 4 (quarter-knubs) a
    stored 3 shows as '0.75'. Negative values keep their sign (integers rule)."""
    if fraction == 1:
        return str(v)
    return f"{v / fraction:.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------
# Rules

@dataclass(frozen=True)
class Rules:
    # Elimination (RULESETS.md 3.1-3.2)
    rollover: bool = False        # False: hand dies at >= base. True: wraps mod base, dies only on exact base
    base: int = 5                 # death threshold / modulus
    start: tuple = (1, 1)         # starting fingers per hand, for both players
    fraction: int = 1             # display granularity: 1 whole, 2 knubs (halves), 4 quarter-knubs.
                                  # base/start are already given in these units; purely cosmetic to the engine.
    integers: bool = False        # negative/zero hands via a sign-flip move; a hand dies at magnitude base (+/-base)

    # Splits (3.3)
    transfers: bool = True        # splits between two living hands
    divisions: bool = True        # splits involving a dead hand (revival)
    suicide: bool = False         # splits may reduce a living hand to 0
    swaps: bool = False           # mirror swap of unequal hands as a turn
    swaps_need_dead: bool = False # Logan Clause: swap legal only when it trades a dead hand for a live one
    swap_limit: int = 0           # max consecutive swaps per player (0 = unlimited)
    pass_move: bool = False       # split may leave the distribution unchanged (pass)
    even_splits_only: bool = False
    odd_near_even: bool = True    # with even_splits_only: odd totals may split as evenly as possible
    one_point_switch: bool = False  # at 0-1, may switch the point across, once per game

    # Extra moves (3.4)
    meta: bool = False            # combine hands totalling > base, subtract base, redistribute
    self_attack: bool = False     # attack your own other hand
    death_attack: bool = False    # attack a dead hand (counts as 0)
    self_add: bool = False        # add 1 finger to one of your living hands as a turn
    cherry_bomb: bool = False     # exact-base attack: target hand dies, attacking hand resets to 1

    # Win condition (3.5)
    misere: bool = False          # first to lose both hands wins
    sudden_death: bool = False    # a total of 1 finger loses
    repetition_draw: int = 3      # N-fold repetition is a draw (0 = off)

    def validate(self) -> None:
        if self.base < 2:
            raise ValueError("base must be at least 2")
        if len(self.start) != 2 or any(not 0 <= v < self.base for v in self.start):
            raise ValueError(f"start hands must be two values in 0..{self.base - 1}")
        if sum(self.start) == 0:
            raise ValueError("start position has no living hands")
        if self.fraction < 1:
            raise ValueError("fraction must be at least 1")

    def describe(self) -> str:
        f = fmt_fingers
        if self.fraction > 1:
            unit = {2: "knubs (half-fingers)", 4: "quarter-knubs"}.get(
                self.fraction, f"1/{self.fraction}-fingers")
            elim = f"death at {f(self.base, self.fraction)} fingers ({'rollover' if self.rollover else 'cutoff'}), {unit}"
        elif self.rollover:
            elim = f"death at exactly {self.base} (rollover mod {self.base})"
        else:
            elim = f"death at {self.base} or more (cutoff)"
        lines = [elim, f"start {f(self.start[0], self.fraction)}-{f(self.start[1], self.fraction)}"]
        splits = []
        if self.transfers:
            splits.append("transfers")
        if self.divisions:
            splits.append("divisions")
        if self.even_splits_only:
            splits.append("even-only" + ("/near-even" if self.odd_near_even else ""))
        lines.append("splits: " + (", ".join(splits) if splits else "none"))
        for flag, label in [
            ("suicide", "suicide splits"), ("swaps", "swaps"),
            ("swaps_need_dead", "swaps only dead-for-live (Logan)"),
            ("pass_move", "pass allowed"), ("one_point_switch", "one-point switch"),
            ("meta", "meta combine"), ("self_attack", "self-attacks"),
            ("death_attack", "death attacks"), ("self_add", "self-adding"),
            ("cherry_bomb", "cherry bomb"), ("misere", "misère (losing hands wins)"),
            ("sudden_death", "sudden death at 1 finger"),
            ("integers", "integers (hands may go negative; flip a hand to negate it)"),
        ]:
            if getattr(self, flag):
                lines.append(label)
        if self.swaps and self.swap_limit:
            lines.append(f"max {self.swap_limit} consecutive swaps")
        if self.repetition_draw:
            lines.append(f"{self.repetition_draw}-fold repetition is a draw")
        return "; ".join(lines)


PRESETS: dict[str, tuple[str, dict]] = {
    "standard": ("Common schoolyard game: cutoff, transfers + divisions", {}),
    "rollover": ("Wikipedia 'official' rules: wrap mod 5, exact-5 kill", {"rollover": True}),
    "misere": ("Standard, but losing both hands first WINS", {"misere": True}),
    "suicide": ("Standard + splits may kill your own hand", {"suicide": True}),
    "swaps": ("Standard + mirror swaps (max 3 in a row)", {"swaps": True, "swap_limit": 3}),
    "logan": ("Standard + Logan Clause (swap a dead hand for a live one)",
              {"swaps": True, "swaps_need_dead": True, "suicide": False}),
    "meta": ("Rollover + Meta: combine hands totalling >5, subtract 5, redistribute",
             {"rollover": True, "meta": True}),
    "sudden-death": ("Standard, but a total of 1 finger loses", {"sudden_death": True}),
    "even-splits": ("Cutoff + even splits only (Board Game Scholar's solved game)",
                    {"even_splits_only": True}),
    "attacks-only": ("No splits at all — the short game", {"transfers": False, "divisions": False}),
    "transfers-only": ("Splits between living hands only, no reviving", {"divisions": False}),
    "divisions-only": ("Splits must involve a dead hand", {"transfers": False}),
    "death-attack": ("Standard + attacking dead hands (revives them)", {"death_attack": True}),
    "self-attack": ("Wikipedia's 'Unnamed': cutoff + swaps + self-attacks",
                    {"self_attack": True, "swaps": True, "swap_limit": 3}),
    "self-adding": ("Standard + may add 1 finger to a living hand", {"self_add": True}),
    "cherry-bomb": ("Rollover + exact-5 attacks explode", {"rollover": True, "cherry_bomb": True}),
    "suns": ("Standard from the unreachable 4444 position", {"start": (4, 4)}),
    "senary": ("Rollover in base 6", {"rollover": True, "base": 6}),
    "childhood": ("5-to-kill rollover, suicide splits, transfers + divisions, and mirror "
                  "swaps (both hands alive, no stalling)",
                  {"rollover": True, "suicide": True, "swaps": True}),
    "knubs": ("Half-finger 'knubs': every hand splits into halves; still dies at 5 fingers",
              {"base": 10, "start": (2, 2), "fraction": 2}),
    "quarter-knubs": ("Knubs subdivided again into quarter-fingers",
                      {"base": 20, "start": (4, 4), "fraction": 4}),
    "integers": ("Negative/zero hands: flip a hand to negate it (+3 -> -3); a hand dies at +5 or -5",
                 {"integers": True}),
    "kitchen-sink": ("Everything legal at once",
                     {"rollover": True, "suicide": True, "swaps": True, "swap_limit": 3,
                      "meta": True, "self_attack": True, "death_attack": True,
                      "self_add": True, "one_point_switch": True, "pass_move": True}),
}


# ---------------------------------------------------------------------------
# Engine

@dataclass(frozen=True)
class Move:
    label: str
    hands: tuple            # ((a,b),(c,d)) after the move, indexed by player
    is_swap: bool = False
    uses_switch: bool = False
    kind: str = "split"     # attack | selfattack | add | split | meta
    from_h: int = -1        # acting hand index (attacks/self-attacks)
    to_h: int = -1          # target hand index (attacks/self-attacks/adds)


class Game:
    def __init__(self, rules: Rules, names=("Player 1", "Player 2")):
        rules.validate()
        self.rules = rules
        self.names = names
        self.hands = [list(rules.start), list(rules.start)]
        self.turn = 0
        self.swap_streak = [0, 0]
        self.switch_used = [False, False]
        self.history = Counter()
        self._record()
        self.result: str | None = None   # set when game over
        self.winner: int | None = None   # 0 | 1, None while running or on a draw

    # -- state helpers

    def _record(self):
        key = (tuple(self.hands[0]), tuple(self.hands[1]), self.turn)
        self.history[key] += 1
        return self.history[key]

    def total(self, p: int) -> int:
        return sum(self.hands[p])

    def _u(self, v: int) -> str:
        """Format a stored (unit) hand value as a finger count for display."""
        return fmt_fingers(v, self.rules.fraction)

    def _hit(self, target: int, hit_by: int) -> int:
        """Value of a hand after being hit, applying cutoff or rollover.

        Death is by magnitude so the integers rule works: a hand dies when it
        reaches +/-base (cutoff) or lands on 0. Python's % already folds a
        negative sum back into 0..base-1 for rollover."""
        s = target + hit_by
        if self.rules.rollover:
            return s % self.rules.base
        return 0 if abs(s) >= self.rules.base else s

    # -- move generation

    def legal_moves(self) -> list[Move]:
        r = self.rules
        me, opp = self.turn, 1 - self.turn
        a, b = self.hands[me]
        moves: list[Move] = []
        side = "LR"

        def result(my_pair, opp_pair) -> tuple:
            pairs = [None, None]
            pairs[me], pairs[opp] = tuple(my_pair), tuple(opp_pair)
            return tuple(pairs)

        # Attacks
        for i, h in enumerate((a, b)):
            if h == 0:
                continue
            for j, t in enumerate(self.hands[opp]):
                if t == 0 and not r.death_attack:
                    continue
                raw = t + h
                if r.cherry_bomb and raw == r.base:
                    my_new = list((a, b))
                    my_new[i] = 1
                    opp_new = list(self.hands[opp])
                    opp_new[j] = 0
                    moves.append(Move(
                        f"Cherry bomb! {side[i]}({self._u(h)}) hits their {side[j]}({self._u(t)}) = {self._u(r.base)}"
                        f" — their hand dies, yours resets to 1",
                        result(my_new, opp_new), kind="attack", from_h=i, to_h=j))
                    continue
                nv = self._hit(t, h)
                opp_new = list(self.hands[opp])
                opp_new[j] = nv
                tag = " (dead)" if nv == 0 else (" (rollover)" if r.rollover and raw > r.base else "")
                verb = "revives" if t == 0 else "hits"
                moves.append(Move(
                    f"Attack: {side[i]}({self._u(h)}) {verb} their {side[j]}({self._u(t)}) -> {self._u(nv)}{tag}",
                    result((a, b), opp_new), kind="attack", from_h=i, to_h=j))

        # Self-attack
        if r.self_attack:
            for i, j in ((0, 1), (1, 0)):
                h, t = self.hands[me][i], self.hands[me][j]
                if h == 0 or t == 0:
                    continue
                nv = self._hit(t, h)
                my_new = list((a, b))
                my_new[j] = nv
                tag = " (dead)" if nv == 0 else ""
                moves.append(Move(
                    f"Self-attack: {side[i]}({self._u(h)}) hits own {side[j]}({self._u(t)}) -> {self._u(nv)}{tag}",
                    result(my_new, self.hands[opp]), kind="selfattack", from_h=i, to_h=j))

        # Self-add
        if r.self_add:
            for i, h in enumerate((a, b)):
                if h == 0:
                    continue
                nv = self._hit(h, 1)
                my_new = list((a, b))
                my_new[i] = nv
                tag = " (dead)" if nv == 0 else ""
                moves.append(Move(f"Add 1 finger to {side[i]}({self._u(h)}) -> {self._u(nv)}{tag}",
                                  result(my_new, self.hands[opp]), kind="add", to_h=i))

        # Sign flip (integers rule): negate a living hand
        if r.integers:
            for i, h in enumerate((a, b)):
                if h == 0:
                    continue
                nv = (-h) % r.base if r.rollover else -h
                my_new = list((a, b))
                my_new[i] = nv
                moves.append(Move(f"Flip {side[i]}({self._u(h)}) -> {self._u(nv)}",
                                  result(my_new, self.hands[opp]), kind="flip", to_h=i))

        # Splits (incl. swaps, pass, one-point switch) — only among non-negative
        # hands (splitting a negative hand is undefined in the integers variant).
        total = a + b
        for c in ([] if (a < 0 or b < 0) else range(min(total, r.base - 1) + 1)):
            d = total - c
            if not 0 <= d < r.base:
                continue
            ok, kind = self._split_kind(a, b, c, d)
            if not ok:
                continue
            moves.append(Move(f"{kind}: {self._u(a)}-{self._u(b)} -> {self._u(c)}-{self._u(d)}",
                              result((c, d), self.hands[opp]),
                              is_swap=(kind == "Swap"),
                              uses_switch=(kind == "One-point switch")))

        # Meta
        if r.meta and total > r.base and a >= 0 and b >= 0:
            rem = total - r.base
            for c in range(min(rem, r.base - 1) + 1):
                d = rem - c
                if not 0 <= d < r.base:
                    continue
                if (c == 0 or d == 0) and not r.suicide:
                    continue
                moves.append(Move(f"Meta: combine {self._u(a)}-{self._u(b)} ({self._u(total)}), "
                                  f"subtract {self._u(r.base)} -> {self._u(c)}-{self._u(d)}",
                                  result((c, d), self.hands[opp]), kind="meta"))

        return moves

    def _split_kind(self, a, b, c, d):
        """Whether split (a,b)->(c,d) is legal, and its display name."""
        r = self.rules
        me = self.turn
        if (c, d) == (a, b):
            return r.pass_move, "Pass"
        if (c, d) == (b, a):  # pure mirror swap (a != b since not equal above)
            if (r.one_point_switch and not self.switch_used[me]
                    and a + b == 1):
                return True, "One-point switch"
            if not r.swaps:
                return False, ""
            # plain swaps need two live hands; Logan Clause swaps need a dead one
            if (0 in (a, b)) != r.swaps_need_dead:
                return False, ""
            if r.swap_limit and self.swap_streak[me] >= r.swap_limit:
                return False, ""
            return True, "Swap"
        if r.even_splits_only:
            if not (c == d or (r.odd_near_even and abs(c - d) == 1)):
                return False, ""
        kills = (a > 0 and c == 0) or (b > 0 and d == 0)
        revives = (a == 0 and c > 0) or (b == 0 and d > 0)
        if kills and not r.suicide:
            return False, ""
        if revives and not r.divisions:
            return False, ""
        if not kills and not revives and not r.transfers:
            return False, ""
        if kills and revives:
            return True, "Suicide split"   # e.g. 0-3 -> 2-1 can't reach here; 1-2 -> 3-0 does
        if kills:
            return True, "Suicide split"
        if revives:
            return True, "Division"
        return True, "Transfer"

    # -- applying moves

    def apply(self, move: Move) -> None:
        me = self.turn
        self.hands = [list(move.hands[0]), list(move.hands[1])]
        self.swap_streak[me] = self.swap_streak[me] + 1 if move.is_swap else 0
        if move.uses_switch:
            self.switch_used[me] = True
        self.turn = 1 - self.turn
        self._check_end()

    def _check_end(self) -> None:
        r = self.rules
        for p in (0, 1):
            both_out = self.hands[p][0] == 0 and self.hands[p][1] == 0
            t = self.total(p)
            dead = both_out or (r.sudden_death and t == 1)
            if dead:
                winner = p if r.misere else 1 - p
                how = "lost both hands" if both_out else "is down to 1 finger"
                verb = "wins" if r.misere else "loses"
                self.winner = winner
                self.result = f"{self.names[p]} {how} — and {verb}! {self.names[winner]} is the winner."
                return
        if r.repetition_draw and self._record() >= r.repetition_draw:
            self.result = f"Draw by {r.repetition_draw}-fold repetition."
            return
        if not self.legal_moves():
            stuck = self.turn
            winner = stuck if r.misere else 1 - stuck
            self.winner = winner
            self.result = (f"{self.names[stuck]} has no legal moves — "
                           f"{self.names[winner]} is the winner.")


# ---------------------------------------------------------------------------
# CPU players
# Extendable: add an entry to CPUS mapping a name to (description, choose_fn),
# where choose_fn(game, moves, rng) returns one of the given legal moves.

def _successor(game: Game, move: Move) -> Game:
    """Lightweight copy of the game after `move`, enough for legal_moves()."""
    me = game.turn
    s = copy.copy(game)
    s.hands = [list(move.hands[0]), list(move.hands[1])]
    s.swap_streak = list(game.swap_streak)
    s.swap_streak[me] = s.swap_streak[me] + 1 if move.is_swap else 0
    s.switch_used = list(game.switch_used)
    if move.uses_switch:
        s.switch_used[me] = True
    s.turn = 1 - me
    return s


def _opponent_can_kill(game: Game, move: Move) -> bool:
    """After we play `move`, can the opponent's reply knock out one of our
    then-living hands?"""
    me = game.turn
    mine_after = move.hands[me]
    return any(
        mine_after[h] != 0 and reply.hands[me][h] == 0
        for reply in _successor(game, move).legal_moves()
        for h in (0, 1)
    )


def _dummy_cpu(game: Game, moves: list, rng) -> Move:
    me, opp = game.turn, 1 - game.turn
    attacks = [m for m in moves if m.kind == "attack"]
    # prefer live targets (death-attack rules also offer dead ones)
    pool = [m for m in attacks if game.hands[opp][m.to_h] != 0] or attacks
    favorite = min(pool, default=None,
                   key=lambda m: (game.hands[opp][m.to_h], game.hands[me][m.from_h]))
    if favorite is not None and not _opponent_can_kill(game, favorite):
        return favorite
    others = [m for m in moves if m is not favorite]
    return rng.choice(others) if others else favorite


CPUS = {
    "dummy": ("Attacks the lowest hand with its lowest; if that would let the "
              "opponent knock out one of its hands, plays randomly instead",
              _dummy_cpu),
}


# ---------------------------------------------------------------------------
# Interface

def render(game: Game) -> str:
    def pair(p):
        cells = []
        for v in game.hands[p]:
            cells.append(f"[ {'X' if v == 0 else game._u(v)} ]")
        return f"  L{cells[0]}  R{cells[1]}"

    top, bottom = 1, 0
    mark = lambda p: "->" if game.turn == p and not game.result else "  "
    return (f"\n{mark(top)} {game.names[top]:<10}{pair(top)}\n"
            f"{mark(bottom)} {game.names[bottom]:<10}{pair(bottom)}\n")


def outcome_text(game: Game, controllers) -> str:
    """Short verdict; who 'you' is depends on who was playing."""
    if game.winner is None:
        return game.result  # draw
    w = game.winner
    humans = sum(1 for c in controllers if c == "human")
    if humans == 2:
        return f"{game.names[w]} wins!"
    if humans == 1:
        return "You win!" if controllers[w] == "human" else "You lose!"
    return f"CPU{w + 1} ({controllers[w]}) wins!"


def play(game: Game, controllers=("human", "human"), rng=None) -> None:
    rng = rng or random.Random()
    print(f"\n=== Chopsticks ===\nRules: {game.rules.describe()}")
    print("Enter a move number; 'rules' to reprint rules, 'q' to quit.")
    while not game.result:
        print(render(game))
        moves = game.legal_moves()
        name = game.names[game.turn]
        ctrl = controllers[game.turn]
        if ctrl != "human":
            move = CPUS[ctrl][1](game, moves, rng)
            print(f"{name} (CPU: {ctrl}) plays: {move.label}")
            game.apply(move)
            continue
        for i, m in enumerate(moves, 1):
            print(f"  {i}. {m.label}")
        while True:
            try:
                raw = input(f"{name}, your move: ").strip().lower()
            except EOFError:
                print("\nInput ended — game abandoned.")
                return
            if raw in ("q", "quit", "exit"):
                print("Game abandoned.")
                return
            if raw == "rules":
                print(f"Rules: {game.rules.describe()}")
                continue
            if raw.isdigit() and 1 <= int(raw) <= len(moves):
                game.apply(moves[int(raw) - 1])
                break
            print(f"  Enter 1-{len(moves)}, 'rules', or 'q'.")
    print(render(game))
    print(outcome_text(game, controllers) + "\n")


# ---------------------------------------------------------------------------
# CLI

def parse_value(field_name: str, raw: str):
    if field_name == "start":
        parts = raw.replace(",", " ").split()
        return tuple(int(p) for p in parts)
    if raw.lower() in ("true", "yes", "on", "1"):
        return True
    if raw.lower() in ("false", "no", "off", "0"):
        return False
    return int(raw)


def build_rules(args) -> Rules:
    overrides: dict = {}
    if args.preset:
        if args.preset not in PRESETS:
            sys.exit(f"Unknown preset '{args.preset}'. Try --list-presets.")
        overrides.update(PRESETS[args.preset][1])
    if args.rules_file:
        with open(args.rules_file) as f:
            data = json.load(f)
        if "start" in data:
            data["start"] = tuple(data["start"])
        overrides.update(data)
    valid = {f.name for f in fields(Rules)}
    for setting in args.set or []:
        if "=" not in setting:
            sys.exit(f"--set expects key=value, got '{setting}'")
        key, _, raw = setting.partition("=")
        key = key.strip().replace("-", "_")
        if key not in valid:
            sys.exit(f"Unknown rule '{key}'. Valid rules: {', '.join(sorted(valid))}")
        overrides[key] = parse_value(key, raw.strip())
    try:
        rules = replace(Rules(), **overrides)
        rules.validate()
    except (TypeError, ValueError) as e:
        sys.exit(f"Invalid rules: {e}")
    return rules


def main() -> None:
    ap = argparse.ArgumentParser(description="Two-player Chopsticks with configurable rulesets (see RULESETS.md)")
    ap.add_argument("--preset", default="standard", help="named ruleset (default: standard)")
    ap.add_argument("--list-presets", action="store_true", help="list presets and exit")
    ap.add_argument("--set", action="append", metavar="RULE=VALUE",
                    help="override a rule, e.g. --set suicide=true --set start=4,4 (repeatable)")
    ap.add_argument("--rules-file", help="JSON file of rule overrides")
    ap.add_argument("--show-rules", action="store_true", help="print the effective ruleset and exit")
    ap.add_argument("--names", nargs=2, metavar=("P1", "P2"), default=("Player 1", "Player 2"))
    controllers = ["human"] + sorted(CPUS)
    ap.add_argument("--p1", choices=controllers, default="human", help="who plays Player 1")
    ap.add_argument("--p2", choices=controllers, default="human", help="who plays Player 2")
    ap.add_argument("--seed", type=int, help="random seed for CPU players")
    ap.add_argument("--list-cpus", action="store_true", help="list CPU players and exit")
    args = ap.parse_args()

    if args.list_presets:
        width = max(len(n) for n in PRESETS)
        for name, (desc, _) in PRESETS.items():
            print(f"  {name:<{width}}  {desc}")
        return
    if args.list_cpus:
        for name, (desc, _) in CPUS.items():
            print(f"  {name}  {desc}")
        return

    rules = build_rules(args)
    if args.show_rules:
        print(f"Preset: {args.preset}")
        print(f"Rules: {rules.describe()}")
        for f in fields(Rules):
            print(f"  {f.name} = {getattr(rules, f.name)}")
        return

    rng = random.Random(args.seed) if args.seed is not None else None
    play(Game(rules, tuple(args.names)), controllers=(args.p1, args.p2), rng=rng)


if __name__ == "__main__":
    main()
