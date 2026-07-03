import { describe, it, expect } from "vitest";
import C from "../src/lib/engine.js";

describe("engine — new game", () => {
  it("starts standard chopsticks at 1&1 each, player 0 to move", () => {
    const g = C.newGame({}, ["A", "B"]);
    expect(g.hands).toEqual([[1, 1], [1, 1]]);
    expect(g.turn).toBe(0);
    expect(g.result).toBeFalsy();
    expect(g.names).toEqual(["A", "B"]);
  });

  it("offers four opening attacks in standard rules (2 hands × 2 targets)", () => {
    const g = C.newGame({}, ["A", "B"]);
    const moves = C.legalMoves(g);
    expect(moves).toHaveLength(4);
    expect(moves.every((m) => m.kind === "attack")).toBe(true);
  });
});

describe("engine — applying moves", () => {
  it("an attack adds the tapping hand onto the target and flips the turn", () => {
    const g = C.newGame({}, ["A", "B"]);
    const attack = C.legalMoves(g).find((m) => m.kind === "attack");
    C.applyMove(g, attack);
    expect(g.turn).toBe(1);
    expect(g.log).toHaveLength(1);
    // one of player 1's hands is now 2 (1 + 1)
    expect(g.hands[1].includes(2)).toBe(true);
  });

  it("a hand reaching the base (5) is knocked out to 0", () => {
    // craft a position where a 4-hand is tapped by a 1-hand -> 5 -> dead
    const g = C.newGame({}, ["A", "B"]);
    g.hands = [[1, 1], [4, 1]];
    const kill = C.legalMoves(g).find(
      (m) => m.kind === "attack" && m.to.h === 0 && m.hands[1][0] === 0);
    expect(kill).toBeTruthy();
  });
});

describe("engine — a full random game terminates", () => {
  it("reaches a result within a bounded number of plies", () => {
    let seed = 12345;
    const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let trial = 0; trial < 25; trial++) {
      const g = C.newGame({}, ["A", "B"]);
      let plies = 0;
      while (!g.result && plies < 500) {
        const moves = C.legalMoves(g);
        C.applyMove(g, moves[Math.floor(rng() * moves.length)]);
        plies++;
      }
      expect(g.result).toBeTruthy();
      // a decided game names a winner; a draw leaves winner null
      if (!/[Dd]raw/.test(g.result)) expect([0, 1]).toContain(g.winner);
    }
  });
});

describe("engine — three or more players", () => {
  it("starts every seat at 1&1 with seat 0 to move", () => {
    const g = C.newGame({ players: 3 }, ["A", "B", "C"]);
    expect(g.hands).toEqual([[1, 1], [1, 1], [1, 1]]);
    expect(g.eliminated).toEqual([false, false, false]);
    expect(g.turn).toBe(0);
  });

  it("offers attacks against both opponents (2 hands × 2 opponents × 2 targets)", () => {
    const g = C.newGame({ players: 3 }, ["A", "B", "C"]);
    const attacks = C.legalMoves(g).filter((m) => m.kind === "attack");
    expect(attacks).toHaveLength(8);
    expect(new Set(attacks.map((m) => m.to.p))).toEqual(new Set([1, 2]));
  });

  it("passes the turn clockwise, and counter-clockwise the other way", () => {
    const cw = C.newGame({ players: 3, direction: 1 }, ["A", "B", "C"]);
    C.applyMove(cw, C.legalMoves(cw)[0]);
    expect(cw.turn).toBe(1);
    const ccw = C.newGame({ players: 3, direction: -1 }, ["A", "B", "C"]);
    C.applyMove(ccw, C.legalMoves(ccw)[0]);
    expect(ccw.turn).toBe(2);
  });

  it("skips an eliminated seat in the turn order and ends on the last standing", () => {
    const g = C.newGame({ players: 3 }, ["A", "B", "C"]);
    g.hands = [[1, 1], [0, 0], [1, 1]]; // B is already out
    g.eliminated = [false, true, false];
    g.turn = 0;
    C.applyMove(g, C.legalMoves(g)[0]); // A moves → turn should skip B to C
    expect(g.turn).toBe(2);
    expect(g.result).toBeFalsy();
  });

  it("keeps going after one seat falls until a single winner remains", () => {
    const g = C.newGame({ players: 3 }, ["A", "B", "C"]);
    // A knocks out C's last living hand; B is still in, so the game continues.
    g.hands = [[1, 0], [1, 1], [0, 4]];
    g.turn = 0;
    const kill = C.legalMoves(g).find(
      (m) => m.kind === "attack" && m.to.p === 2 && m.hands[2][0] === 0 && m.hands[2][1] === 0);
    expect(kill).toBeTruthy();
    C.applyMove(g, kill);
    expect(g.eliminated[2]).toBe(true);
    expect(g.result).toBeFalsy(); // A and B remain
    expect(g.turn).toBe(1);       // C is skipped
  });
});

describe("engine — rules & presets", () => {
  it("describeRules returns a non-empty human string", () => {
    const g = C.newGame({}, ["A", "B"]);
    expect(typeof C.describeRules(g.rules)).toBe("string");
    expect(C.describeRules(g.rules).length).toBeGreaterThan(0);
  });

  it("every built-in preset produces a valid ruleset", () => {
    for (const [name, [, overrides]] of Object.entries(C.PRESETS)) {
      expect(() => C.makeRules(overrides), name).not.toThrow();
    }
  });

  it("makeRules rejects an impossible base", () => {
    expect(() => C.makeRules({ base: 1 })).toThrow();
  });
});
