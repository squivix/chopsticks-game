import { describe, it, expect } from "vitest";
import C from "../src/lib/engine.js";
import ChopsticksCPU from "../src/lib/cpu.js";

const { CPUS, successorState, opponentCanKillMyHand } = ChopsticksCPU;

describe("cpu — registry", () => {
  it("exposes the dummy, random, optimal and remote strategies", () => {
    expect(Object.keys(CPUS)).toEqual(["dummy", "random", "optimal", "remote"]);
    for (const name of Object.keys(CPUS)) {
      expect(typeof CPUS[name].choose).toBe("function");
      expect(typeof CPUS[name].description).toBe("string");
    }
  });
});

describe("cpu — local strategies pick legal moves", () => {
  for (const name of ["dummy", "random", "optimal"]) {
    it(`${name}.choose returns one of the legal moves`, () => {
      const g = C.newGame({}, ["A", "B"]);
      const moves = C.legalMoves(g);
      const chosen = CPUS[name].choose(g, moves, () => 0);
      expect(moves).toContain(chosen);
    });
  }

  it("dummy plays a full game without throwing", () => {
    const g = C.newGame({}, ["A", "B"]);
    let plies = 0;
    let seed = 7;
    const rng = () => (seed = (seed * 48271) % 0x7fffffff) / 0x7fffffff;
    while (!g.result && plies < 500) {
      const moves = C.legalMoves(g);
      C.applyMove(g, CPUS.dummy.choose(g, moves, rng));
      plies++;
    }
    expect(g.result).toBeTruthy();
  });
});

describe("cpu — successor helpers", () => {
  it("successorState flips the turn and keeps hands the move produced", () => {
    const g = C.newGame({}, ["A", "B"]);
    const move = C.legalMoves(g).find((m) => m.kind === "attack");
    const succ = successorState(g, move);
    expect(succ.turn).toBe(1 - g.turn);
    expect(succ.hands).toEqual(move.hands);
  });

  it("opponentCanKillMyHand is a boolean predicate", () => {
    const g = C.newGame({}, ["A", "B"]);
    const move = C.legalMoves(g).find((m) => m.kind === "attack");
    expect(typeof opponentCanKillMyHand(g, move)).toBe("boolean");
  });
});
