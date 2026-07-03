import { test, expect } from "@playwright/test";

// Two-player mode is fully deterministic — no CPU, no timers — so a game driven
// by clicking is stable to assert on. Defaults already put us in two-human mode.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
});

test("Start game reveals the board", async ({ page }) => {
  await expect(page.locator("#play")).toHaveClass(/active/);
  await expect(page.locator("#board")).toBeVisible();
  await expect(page.locator(".hand")).toHaveCount(4); // two hands each side
  await expect(page.locator("#logPanel")).toContainText("Move log");
  await expect(page.locator("#hint")).toContainText("Player 1");
  // Play-only header controls appear.
  await expect(page.locator("#undoBtn")).toBeDisabled();
});

test("tapping a hand selects it and highlights targets", async ({ page }) => {
  // Player 1 owns the bottom row; its hands are selectable at the start.
  const mine = page.locator(".hand.selectable").first();
  await mine.click();
  await expect(page.locator(".hand.selected")).toHaveCount(1);
  await expect(page.locator(".hand.target").first()).toBeVisible();
  await expect(page.locator("#hint")).toContainText("tap a highlighted target");
});

test("an attack logs the move and passes the turn", async ({ page }) => {
  await page.locator(".hand.selectable").first().click();
  await page.locator(".hand.target").first().click();

  // One log entry, and it is now Player 2's turn.
  await expect(page.locator("#log .who")).toHaveCount(1);
  await expect(page.locator(".name-tag.p1")).toHaveClass(/active/);
  await expect(page.locator("#hint")).toContainText("Player 2");
  await expect(page.locator("#undoBtn")).toBeEnabled();
});

test("undo reverts the last move", async ({ page }) => {
  await page.locator(".hand.selectable").first().click();
  await page.locator(".hand.target").first().click();
  await expect(page.locator("#log .who")).toHaveCount(1);

  await page.locator("#undoBtn").click();
  await expect(page.locator("#log .who")).toHaveCount(0);
  await expect(page.locator("#hint")).toContainText("Player 1");
  await expect(page.locator("#undoBtn")).toBeDisabled();
});

test("Main menu returns to setup", async ({ page }) => {
  await page.locator("#navSetup").click();
  await expect(page.locator("#setup")).toHaveClass(/active/);
  await expect(page.locator("#play")).not.toHaveClass(/active/);
});
