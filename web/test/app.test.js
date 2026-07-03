import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "../src/App.vue";

beforeEach(() => {
  localStorage.clear();
  document.body.className = "";
});

describe("App — top-level rendering", () => {
  it("renders the setup screen with mode buttons and no board", () => {
    const wrapper = mount(App);
    expect(wrapper.text()).toContain("Chopsticks");
    expect(wrapper.find("#setup").classes()).toContain("active");
    expect(wrapper.findAll(".mode-btn")).toHaveLength(3);
    expect(wrapper.find("#play").exists()).toBe(false); // no game yet
    expect(wrapper.findAll(".prow")).toHaveLength(2);   // two player rows
  });

  it("Start game reveals the board with four hands and the log", async () => {
    const wrapper = mount(App);
    await wrapper.find(".setup-actions .primary").trigger("click");
    expect(wrapper.find("#play").exists()).toBe(true);
    expect(wrapper.find("#play").classes()).toContain("active");
    expect(wrapper.findAll(".hand")).toHaveLength(4);
    expect(wrapper.find("#logPanel").text()).toContain("Move log");
  });
});
