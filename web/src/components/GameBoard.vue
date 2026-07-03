<script setup>
import { useGame } from "../composables/useChopsticks.js";
import HandView from "./HandView.vue";
const g = useGame();
</script>

<template>
  <section id="board">
    <div id="result" :class="{ show: g.showResult }">
      <div class="verdict">{{ g.verdict }}</div>
      <div class="reason">{{ g.reason }}</div>
      <div class="result-actions">
        <button class="primary" @click="g.startGame">Play again</button>
        <button @click="g.openSetup">Main menu</button>
      </div>
    </div>
    <div id="watchbar" :class="{ show: g.watchLive }">
      <span class="wlabel">CPU vs CPU:</span>
      <button @click="g.toggleAuto">{{ g.autoToggleText }}</button>
      <button v-show="g.showStep" :disabled="g.stepDisabled" @click="g.stepCPU">Step ⏭</button>
    </div>
    <div class="player-row">
      <div class="name-tag p1" :class="{ active: g.activeP === 1 }"><span class="dot"></span><span class="nm">{{ g.labelTop }}</span></div>
      <div class="hands">
        <!-- opponent faces you: their right hand is on your left -->
        <HandView :p="1" :h="1" />
        <HandView :p="1" :h="0" />
      </div>
    </div>
    <div id="hint">{{ g.hintText }}</div>
    <div id="cheat" :class="{ on: g.cheatUI.on }" aria-live="polite">{{ g.cheatUI.text }}</div>
    <div class="player-row">
      <div class="hands">
        <HandView :p="0" :h="0" />
        <HandView :p="0" :h="1" />
      </div>
      <div class="name-tag p0" :class="{ active: g.activeP === 0 }"><span class="dot"></span><span class="nm">{{ g.labelBottom }}</span></div>
    </div>
    <div id="movebar">
      <button v-for="(b, i) in g.play.buttons" :key="i" :class="{ primary: b.primary }"
              :disabled="b.disabled" @click="b.action()">{{ b.text }}</button>
    </div>
  </section>
</template>
