import { test, expect } from "@playwright/test";

// Each test gets a fresh browser context, so localStorage starts empty and the
// app boots at its defaults: dark theme, "standard" preset, two human players.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("shows the setup screen at its defaults", async ({ page }) => {
  await expect(page.locator("#setup")).toHaveClass(/active/);
  await expect(page.locator("#play")).toHaveCount(0); // no game yet
  await expect(page.locator("#logo")).toHaveText("🥢 Chopsticks");
  await expect(page.locator(".mode-btn")).toHaveCount(3);
  await expect(page.locator(".prow")).toHaveCount(2);
  // Two humans is the default, so "Two players" is the active mode.
  await expect(page.getByRole("button", { name: /Two players/ })).toHaveClass(/active/);
});

test("switching mode highlights the chosen button", async ({ page }) => {
  const single = page.getByRole("button", { name: /Single player/ });
  const watch = page.getByRole("button", { name: /Watch CPUs/ });

  await single.click();
  await expect(single).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: /Two players/ })).not.toHaveClass(/active/);

  await watch.click();
  await expect(watch).toHaveClass(/active/);
  await expect(single).not.toHaveClass(/active/);
});

test("theme toggle flips the document theme and persists across reload", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.locator("#themeBtn").click();
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("changing the preset updates the rules summary once in play", async ({ page }) => {
  const preset = page.locator("#presetSelect");
  await expect(preset).toBeVisible();
  await preset.selectOption("misere");

  await page.getByRole("button", { name: "Start game" }).click();
  // The rules line names the active preset.
  await expect(page.locator("#rulesLine")).toContainText("misere");
});
