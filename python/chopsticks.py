#!/usr/bin/env python3
"""Chopsticks with configurable rulesets, for two or more players.

Every rule axis documented in RULESETS.md is a field on Rules. Play with a
named preset, a JSON rules file, and/or individual --set overrides:

    python3 chopsticks.py                          # standard schoolyard rules
    python3 chopsticks.py --preset rollover
    python3 chopsticks.py --preset swaps --set suicide=true --set base=6
    python3 chopsticks.py --players 3              # three round the table
    python3 chopsticks.py --players 4 --direction ccw --controllers human dummy dummy dummy
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

    # Table (multiplayer)
    players: int = 2              # number of seats (>= 2); everyone starts from `start`
    direction: int = 1            # turn order around the table: +1 clockwise, -1 counter-clockwise

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
        if self.players < 2:
            raise ValueError("a game needs at least 2 players")

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
    hands: tuple            # one (left, right) pair per seat, after the move
    is_swap: bool = False
    uses_switch: bool = False
    kind: str = "split"     # attack | selfattack | add | split | meta
    from_h: int = -1        # acting hand index (attacks/self-attacks)
    to_h: int = -1          # target hand index (attacks/self-attacks/adds)
    to_p: int = -1          # target seat (attacks); -1 for moves on your own hands


class Game:
    def __init__(self, rules: Rules, names=None):
        rules.validate()
        self.rules = rules
        n = rules.players
        self.names = tuple(names) if names else tuple(f"Player {i + 1}" for i in range(n))
        self.hands = [list(rules.start) for _ in range(n)]
        self.turn = 0
        self.swap_streak = [0] * n
        self.switch_used = [False] * n
        self.eliminated = [False] * n    # a seat is out once both its hands are dead
        self.history = Counter()
        self._record()
        self.result: str | None = None   # set when game over
        self.winner: int | None = None   # seat index, None while running or on a draw

    # -- state helpers

    def _record(self):
        key = (tuple(tuple(h) for h in self.hands), self.turn)
        self.history[key] += 1
        return self.history[key]

    def total(self, p: int) -> int:
        return sum(self.hands[p])

    def live_players(self) -> list[int]:
        return [p for p in range(self.rules.players) if not self.eliminated[p]]

    def next_turn(self, frm: int) -> int:
        """The next living seat, walking in the table's direction (skipping any
        seat that is already out). For two players this is just the other one."""
        n = self.rules.players
        step = 1 if self.rules.direction >= 0 else -1
        p = frm
        for _ in range(n):
            p = (p + step) % n
            if not self.eliminated[p]:
                return p
        return frm

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
        me = self.turn
        n = r.players
        a, b = self.hands[me]
        moves: list[Move] = []
        side = "LR"
        multi = n > 2   # name the target seat explicitly when there's more than one opponent

        # Full post-move board: clone every seat, callers overwrite what changed.
        def clone():
            return [list(h) for h in self.hands]

        def frozen(board):
            return tuple(tuple(h) for h in board)

        # Attacks — against any living opponent's hand.
        for i, h in enumerate((a, b)):
            if h == 0:
                continue
            for q in range(n):
                if q == me or self.eliminated[q]:
                    continue
                theirs = f"{self.names[q]}'s" if multi else "their"
                for j, t in enumerate(self.hands[q]):
                    if t == 0 and not r.death_attack:
                        continue
                    raw = t + h
                    if r.cherry_bomb and raw == r.base:
                        board = clone()
                        board[me][i] = 1
                        board[q][j] = 0
                        moves.append(Move(
                            f"Cherry bomb! {side[i]}({self._u(h)}) hits {theirs} {side[j]}({self._u(t)}) = {self._u(r.base)}"
                            f" — that hand dies, yours resets to 1",
                            frozen(board), kind="attack", from_h=i, to_h=j, to_p=q))
                        continue
                    nv = self._hit(t, h)
                    board = clone()
                    board[q][j] = nv
                    tag = " (dead)" if nv == 0 else (" (rollover)" if r.rollover and raw > r.base else "")
                    verb = "revives" if t == 0 else "hits"
                    moves.append(Move(
                        f"Attack: {side[i]}({self._u(h)}) {verb} {theirs} {side[j]}({self._u(t)}) -> {self._u(nv)}{tag}",
                        frozen(board), kind="attack", from_h=i, to_h=j, to_p=q))

        # Self-attack
        if r.self_attack:
            for i, j in ((0, 1), (1, 0)):
                h, t = self.hands[me][i], self.hands[me][j]
                if h == 0 or t == 0:
                    continue
                nv = self._hit(t, h)
                board = clone()
                board[me][j] = nv
                tag = " (dead)" if nv == 0 else ""
                moves.append(Move(
                    f"Self-attack: {side[i]}({self._u(h)}) hits own {side[j]}({self._u(t)}) -> {self._u(nv)}{tag}",
                    frozen(board), kind="selfattack", from_h=i, to_h=j))

        # Self-add
        if r.self_add:
            for i, h in enumerate((a, b)):
                if h == 0:
                    continue
                nv = self._hit(h, 1)
                board = clone()
                board[me][i] = nv
                tag = " (dead)" if nv == 0 else ""
                moves.append(Move(f"Add 1 finger to {side[i]}({self._u(h)}) -> {self._u(nv)}{tag}",
                                  frozen(board), kind="add", to_h=i))

        # Sign flip (integers rule): negate a living hand
        if r.integers:
            for i, h in enumerate((a, b)):
                if h == 0:
                    continue
                nv = (-h) % r.base if r.rollover else -h
                board = clone()
                board[me][i] = nv
                moves.append(Move(f"Flip {side[i]}({self._u(h)}) -> {self._u(nv)}",
                                  frozen(board), kind="flip", to_h=i))

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
            board = clone()
            board[me] = [c, d]
            moves.append(Move(f"{kind}: {self._u(a)}-{self._u(b)} -> {self._u(c)}-{self._u(d)}",
                              frozen(board),
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
                board = clone()
                board[me] = [c, d]
                moves.append(Move(f"Meta: combine {self._u(a)}-{self._u(b)} ({self._u(total)}), "
                                  f"subtract {self._u(r.base)} -> {self._u(c)}-{self._u(d)}",
                                  frozen(board), kind="meta"))

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
        r = self.rules
        me = self.turn
        self.hands = [list(h) for h in move.hands]
        self.swap_streak[me] = self.swap_streak[me] + 1 if move.is_swap else 0
        if move.uses_switch:
            self.switch_used[me] = True

        # Knock out any newly-dead seats *before* passing the turn, so the
        # hand-off skips a seat this move just eliminated.
        newly = self._mark_eliminations()

        # Misère: the goal is to be knocked out, so the first seat to fall wins.
        if r.misere and newly:
            w, both_out = newly[0]
            how = "lost both hands" if both_out else "is down to 1 finger"
            self._win(w, f"{self.names[w]} {how} first — and wins the misère game!")
            return

        # Normal: last seat standing takes it.
        live = self.live_players()
        if len(live) <= 1:
            if not live:
                self.winner = None
                self.result = "Everyone is out at once — a draw."
                return
            if len(newly) == 1:
                how = "lost both hands" if newly[0][1] else "is down to 1 finger"
                lead = f"{self.names[newly[0][0]]} {how}"
            elif newly:
                lead = " & ".join(self.names[p] for p, _ in newly) + " are out"
            else:
                lead = f"{self.names[live[0]]} is the only one left"
            self._win(live[0], lead + " —")
            return

        self.turn = self.next_turn(me)

        if r.repetition_draw and self._record() >= r.repetition_draw:
            self.result = f"Draw by {r.repetition_draw}-fold repetition."
            return

        # The seat to move can't: it's stuck. In misère that's a win; otherwise
        # the seat drops out and play carries on (in a 2-player game that ends it).
        if not self.legal_moves():
            stuck = self.turn
            if r.misere:
                self._win(stuck, f"{self.names[stuck]} has no legal moves — and wins the misère game!")
                return
            self.eliminated[stuck] = True
            live = self.live_players()
            if len(live) <= 1:
                w = live[0] if live else None
                self.winner = w
                who = self.names[w] if w is not None else "nobody"
                self.result = f"{self.names[stuck]} has no legal moves — {who} is the winner."
                return
            self.turn = self.next_turn(stuck)

    def _win(self, w: int, lead: str) -> None:
        """Record a decided game. `lead` is the 'why' clause; the winner
        sentence is appended after ' — ' so a UI can split reason from verdict."""
        self.winner = w
        self.result = f"{lead} {self.names[w]} is the winner."

    def _mark_eliminations(self):
        """Newly-dead seats at the current position: mark them out and report
        (seat, both_hands_gone) for the result text."""
        r = self.rules
        newly = []
        for p in range(r.players):
            if self.eliminated[p]:
                continue
            both_out = self.hands[p][0] == 0 and self.hands[p][1] == 0
            sudden = r.sudden_death and self.total(p) == 1
            if both_out or sudden:
                self.eliminated[p] = True
                newly.append((p, both_out))
        return newly


# ---------------------------------------------------------------------------
# CPU players
# Extendable: add an entry to CPUS mapping a name to (description, choose_fn),
# where choose_fn(game, moves, rng) returns one of the given legal moves.

def _successor(game: Game, move: Move) -> Game:
    """Lightweight copy of the game after `move`, enough for legal_moves()."""
    me = game.turn
    s = copy.copy(game)
    s.hands = [list(h) for h in move.hands]
    s.swap_streak = list(game.swap_streak)
    s.swap_streak[me] = s.swap_streak[me] + 1 if move.is_swap else 0
    s.switch_used = list(game.switch_used)
    if move.uses_switch:
        s.switch_used[me] = True
    # Recompute who's out from the resulting hands so the turn hand-off (which
    # may skip more than one seat in a 3+ player game) is correct.
    s.eliminated = [h[0] == 0 and h[1] == 0 for h in s.hands]
    s.turn = s.next_turn(me)
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
    me = game.turn
    attacks = [m for m in moves if m.kind == "attack"]
    # prefer live targets (death-attack rules also offer dead ones); each attack
    # names its own target seat via to_p, so this works for any opponent count.
    pool = [m for m in attacks if game.hands[m.to_p][m.to_h] != 0] or attacks
    favorite = min(pool, default=None,
                   key=lambda m: (game.hands[m.to_p][m.to_h], game.hands[me][m.from_h]))
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
        cells = [f"[ {'X' if v == 0 else game._u(v)} ]" for v in game.hands[p]]
        return f"  L{cells[0]}  R{cells[1]}"

    # Seats top-to-bottom, so seat 0 (the first to move) sits at the bottom.
    lines = []
    for p in range(game.rules.players - 1, -1, -1):
        mark = "->" if game.turn == p and not game.result else "  "
        tag = "   (out)" if game.eliminated[p] else ""
        lines.append(f"{mark} {game.names[p]:<10}{pair(p)}{tag}")
    return "\n" + "\n".join(lines) + "\n"


def outcome_text(game: Game, controllers) -> str:
    """Short verdict; who 'you' is depends on who was playing."""
    if game.winner is None:
        return game.result  # draw
    w = game.winner
    humans = sum(1 for c in controllers if c == "human")
    # With a single human at the table it's personal; otherwise name the winner.
    if humans == 1:
        return "You win!" if controllers[w] == "human" else "You lose!"
    if controllers[w] == "human":
        return f"{game.names[w]} wins!"
    return f"{game.names[w]} (CPU: {controllers[w]}) wins!"


def play(game: Game, controllers=None, rng=None) -> None:
    rng = rng or random.Random()
    controllers = tuple(controllers) if controllers else ("human",) * game.rules.players
    print(f"\n=== Chopsticks ===\nRules: {game.rules.describe()}")
    if game.rules.players > 2:
        way = "clockwise" if game.rules.direction >= 0 else "counter-clockwise"
        print(f"Table: {game.rules.players} players, {way}")
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
    # Table settings live outside the rule presets so a preset never resets them.
    if args.players is not None:
        overrides["players"] = args.players
    if args.direction is not None:
        overrides["direction"] = 1 if args.direction == "cw" else -1
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
    ap = argparse.ArgumentParser(description="Chopsticks with configurable rulesets, for two or more players (see RULESETS.md)")
    ap.add_argument("--preset", default="standard", help="named ruleset (default: standard)")
    ap.add_argument("--list-presets", action="store_true", help="list presets and exit")
    ap.add_argument("--set", action="append", metavar="RULE=VALUE",
                    help="override a rule, e.g. --set suicide=true --set start=4,4 (repeatable)")
    ap.add_argument("--rules-file", help="JSON file of rule overrides")
    ap.add_argument("--show-rules", action="store_true", help="print the effective ruleset and exit")
    ap.add_argument("--players", type=int, default=None, help="number of seats at the table (default: 2)")
    ap.add_argument("--direction", choices=("cw", "ccw"), default=None,
                    help="turn order for 3+ players: cw (clockwise, default) or ccw")
    ap.add_argument("--names", nargs="*", metavar="NAME", default=None,
                    help="player names, in seat order (defaults to Player 1, Player 2, …)")
    controllers = ["human"] + sorted(CPUS)
    ap.add_argument("--controllers", nargs="*", choices=controllers, default=None, metavar="WHO",
                    help="who plays each seat, in order: human or a CPU name (default: all human)")
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

    n = rules.players
    names = list(args.names) if args.names else []
    names = (names + [f"Player {i + 1}" for i in range(len(names), n)])[:n]
    ctrls = list(args.controllers) if args.controllers else []
    ctrls = (ctrls + ["human"] * n)[:n]

    rng = random.Random(args.seed) if args.seed is not None else None
    play(Game(rules, tuple(names)), controllers=tuple(ctrls), rng=rng)


if __name__ == "__main__":
    main()
