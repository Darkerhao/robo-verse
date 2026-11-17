<script setup lang="ts">
import { computed } from 'vue'
import { robots, actions } from '@/config/robots'
import { missions } from '@/config/missions'
import { useSimulationStore } from '@/stores/simulation'
import RobotViewport from '@/components/RobotViewport.vue'
import type { RobotAction, RobotId } from '@/types/robot'
const sim = useSimulationStore()
const ids: RobotId[] = ['quadruped', 'humanoid']
const locked = computed(() => sim.snapshot.paused || ids.some(id => sim.snapshot.robots[id].emergency))
const rows = [
  { label: '机械结构', value: (id: RobotId) => robots[id].structure },
  { label: '运动方式', value: (id: RobotId) => robots[id].locomotion },
  { label: '可独立驱动自由度', value: (id: RobotId) => `${robots[id].drivenAxes} 轴` },
  { label: '仿真速度上限', value: (id: RobotId) => `${robots[id].maxSpeed.toFixed(1)} m/s` },
  { label: '演示质量 / 负载设定', value: (id: RobotId) => `${robots[id].mass} kg / ${robots[id].payloadKg} kg（非力学验证）` },
  { label: '感知结构', value: (id: RobotId) => robots[id].sensors },
  { label: '电池设定', value: (id: RobotId) => `${robots[id].batteryWh} Wh / ${robots[id].nominalVoltage} V` },
  { label: '参考续航', value: (id: RobotId) => `${(robots[id].batteryWh / robots[id].referencePower).toFixed(1)} h @ ${robots[id].referencePower} W（演示工况）` },
  { label: '应用场景', value: (id: RobotId) => robots[id].applications },
  { label: '已实现任务', value: (id: RobotId) => Object.values(missions).filter(m => m.robot === id).map(m => m.name).join(' / ') },
]
function both(action: RobotAction) { for (const robot of ids) sim.send({ type: 'action', robot, action }) }
function action(id: RobotId, event: Event) { const target = event.target; if (!(target instanceof HTMLSelectElement)) return; const value = robots[id].actions.find(value => value === target.value); if (value) sim.send({ type: 'action', robot: id, action: value }) }
function speed(id: RobotId, event: Event) { if (event.target instanceof HTMLInputElement) sim.send({ type: 'speed', robot: id, value: Number(event.target.value) }) }
</script>

<template>
  <div class="page-heading"><div><span class="eyebrow">PERFORMANCE / TWO FORMS, ONE ENGINE</span><h1>两种形态，同场探索<span class="accent">.</span></h1><p>比较机械结构、协调动作与应用能力，理解不同形态的取舍。</p></div><span class="badge">SIMULATION · 演示参数</span></div>
  <div v-if="sim.error" class="comparison-error" role="alert">{{ sim.error }}<button class="btn" @click="sim.error = ''">关闭提示</button></div>
  <div class="compare-stage"><RobotViewport comparison /></div>
  <div class="compare-toolbar"><span>同场动作对比</span><button class="btn" :disabled="locked" @click="both('walk')">双机行走</button><button class="btn" :disabled="locked" @click="both('stand')">双机站立</button><button class="btn" @click="sim.send({ type: 'pause', value: !sim.snapshot.paused })">{{ sim.snapshot.paused ? '继续仿真' : '暂停仿真' }}</button><RouterLink to="/telemetry">完整监控与趋势 →</RouterLink></div>
  <div class="compare-controls"><section v-for="id in ids" :key="id" class="robot-controls panel" :data-compare-robot="id"><header><h2>{{ robots[id].name }} <small>{{ robots[id].category }}</small></h2><span>{{ sim.statusFor(id) }}</span></header><div class="live-metrics"><span>步态 <b class="mono">{{ sim.snapshot.robots[id].speed.toFixed(2) }} m/s</b></span><span>功率 <b class="mono">{{ sim.snapshot.robots[id].power.toFixed(1) }} W</b></span><span>电量 <b class="mono">{{ sim.snapshot.robots[id].battery.toFixed(1) }}%</b></span></div><div class="individual-controls"><label>动作<select :aria-label="`${robots[id].name} 对比动作`" :value="sim.snapshot.robots[id].controlMode === 'motion' ? sim.snapshot.robots[id].action : ''" :disabled="sim.snapshot.paused || sim.snapshot.robots[id].emergency" @change="action(id, $event)"><option v-if="sim.snapshot.robots[id].controlMode !== 'motion'" value="" disabled>{{ sim.snapshot.telemetry[id].action }}</option><option v-for="item in robots[id].actions" :key="item" :value="item">{{ actions[item].label }}</option></select></label><label class="speed-control">速度<input :aria-label="`${robots[id].name} 对比速度`" type="range" min="0" :max="robots[id].maxSpeed" step="0.1" :value="sim.snapshot.robots[id].targetSpeed" :disabled="sim.snapshot.paused || sim.snapshot.robots[id].emergency" @input="speed(id, $event)" /><output class="mono">{{ sim.snapshot.robots[id].targetSpeed.toFixed(1) }}</output></label><button class="btn btn-danger" @click="sim.send({ type: sim.snapshot.robots[id].emergency ? 'release' : 'emergency', robot: id })">{{ sim.snapshot.robots[id].emergency ? '解除急停' : '急停' }}</button></div></section></div>
  <section class="comparison panel"><table><caption>结构与能力横向对比 <span>统一演示配置 · 非真实产品规格</span></caption><thead><tr><th scope="col">对比维度</th><th v-for="id in ids" :key="id" scope="col">{{ robots[id].name }} · {{ robots[id].category }}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.label"><th scope="row">{{ row.label }}</th><td v-for="id in ids" :key="id">{{ row.value(id) }}</td></tr></tbody></table></section>
  <p class="comparison-note">两台机器人使用同一仿真时钟，独立控制各自关节。展示区域为原地动作，不代表真实运动性能；质量、负载、电池与参考续航是原创概念机的演示设定，未经过硬件或动力学验证。场景右下角 FPS / calls 为当前浏览器实际渲染统计。</p>
