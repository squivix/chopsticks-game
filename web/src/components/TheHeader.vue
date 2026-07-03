<script setup>
import { useGame } from "../composables/useChopsticks.js";
const g = useGame();
</script>

<template>
  <header>
    <h1 id="logo" title="Back to main menu" @click="g.openSetup">🥢 Chopsticks</h1>
    <span class="spacer"></span>
    <button id="themeBtn" title="Toggle dark mode" aria-label="Toggle dark mode"
            @click="g.toggleTheme">{{ g.themeIcon }}</button>
    <button id="navSetup" class="play-only" @click="g.openSetup">☰ Main menu</button>
    <button id="undoBtn" class="play-only" :disabled="g.undoDisabled" @click="g.undo">↺ Undo</button>
    <button id="cheatBtn" class="play-only" v-show="g.cheatAvailable" :class="{ active: g.cheat }"
            title="Cheat: reveal the optimal move" :aria-pressed="g.cheat ? 'true' : 'false'"
            @click="g.toggleCheat">👁 Cheat</button>
    <button id="newGameBtn" class="primary play-only" @click="g.startGame">New game</button>
  </header>
</template>
