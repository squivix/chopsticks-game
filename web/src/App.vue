<script setup>
import { provideGame } from "./composables/useChopsticks.js";
import TheHeader from "./components/TheHeader.vue";
import SetupScreen from "./components/SetupScreen.vue";
import PlayScreen from "./components/PlayScreen.vue";

// Create the single game store and share it with every descendant.
const g = provideGame();
</script>

<template>
  <TheHeader />
  <div id="rulesLine">{{ g.rulesLine }}</div>
  <SetupScreen />
  <PlayScreen v-if="g.game" />
</template>
