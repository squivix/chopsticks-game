import { describe, it, expect } from "vitest";
import C from "../src/lib/engine.js";
import Solver from "../src/lib/solver.js";

describe("solver — retrograde analysis", () => {
  it("solves standard rules into a labelled table", () => {
    const g = C.newGame({}, ["A", "B"]);
    const table = Solver.solve(g.rules);
    expect(table.size).toBeGreaterThan(0);
    const start = { hands: [[1, 1], [1, 1]], turn: 0, swapStreak: [0, 0], switchUsed: [false, false] };
    expect(["W", "L", "D"]).toContain(table.get(start).result);
  });

  it("memoises: solving the same ruleset twice yields the same table object", () => {
    const g = C.newGame({}, ["A", "B"]);
    expect(Solver.solve(g.rules)).toBe(Solver.solve(g.rules));
  });
});

describe("solver — chooseMove", () => {
  it("always returns one of the supplied legal moves", () => {
    const g = C.newGame({}, ["A", "B"]);
    const moves = C.legalMoves(g);
    const chosen = Solver.chooseMove(g, moves, () => 0);
    expect(moves).toContain(chosen);
  });

  it("plays a complete optimal-vs-optimal game to a result without error", () => {
    const g = C.newGame({}, ["A", "B"]);
    let plies = 0;
    while (!g.result && plies < 500) {
      const moves = C.legalMoves(g);
      C.applyMove(g, Solver.chooseMove(g, moves, () => 0));
      plies++;
    }
    expect(g.result).toBeTruthy();
  });
});
