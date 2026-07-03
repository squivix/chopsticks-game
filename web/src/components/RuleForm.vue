<script setup>
import { useGame } from "../composables/useChopsticks.js";
const g = useGame();
</script>

<template>
  <div class="fgroup">Rules</div>
  <div class="preset-row">
    <label><span>Preset</span>
      <select id="presetSelect" v-model="g.currentPreset" @change="g.presetChanged">
        <option v-for="pr in g.builtinPresets" :key="pr.name" :value="pr.name" :title="pr.desc">{{ pr.name }}</option>
        <optgroup v-if="g.customPresetNames.length" label="Your presets">
          <option v-for="n in g.customPresetNames" :key="n" :value="n" :title="g.presetTitle(n)">{{ n }}</option>
        </optgroup>
        <option value="custom">custom</option>
      </select>
    </label>
    <button id="deletePresetBtn" title="Delete this saved preset"
            v-show="!!g.customPresets[g.currentPreset]" @click="g.deletePreset">🗑 Delete</button>
  </div>
  <details id="rulesDetails">
    <summary>Advanced rules…</summary>
    <div id="ruleForm">
      <template v-for="(f, i) in g.RULE_FIELDS" :key="i">
        <div v-if="f.group" class="fgroup">{{ f.group }}</div>
        <label v-else class="field">
          <template v-if="f.type === 'bool'">
            <input type="checkbox" v-model="g.fv[f.key]" @change="g.markCustom"> {{ ' ' + f.label }}
          </template>
          <template v-else>
            {{ f.label + ' ' }}<input type="number" :min="f.min" :max="f.max" v-model.number="g.fv[f.key]" @change="g.markCustom">
          </template>
        </label>
      </template>
    </div>
    <div class="preset-save">
      <input type="text" maxlength="24" placeholder="Name for a new preset" v-model="g.presetName">
      <button @click="g.savePreset">Save current rules</button>
    </div>
  </details>
</template>