</template>

<style scoped lang="less">
h1 { margin-top: 8px; }.eyebrow { font-size: 8px; }.compare-stage { position: relative; height: clamp(380px,50vh,650px); :deep(.viewport) { min-height: 0; } }.compare-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 16px 0; font-size: 11px; > span { color: var(--muted); margin-right: 8px; } > a { margin-left: auto; color: var(--cyan); } }
.compare-controls { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }.robot-controls { padding: 18px; min-width: 0; header { display: flex; justify-content: space-between; gap: 10px; align-items: center; h2 small { font-size: 10px; font-weight: 400; color: var(--muted); margin-left: 8px; } > span { font-size: 10px; color: var(--success); } } }.live-metrics { display: flex; justify-content: space-between; gap: 8px; padding: 17px 0; font-size: 10px; color: var(--muted); b { font-weight: 400; color: var(--text); margin-left: 7px; } }.individual-controls { display: flex; gap: 12px; align-items: center; label { font-size: 10px; color: var(--muted); display: flex; gap: 7px; align-items: center; } select { min-width: 0; max-width: 140px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-raised); color: var(--text); padding: 8px; }.speed-control { flex: 1; input { min-width: 40px; flex: 1; width: 80px; } } }
.comparison { margin-top: 22px; overflow: hidden; table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 12px; line-height: 1.8; text-align: left; } caption { text-align: left; padding: 20px; color: var(--text); span { color: var(--faint); font-size: 10px; margin-left: 15px; } } th,td { padding: 13px 20px; border-top: 1px solid var(--border); overflow-wrap: anywhere; } th { font-weight: 400; color: var(--muted); } th:first-child { width: 23%; } thead { background: var(--surface-raised); } }.comparison-note { font-size: 10px; color: var(--faint); line-height: 1.8; margin-top: 18px; }.comparison-error { display: flex; justify-content: space-between; align-items: center; color: var(--warning); margin-bottom: 15px; }
@media(max-width:1100px) { .individual-controls { flex-wrap: wrap; }.individual-controls .speed-control { min-width: 150px; } }
@media(max-width:700px) { .compare-controls { grid-template-columns: 1fr; }.compare-toolbar { gap: 7px; > span { width: 100%; } > a { width: 100%; margin-top: 5px; } }.comparison { th,td { padding: 12px 9px; font-size: 10px; } caption { padding: 15px; span { display: block; margin: 5px 0 0; } } th:first-child { width: 24%; } } }
</style>
