<script setup>
import { useGame } from "../composables/useChopsticks.js";
import PlayerRow from "./PlayerRow.vue";
import RuleForm from "./RuleForm.vue";
const g = useGame();
</script>

<template>
  <main id="setup" class="view" :class="{ active: g.view === 'setup' }">
    <div class="setup-card">
      <h2>🥢 Chopsticks</h2>
      <p class="tagline">Set up a game, then start playing.</p>

      <div class="mode-row">
        <button class="mode-btn" :class="{ active: g.currentMode === 'single' }" @click="g.setMode('single')">🤖 Single player</button>
        <button class="mode-btn" :class="{ active: g.currentMode === 'two' }" @click="g.setMode('two')">👥 Two players</button>
        <button class="mode-btn" :class="{ active: g.currentMode === 'watch' }" @click="g.setMode('watch')">🤖👀 Watch CPUs</button>
      </div>

      <div class="fgroup">Players</div>
      <PlayerRow v-for="p in [0, 1]" :key="p" :p="p" />
      <span class="note" v-show="g.anyRemote">“CPU: remote” connects to an engine process at localhost:&lt;port&gt;.</span>

      <RuleForm />

      <div class="setup-actions">
        <button class="primary" @click="g.start">Start game</button>
        <button @click="g.reset">Reset to defaults</button>
      </div>
    </div>
  </main>
</template>
