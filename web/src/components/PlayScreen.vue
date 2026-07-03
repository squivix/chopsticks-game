<script setup>
import { useGame } from "../composables/useChopsticks.js";
import GameBoard from "./GameBoard.vue";
import MoveLog from "./MoveLog.vue";
const g = useGame();
</script>

<template>
  <main id="play" class="view" :class="{ active: g.view === 'play' }">
    <GameBoard />
    <MoveLog />
  </main>
</template>
