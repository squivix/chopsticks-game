<script setup>
import { useGame } from "../composables/useChopsticks.js";
defineProps({
  p: { type: Number, required: true },
  h: { type: Number, required: true },
});
const g = useGame();
</script>

<template>
  <div class="hand" :class="g.handMods(p, h)" v-html="g.handHtml(p, h)" @click="g.onHandClick(p, h)"></div>
</template>
