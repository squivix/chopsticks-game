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
      <span class="wlabel">CPUs:</span>
      <button @click="g.toggleAuto">{{ g.autoToggleText }}</button>
      <button v-show="g.showStep" :disabled="g.stepDisabled" @click="g.stepCPU">Step →</button>
    </div>

    <!-- 3+ players: a round "table" so turn direction reads visually. -->
    <div v-if="g.seatCount > 2" class="arena" :class="'seats-' + g.seatCount">
      <div class="dir-glyph" aria-hidden="true">{{ g.directionGlyph }}</div>
      <div class="seat" v-for="p in g.allSeats" :key="p" :style="g.seatStyle(p)"
           :class="{ active: g.seatActive(p), out: g.seatOut(p) }">
        <div class="hands">
          <HandView v-for="h in g.handSides(p)" :key="h" :p="p" :h="h" />
        </div>
        <div class="name-tag" :style="g.seatLabelStyle(p)" :class="['p' + p, { active: g.seatActive(p), out: g.seatOut(p) }]"><span class="dot"></span><span class="nm">{{ g.seatLabel(p) }}</span></div>
      </div>
    </div>

    <!-- 2 players: the classic face-to-face layout, you at the bottom. -->
    <template v-else>
      <div class="player-row">
        <div class="name-tag p1" :class="{ active: g.seatActive(1), out: g.seatOut(1) }"><span class="dot"></span><span class="nm">{{ g.seatLabel(1) }}</span></div>
        <div class="hands">
          <HandView v-for="h in g.handSides(1)" :key="h" :p="1" :h="h" />
        </div>
      </div>
    </template>

    <div id="hint">{{ g.hintText }}</div>
    <div id="cheat" :class="{ on: g.cheatUI.on }" aria-live="polite">{{ g.cheatUI.text }}</div>

    <!-- Your own seat (seat 0) sits at the bottom in both layouts. -->
    <div v-if="g.seatCount <= 2" class="player-row">
      <div class="hands">
        <HandView v-for="h in g.handSides(0)" :key="h" :p="0" :h="h" />
      </div>
      <div class="name-tag p0" :class="{ active: g.seatActive(0), out: g.seatOut(0) }"><span class="dot"></span><span class="nm">{{ g.seatLabel(0) }}</span></div>
    </div>

    <div id="movebar">
      <button v-for="(b, i) in g.play.buttons" :key="i" :class="{ primary: b.primary }"
              :disabled="b.disabled" @click="b.action()">{{ b.text }}</button>
    </div>
  </section>
</template>
