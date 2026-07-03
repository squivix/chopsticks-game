import { describe, it, expect, beforeEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import C from "../src/lib/engine.js";
import { provideGame } from "../src/composables/useChopsticks.js";

/* Mount a throwaway host that creates the store in a real component context
   (provide/inject and reactivity need one) and hands it back to the test. */
function mountStore() {
  let store;
  const Host = defineComponent({
    setup() { store = provideGame(); return () => h("div"); },
  });
  const wrapper = mount(Host);
  return { store, wrapper };
}

beforeEach(() => {
  localStorage.clear();
  document.body.className = "";
});

describe("store — setup and game lifecycle", () => {
  it("starts on the setup screen with no game", () => {
    const { store } = mountStore();
    expect(store.view).toBe("setup");
    expect(store.game).toBe(null);
  });

  it("setMode switches the two controllers", () => {
    const { store } = mountStore();
    store.setMode("two");
    expect(store.controllers).toEqual(["human", "human"]);
    store.setMode("single");
    expect(store.controllers[0]).toBe("human");
    expect(store.controllers[1]).not.toBe("human");
    store.setMode("watch");
    expect(store.controllers.every((c) => c !== "human")).toBe(true);
  });

  it("startGame builds a fresh board and enters the play view", async () => {
    const { store } = mountStore();
    store.setMode("two");
    store.startGame();
    expect(store.view).toBe("play");
    expect(store.game).toBeTruthy();
    expect(store.game.hands).toEqual([[1, 1], [1, 1]]);
    await nextTick(); // the view watcher toggles body.in-play on flush
    expect(document.body.classList.contains("in-play")).toBe(true);
  });
});

describe("store — moves and undo", () => {
  it("doMove records the move, flips the turn, and undo reverses it", async () => {
    const { store } = mountStore();
    store.setMode("two");
    store.startGame();

    const move = C.legalMoves(store.game).find((m) => m.kind === "attack");
    store.doMove(move);
    await nextTick();
    expect(store.game.turn).toBe(1);
    expect(store.game.log).toHaveLength(1);
    expect(store.undoDisabled).toBe(false);

    store.undo();
    await nextTick();
    expect(store.game.turn).toBe(0);
    expect(store.game.log).toHaveLength(0);
    expect(store.undoDisabled).toBe(true);
  });

  it("the move log reflects players and friendly labels", async () => {
    const { store } = mountStore();
    store.setMode("two");
    store.startGame();
    store.doMove(C.legalMoves(store.game).find((m) => m.kind === "attack"));
    await nextTick();
    expect(store.logEntries).toHaveLength(1);
    expect(store.logEntries[0].player).toBe(0);
    expect(typeof store.logEntries[0].label).toBe("string");
  });

  // "Merge onto one hand" is the mirror of "Split evenly": while rearranging,
  // it piles both live hands onto one. That's a suicide split, so it's only
  // offered under rules that allow one (here the "suicide" preset).
  it("offers a Merge shortcut that piles fingers onto one hand", async () => {
    const { store } = mountStore();
    store.currentPreset = "suicide";
    store.presetChanged();
    store.setMode("two");
    store.startGame();
    expect(store.game.hands[0]).toEqual([1, 1]); // both hands live

    store.rearrange = store.game.hands[0].slice(); // enter "move fingers" mode
    await nextTick();
    const merge = store.play.buttons.find((b) => b.text === "Merge onto one hand");
    expect(merge).toBeTruthy();

    merge.action();
    expect(store.rearrange).toEqual([2, 0]); // total on one hand, the other emptied
  });

  it("does not offer Merge when suicide splits are illegal (standard rules)", () => {
    const { store } = mountStore();
    store.setMode("two");
    store.startGame(); // standard preset — killing your own hand isn't allowed
    store.rearrange = store.game.hands[0].slice();
    expect(store.play.buttons.some((b) => b.text === "Merge onto one hand")).toBe(false);
  });
});

describe("store — toggles persist", () => {
  it("toggleCheat flips state but never persists (always off by default)", () => {
    localStorage.setItem("chopsticks.cheat", "1"); // even a stale flag is ignored
    const { store } = mountStore();
    expect(store.cheat).toBe(false); // starts off regardless of storage
    store.toggleCheat();
    expect(store.cheat).toBe(true);
    expect(localStorage.getItem("chopsticks.cheat")).toBe("1"); // untouched, not written by the toggle
  });

  it("toggleTheme swaps theme and updates the document attribute", async () => {
    const { store } = mountStore();
    const first = store.theme;
    store.toggleTheme();
    expect(store.theme).not.toBe(first);
    await nextTick(); // the theme watcher writes data-theme on flush
    expect(document.documentElement.getAttribute("data-theme")).toBe(store.theme);
  });
});
