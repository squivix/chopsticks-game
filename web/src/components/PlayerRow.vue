<script setup>
import { useGame } from "../composables/useChopsticks.js";
defineProps({ p: { type: Number, required: true } });
const g = useGame();
</script>

<template>
  <div class="prow">
    <span class="dot" :class="'d' + p"></span>
    <input type="text" maxlength="16" :placeholder="g.namePlaceholder(p)"
           :style="{ visibility: g.controllers[p] === 'remote' ? 'hidden' : '' }"
           v-model="g.names[p]">
    <select :style="{ flex: g.controllers[p] === 'remote' ? 'none' : '1' }"
            v-model="g.controllers[p]" @change="g.ctrlChanged(p)">
      <option value="human">Human</option>
      <option v-for="c in g.cpuOptions" :key="c" :value="c">{{ 'CPU: ' + c }}</option>
    </select>
    <input type="number" class="port" min="1" max="65535" placeholder="port"
           title="Remote engine port on localhost" v-show="g.controllers[p] === 'remote'"
           :value="g.remotePorts[p]" @change="g.setPort(p, $event.target.value)">
  </div>
</template>
