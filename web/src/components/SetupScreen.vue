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
        <button class="mode-btn" :class="{ active: g.currentMode === 'two' }" @click="g.setMode('two')">{{ g.playersCount === 2 ? '👥 Two players' : '👥 All humans' }}</button>
        <button class="mode-btn" :class="{ active: g.currentMode === 'watch' }" @click="g.setMode('watch')">🤖👀 Watch CPUs</button>
      </div>

      <div class="fgroup">Table</div>
      <div class="mode-row">
        <button v-for="n in [2, 3, 4]" :key="n" class="mode-btn"
                :class="{ active: g.playersCount === n }" @click="g.setPlayers(n)">{{ n }} players</button>
      </div>
      <div class="mode-row" v-show="g.playersCount > 2">
        <button class="mode-btn" :class="{ active: g.direction === 'cw' }" @click="g.setDirection('cw')">⟳ Clockwise</button>
        <button class="mode-btn" :class="{ active: g.direction === 'ccw' }" @click="g.setDirection('ccw')">⟲ Counter-clockwise</button>
      </div>

      <div class="fgroup">Players</div>
      <PlayerRow v-for="p in g.playersCount" :key="p" :p="p - 1" />
      <span class="note" v-show="g.anyRemote">“CPU: remote” connects to an engine process at localhost:&lt;port&gt;.</span>

      <RuleForm />

      <div class="setup-actions">
        <button class="primary" @click="g.start">Start game</button>
        <button @click="g.reset">Reset to defaults</button>
      </div>
    </div>
  </main>
</template>
