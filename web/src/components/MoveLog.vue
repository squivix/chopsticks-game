<script setup>
import { ref, watch, nextTick, toRef } from "vue";
import { useGame } from "../composables/useChopsticks.js";
const g = useGame();
const logEl = ref(null);

// Keep the log pinned to the newest entry as moves and the outcome arrive.
watch([toRef(g, "logEntries"), toRef(g, "outcome")], () => nextTick(() => {
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}));
</script>

<template>
  <aside id="logPanel">
    <h2>Move log</h2>
    <div id="log" ref="logEl">
      <div v-for="(e, i) in g.logEntries" :key="i"><span class="who" :class="'w' + e.player">{{ e.who }}</span> {{ e.label }}</div>
      <div v-if="g.outcome"><b>{{ g.outcome }}</b></div>
    </div>
  </aside>
</template>
