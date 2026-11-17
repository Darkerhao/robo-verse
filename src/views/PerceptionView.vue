<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { perceptionModes } from '@/config/perception'
import RobotViewport from '@/components/RobotViewport.vue'
import PerceptionControl from '@/components/PerceptionControl.vue'
import AppIcon from '@/components/AppIcon.vue'
const sim = useSimulationStore(), p = computed(() => sim.snapshot.perception)
const viewport = ref<InstanceType<typeof RobotViewport>>()
watch(() => sim.selectedId, robot => { sim.send({ type: 'perception', command: { type: 'enter', robot } }) }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => sim.send({ type: 'perception', command: { type: 'leave' } }))
const pointCount = computed(() => (p.value.history.find(frame => frame.id === p.value.historyId)?.points ?? p.value.points).length)
</script>

<template>
  <div class="perception" :data-perception-mode="p.mode" :data-position="JSON.stringify(p.position)" :data-route-status="p.route.status" :data-point-count="pointCount" :data-scan-angle="p.angle">
    <div class="page-heading"><div><div class="eyebrow">NEXT ROBOTICS / AI PERCEPTION</div><h1>AI 感知中心<span>.</span></h1><p>观察扫描、识别与避障如何随机器人运动变化。</p></div><button class="btn btn-ghost" @click="sim.send({ type: 'pause', value: !sim.snapshot.paused }, sim.snapshot.paused ? '继续感知与机器人仿真' : '暂停感知与机器人仿真')"><AppIcon :name="sim.snapshot.paused ? 'play' : 'pause'" />{{ sim.snapshot.paused ? '继续仿真' : '暂停仿真' }}</button></div>
    <div v-if="sim.error" class="perception-error" role="alert">{{ sim.error }}<button aria-label="关闭错误提示" @click="sim.error = ''"><AppIcon name="close" /></button></div>
    <div class="perception-bar"><div class="segmented" aria-label="感知机器人"><button data-perception-robot="quadruped" :class="{ active: sim.selectedId === 'quadruped' }" :aria-pressed="sim.selectedId === 'quadruped'" @click="sim.select('quadruped')"><AppIcon name="dog" />机器狗</button><button data-perception-robot="humanoid" :class="{ active: sim.selectedId === 'humanoid' }" :aria-pressed="sim.selectedId === 'humanoid'" @click="sim.select('humanoid')"><AppIcon name="person" />人形机器人</button></div><div class="view-actions"><button class="btn btn-ghost" @click="viewport?.focusRobot()"><AppIcon name="robot" />聚焦机器人</button><button class="btn btn-ghost" @click="viewport?.fit()"><AppIcon name="target" />全场总览</button></div></div>
    <div class="perception-modes segmented" aria-label="感知视图"><button v-for="mode in perceptionModes" :key="mode.id" :data-perception-view="mode.id" :class="{ active: p.mode === mode.id }" :aria-pressed="p.mode === mode.id" @click="sim.send({ type: 'perception', command: { type: 'settings', values: { mode: mode.id } } })"><AppIcon :name="mode.icon" />{{ mode.name }}</button></div>
    <div class="perception-main"><RobotViewport ref="viewport" perception /><PerceptionControl @focus="viewport?.focusObject()" /></div>
    <div class="perception-summary"><span><i class="dot" />{{ pointCount.toLocaleString() }} 个{{ p.historyId === null ? '实时' : '历史' }}点</span><span>{{ p.detections.filter(object => object.status === 'detected').length }} 个已识别目标</span><span class="mono">{{ sim.current.speed.toFixed(2) }} m / s · {{ sim.current.heading.toFixed(0) }}°</span><span>{{ p.route.message }}</span></div>
    <p class="perception-footnote"><AppIcon name="shield" />SIMULATION · 雷达、视觉识别与导航基于场景几何和运动学模拟，置信度为演示值；未连接真实传感器或视觉模型。</p>
  </div>
</template>

<style scoped lang="less">
.page-heading { margin-bottom: 15px; .eyebrow { font-size: 8px; letter-spacing: 1.6px; } h1 { margin-top: 7px; > span { color: var(--accent); } } p { font-size: 11px; } > .btn { font-size: 11px; } }
.perception-bar { display: flex; align-items: center; gap: 14px; justify-content: space-between; margin-bottom: 12px; .segmented button { display: flex; gap: 6px; align-items: center; font-size: 11px; .icon { width: 14px; } } }
.view-actions { display: flex; gap: 7px; .btn { font-size: 10px; min-height: 32px; padding: 7px 10px; .icon { width: 13px; } } }
.perception-modes { width: max-content; max-width: 100%; margin-bottom: 13px; button { display: flex; gap: 7px; align-items: center; font-size: 10px; .icon { width: 13px; height: 13px; } } }
.perception-main { display: grid; grid-template-columns: minmax(0,1fr) 334px; gap: 16px; height: clamp(360px, calc(100dvh - 390px), 780px); > :deep(.viewport) { min-height: 0; } }
.perception-summary { display: flex; flex-wrap: wrap; gap: 18px; color: var(--muted); font-size: 9px; margin-top: 13px; > span:first-child { color: var(--cyan); display: flex; align-items: center; gap: 6px; } > span:last-child { margin-left: auto; } }
.perception-footnote { display: flex; align-items: center; gap: 6px; margin-top: 12px; color: var(--faint); font-size: 9px; line-height: 1.7; .icon { width: 12px; height: 12px; } }
.perception-error { display: flex; align-items: center; gap: 10px; padding: 10px; color: var(--warning); border: 1px solid var(--warning); margin-bottom: 14px; font-size: 11px; button { margin-left: auto; background: transparent; color: inherit; } }
@media(min-width:1600px) { .perception-main { grid-template-columns: minmax(0,1fr) 350px; } }
@media(max-width:1100px) { .perception-main { grid-template-columns: minmax(0,1fr) 310px; gap: 12px; } }
@media(max-width:800px) { .perception-main { grid-template-columns: 1fr; height: auto; > :deep(.viewport) { height: 450px; } }.perception-summary { gap: 10px; > span:last-child { width: 100%; margin-left: 0; } }.perception-bar { flex-wrap: wrap; }.perception-modes { width: 100%; flex-wrap: wrap; button { flex: 1; justify-content: center; white-space: nowrap; min-height: 40px; padding: 7px; } }.view-actions .btn,.perception-bar .segmented button { min-height: 40px; } }
@media(max-width:550px) { .perception-main > :deep(.viewport) { height: 410px; }.perception-footnote { align-items: flex-start; font-size: 8px; }.view-actions { margin-left: auto; }.perception-modes button { flex: 1 1 27%; }.perception-summary { font-size: 8px; } }
</style>
