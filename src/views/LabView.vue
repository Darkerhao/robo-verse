<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { useLabStore } from '@/stores/lab'
import RobotViewport from '@/components/RobotViewport.vue'
import RobotControl from '@/components/RobotControl.vue'
import LabControl from '@/components/LabControl.vue'
import AppIcon from '@/components/AppIcon.vue'
const sim = useSimulationStore(), lab = useLabStore()
const viewport = ref<InstanceType<typeof RobotViewport>>()
const mode = ref<'structure' | 'motion'>('structure')
const joint = ref<string>()
watch(() => sim.selectedId, () => { lab.reset(); mode.value = 'structure'; joint.value = undefined }, { immediate: true })
onUnmounted(lab.reset)
function controlJoint(id: string) { joint.value = id; mode.value = 'motion' }
</script>

<template>
  <div class="laboratory">
    <div class="page-heading"><div><div class="eyebrow">NEXT ROBOTICS / HOLOGRAPHIC LAB</div><h1>全息实验室<span>.</span></h1><p>从外壳逐步探索内部机构，观察机械层级与真实关节运动。</p></div><div class="lab-page-actions"><div class="segmented" aria-label="实验室面板"><button :class="{ active: mode === 'structure' }" :aria-pressed="mode === 'structure'" @click="mode = 'structure'">结构探索</button><button :class="{ active: mode === 'motion' }" :aria-pressed="mode === 'motion'" @click="mode = 'motion'">动作实验</button></div><button class="btn btn-ghost" @click="sim.send({ type: 'pause', value: !sim.snapshot.paused }, sim.snapshot.paused ? '继续仿真与结构动画' : '暂停仿真与结构动画')"><AppIcon :name="sim.snapshot.paused ? 'play' : 'pause'" />{{ sim.snapshot.paused ? '继续仿真' : '暂停仿真' }}</button></div></div>
    <div v-if="sim.error" class="lab-error" role="alert">{{ sim.error }}<button aria-label="关闭错误提示" @click="sim.error = ''"><AppIcon name="close" /></button></div>
    <div class="lab-robot-bar"><div class="segmented" aria-label="实验室机器人"><button data-lab-robot="quadruped" :class="{ active: sim.selectedId === 'quadruped' }" :aria-pressed="sim.selectedId === 'quadruped'" @click="sim.select('quadruped')"><AppIcon name="dog" />机器狗</button><button data-lab-robot="humanoid" :class="{ active: sim.selectedId === 'humanoid' }" :aria-pressed="sim.selectedId === 'humanoid'" @click="sim.select('humanoid')"><AppIcon name="person" />人形机器人</button></div><span>{{ sim.definition.drivenAxes }} 个受控轴 · {{ sim.status }}</span><button class="btn btn-ghost" @click="viewport?.fit()"><AppIcon name="target" />查看完整结构</button></div>
    <div class="laboratory-main"><RobotViewport ref="viewport" lab /><LabControl v-if="mode === 'structure'" @fit="viewport?.fit()" @focus="viewport?.focusPart()" @joint="controlJoint" /><RobotControl v-else :joint="joint" compact /></div>
    <p class="lab-footnote"><AppIcon name="shield" />SIMULATION · 拆解为概念模型的结构演示，关节与系统参数来自统一运动学仿真。</p>
  </div>
</template>

<style scoped lang="less">
.page-heading { margin-bottom: 17px; h1 { margin-top: 7px; > span { color: var(--accent); } }.eyebrow { font-size: 8px; letter-spacing: 1.6px; } p { line-height: 1.6; } }
.lab-page-actions { display: flex; align-items: center; gap: 10px; .btn,.segmented button { font-size: 11px; } }
.lab-robot-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 13px; .segmented button { display: flex; align-items: center; gap: 6px; font-size: 11px; .icon { width: 14px; height: 14px; } } > span { color: var(--muted); font-size: 10px; } > .btn { margin-left: auto; font-size: 10px; min-height: 32px; } }
.laboratory-main { display: grid; grid-template-columns: minmax(0, 1fr) 334px; gap: 16px; height: clamp(420px, calc(100dvh - 340px), 760px); > :deep(.control-panel) { height: 100%; } > :deep(.viewport) { min-height: 0; } }
.lab-footnote { display: flex; align-items: center; gap: 6px; margin-top: 13px; color: var(--faint); font-size: 9px; line-height: 1.7; .icon { width: 12px; height: 12px; } }
.lab-error { display: flex; gap: 10px; align-items: center; padding: 12px; margin-bottom: 14px; border: 1px solid var(--warning); color: var(--warning); font-size: 11px; button { margin-left: auto; background: transparent; color: inherit; } }
@media(min-width:1600px) { .laboratory-main { grid-template-columns: minmax(0, 1fr) 350px; } }
@media(max-width:1100px) { .laboratory-main { grid-template-columns: minmax(0, 1fr) 310px; gap: 12px; } }
@media(max-width:800px) { .lab-page-actions { width: 100%; justify-content: space-between; }.laboratory-main { grid-template-columns: 1fr; height: auto; > :deep(.viewport) { height: 450px; } > :deep(.lab-control) { height: 640px; } > :deep(.control-panel) { height: auto; } }.lab-robot-bar { flex-wrap: wrap; gap: 9px; > span { order: 3; width: 100%; }.segmented button { padding: 8px; } } }
@media(max-width:550px) { .laboratory-main > :deep(.viewport) { height: 410px; }.lab-footnote { align-items: flex-start; font-size: 8px; }.lab-page-actions .segmented button,.lab-robot-bar .segmented button { min-height: 40px; } }
</style>
