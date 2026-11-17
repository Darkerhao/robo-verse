<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import TelemetryChart from '@/components/TelemetryChart.vue'
import RobotHud from '@/components/RobotHud.vue'
import AppIcon from '@/components/AppIcon.vue'
import type { TelemetryMetric } from '@/types/robot'
import { joints } from '@/config/joints'
const sim = useSimulationStore()
const jointIndex = ref(0)
watch(() => sim.selectedId, () => { jointIndex.value = 0 })
const selectedJoint = computed(() => joints[sim.selectedId][jointIndex.value]!)
const metrics: { key: TelemetryMetric; title: string; unit: string; color: string }[] = [
  { key: 'speed', title: '步态速度', unit: 'm/s', color: '#43e5ff' },
  { key: 'battery', title: '电池电量', unit: '%', color: '#39f5b5' },
  { key: 'temperature', title: '电机温度', unit: '°C', color: '#ffba67' },
  { key: 'joint', title: '关节角度', unit: '°', color: '#a69bd7' },
  { key: 'cpu', title: 'CPU 使用率 · 模拟', unit: '%', color: '#816cff' },
  { key: 'taskProgress', title: '任务执行进度', unit: '%', color: '#39f5b5' },
  { key: 'power', title: '系统功率', unit: 'W', color: '#85bbc8' },
]
function value(key: TelemetryMetric) {
  if (key === 'joint') return (sim.current.joints[jointIndex.value]! * 180 / Math.PI).toFixed(1)
  if (key === 'taskProgress') return sim.telemetry.task?.progress.toFixed(1) ?? '—'
  return sim.current[key].toFixed(2)
}
</script>

<template>
  <div class="page-heading"><div><span class="eyebrow">DIGITAL TWIN / LIVE TELEMETRY</span><h1>数字孪生监控<span class="accent">.</span></h1><p>同一仿真状态，贯穿动作、感知与任务。最近 60 秒 · 每秒 2 次采样。</p></div><div class="page-actions"><select v-model="sim.selectedId" class="robot-select" aria-label="选择遥测机器人"><option value="quadruped">RV K1 · 机器狗</option><option value="humanoid">RV H1 · 人形机器人</option></select><button class="btn" :disabled="!sim.history.length" @click="sim.exportTelemetry"><AppIcon name="download" />导出 CSV</button><button class="btn" @click="sim.send({ type: 'pause', value: !sim.snapshot.paused })">{{ sim.snapshot.paused ? '继续仿真' : '暂停仿真' }}</button></div></div>
  <div class="telemetry-status"><span class="badge">SIMULATION</span><span>{{ !sim.connected ? '仿真离线' : sim.snapshot.paused ? '采样已暂停 · 保留最后读数' : '实时采样' }}</span><span>{{ sim.history.length }} 条采样</span><RouterLink :to="`/${sim.selectedId}`">进入机器人控制 →</RouterLink></div>
  <div class="monitor-layout"><RobotHud /><div class="charts-grid"><article v-for="metric in metrics" :key="metric.key" class="panel" :data-metric="metric.key"><header><h2>{{ metric.title }}</h2><span class="mono" :style="{ color: metric.color }">{{ value(metric.key) }}<small>{{ metric.unit }}</small></span></header>
    <label v-if="metric.key === 'joint'" class="chart-context">选择关节<select v-model.number="jointIndex" aria-label="趋势关节"><option v-for="(joint, index) in joints[sim.selectedId]" :key="joint.id" :value="index">{{ joint.name }} · {{ joint.id }}</option></select></label>
    <p v-else-if="metric.key === 'taskProgress'" class="chart-context">{{ sim.telemetry.task ? `${sim.telemetry.task.name} · ${sim.telemetry.task.status}` : '当前无任务 · 历史执行曲线保留' }}</p>
    <p v-else class="chart-context">{{ metric.key === 'speed' ? '原地演示的步态速度不等于场景位移速度' : metric.key === 'battery' ? '按配置电池容量与系统功耗积分' : metric.key === 'temperature' ? '随运动负载升温，待机逐渐回落' : metric.key === 'cpu' ? '机器人控制器演示负载，不是浏览器 CPU' : '关节运动、步态与感知共同决定' }}</p>
    <TelemetryChart :samples="sim.history" :metric="metric.key" :joint-index="jointIndex" :label="metric.key === 'joint' ? selectedJoint.name : metric.title" :color="metric.color" expanded />
  </article></div></div>
  <section class="panel joint-panel"><div class="panel-heading"><h2>全部关节状态</h2><span class="badge">{{ sim.definition.drivenAxes }} 轴 · SIMULATION</span></div><div class="joint-grid"><div v-for="(angle, index) in sim.current.joints" :key="joints[sim.selectedId][index]!.id" :data-joint-id="joints[sim.selectedId][index]!.id"><span>{{ joints[sim.selectedId][index]!.name }}<small class="mono">{{ joints[sim.selectedId][index]!.id }} / {{ joints[sim.selectedId][index]!.axis.toUpperCase() }}</small></span><span class="joint-reading"><strong class="mono">{{ (angle * 180 / Math.PI).toFixed(1) }}°</strong><small>负载 {{ sim.telemetry.jointLoads[index]!.toFixed(0) }}% · {{ (sim.current.jointVelocities[index]! * 180 / Math.PI).toFixed(0) }}°/s</small></span></div></div></section>
</template>

<style scoped lang="less">
h1 { margin-top: 7px; }.eyebrow { font-size: 8px; }.robot-select,.chart-context select { border: 1px solid var(--border); border-radius: 7px; color: var(--text); background: var(--surface); padding: 9px 11px; font-size: 11px; min-width: 0; }.telemetry-status { display: flex; align-items: center; gap: 18px; margin: 20px 0; font-size: 10px; color: var(--muted); > a { margin-left: auto; color: var(--cyan); } }
.monitor-layout { display: grid; grid-template-columns: 305px minmax(0,1fr); gap: 20px; align-items: start; }.charts-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; article { padding: 8px; min-width: 0; } header { padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; h2 { font-size: 12px; } > span { font-size: 22px; small { font-size: 10px; color: var(--muted); margin-left: 5px; } } } }.chart-context { margin: 0 12px; height: 32px; font-size: 9px; color: var(--muted); display: flex; align-items: center; gap: 8px; line-height: 1.6; select { padding: 5px; flex: 1; } }
.joint-panel { margin-top: 22px; }.joint-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 0 20px 12px; gap: 0 24px; > div { padding: 15px 0; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 11px; small { display: block; font-size: 8px; color: var(--faint); margin-top: 6px; } strong { font-size: 16px; font-weight: 400; } }.joint-reading { text-align: right; } }
@media(min-width:1700px) { .charts-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
@media(max-width:1100px) { .monitor-layout { grid-template-columns: 270px minmax(0,1fr); gap: 12px; }.charts-grid { grid-template-columns: minmax(0,1fr); }.page-actions { flex-wrap: wrap; }.joint-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media(max-width:700px) { .monitor-layout { grid-template-columns: minmax(0,1fr); }.telemetry-status { flex-wrap: wrap; gap: 10px; }.joint-grid { grid-template-columns: 1fr; }.page-actions { gap: 6px; }.page-actions .btn { padding-inline: 10px; } }
</style>
