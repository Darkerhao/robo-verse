<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { robots } from '@/config/robots'
import { sensorStatusLabels } from '@/simulation/telemetry'
import type { RobotId } from '@/types/robot'
const TelemetryChart = defineAsyncComponent(() => import('./TelemetryChart.vue'))
const props = defineProps<{ robot?: RobotId; floating?: boolean }>()
const sim = useSimulationStore()
const expanded = ref(!props.floating)
function toggle(event: Event) { if (event.target instanceof HTMLDetailsElement) expanded.value = event.target.open }
const id = computed(() => props.robot ?? sim.selectedId)
const state = computed(() => sim.snapshot.robots[id.value])
const data = computed(() => sim.snapshot.telemetry[id.value])
const spec = computed(() => robots[id.value])
const sensors = { camera: '摄像头', lidar: '激光雷达', imu: 'IMU', environment: '环境感知' } as const
</script>

<template>
  <details class="robot-hud" :class="{ floating }" :open="!floating" :data-hud-robot="id" @toggle="toggle">
    <summary :aria-label="`${spec.name} 数字孪生 HUD`"><span class="hud-title">{{ spec.name }} <b>SIMULATION</b></span><span class="hud-summary"><i class="dot" :class="{ warning: state.emergency }" />{{ sim.statusFor(id) }}<strong class="mono">{{ state.battery.toFixed(1) }}%</strong></span></summary>
    <div class="hud-body">
      <p class="hud-identity"><span>{{ sim.connected ? '本地仿真在线' : '仿真离线' }}</span><span class="mono">{{ spec.serial }}</span></p>
      <dl>
        <div><dt>运行模式</dt><dd>{{ data.mode }}</dd></div><div><dt>当前动作</dt><dd>{{ data.action }}</dd></div>
        <div><dt>仿真运行时间</dt><dd class="mono">{{ sim.uptime }}</dd></div>
        <div><dt>步态 / 位移速度</dt><dd class="mono">{{ state.speed.toFixed(2) }} / {{ state.travelSpeed.toFixed(2) }} m/s</dd></div>
        <div><dt>横滚 / 俯仰</dt><dd class="mono">{{ (state.roll * 180 / Math.PI).toFixed(1) }} / {{ (state.pitch * 180 / Math.PI).toFixed(1) }}°</dd></div>
        <div><dt>运动方向 · +X 为 0°</dt><dd class="mono">{{ data.direction.toFixed(1) }}°</dd></div>
        <div><dt>关节状态 / 最大负载</dt><dd>{{ state.emergency ? '锁定' : sim.snapshot.paused ? '冻结' : `${state.joints.length} 轴受限` }} / {{ data.jointLoad.toFixed(0) }}%</dd></div>
        <div><dt>姿态稳定度 · 估算</dt><dd class="mono">{{ data.stability.toFixed(0) }} / 100</dd></div>
      </dl>
      <dl>
        <div><dt>电池电量</dt><dd :class="{ warning: state.battery <= 20 }">{{ state.battery.toFixed(2) }}% · {{ state.battery > 20 ? '充足' : '低电量' }}</dd></div>
        <div><dt>电压 / 电流</dt><dd class="mono">{{ data.voltage.toFixed(1) }} V / {{ data.current.toFixed(2) }} A</dd></div>
        <div><dt>系统功率</dt><dd class="mono">{{ state.power.toFixed(1) }} W</dd></div>
        <div><dt>按当前功耗估算续航</dt><dd class="mono">{{ data.remainingMinutes === null ? '— 输出关闭' : `${data.remainingMinutes.toFixed(0)} min` }}</dd></div>
        <div><dt>CPU / 内存 · 模拟</dt><dd class="mono">{{ state.cpu.toFixed(1) }} / {{ data.memory.toFixed(1) }}%</dd></div>
        <div><dt>电机温度</dt><dd :class="{ warning: state.temperature >= 60 }" class="mono">{{ state.temperature.toFixed(1) }} °C</dd></div>
        <div><dt>通信延迟 · 模拟</dt><dd class="mono">{{ data.latency.toFixed(1) }} ms</dd></div>
      </dl>
      <dl class="sensor-list"><div v-for="(label, key) in sensors" :key="key"><dt>{{ label }}</dt><dd :data-sensor="key" :data-status="data.sensors[key]">{{ sensorStatusLabels[data.sensors[key]] }}</dd></div><div><dt>当前识别目标</dt><dd>{{ data.targets }} 个</dd></div></dl>
      <div v-if="data.task" class="hud-task"><span>{{ data.task.name }} · {{ data.task.status }}</span><strong class="mono">{{ data.task.progress.toFixed(0) }}%</strong><progress :value="data.task.progress" max="100" aria-label="HUD 任务进度" /></div>
      <TelemetryChart v-if="floating && expanded && data.task" :samples="sim.histories[id]" metric="taskProgress" label="任务执行进度" color="#39f5b5" />
      <p class="hud-note">{{ sim.snapshot.paused ? '仿真与采样已冻结。' : state.emergency ? '急停锁定，驱动输出关闭。' : '' }}能源、硬件与稳定度为演示估算，不代表物理测量。感知来自场景几何；历史与暂停状态保留最近结果。</p>
      <RouterLink v-if="floating" to="/telemetry" class="hud-link">打开完整监控与趋势 →</RouterLink>
    </div>
  </details>
</template>

<style scoped lang="less">
.robot-hud { background: #0b1220ee; border: 1px solid var(--border); border-radius: 9px; color: var(--text); min-width: 0; summary { cursor: pointer; list-style-position: inside; padding: 12px 14px; font-size: 11px; } }
.hud-title { font-weight: 600; b { font-size: 7px; font-weight: 400; color: var(--cyan); margin-left: 8px; letter-spacing: .7px; } }.hud-summary { display: flex; align-items: center; gap: 7px; margin-top: 9px; color: var(--muted); font-size: 10px; strong { margin-left: auto; color: var(--success); font-weight: 400; } .dot { color: var(--success); } }
.hud-body { padding: 0 14px 14px; }.hud-identity { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 9px; color: var(--muted); padding-bottom: 8px; } dl { margin: 0; padding: 9px 0; border-top: 1px solid var(--border); display: grid; gap: 8px; > div { display: flex; justify-content: space-between; gap: 10px; font-size: 10px; line-height: 1.5; } dt { color: var(--muted); } dd { margin: 0; text-align: right; } }.warning { color: var(--warning) !important; }.sensor-list dd[data-status=active] { color: var(--success); }.sensor-list dd[data-status=stopped] { color: var(--danger); }.hud-task { display: flex; flex-wrap: wrap; gap: 8px; font-size: 10px; padding-block: 10px; strong { margin-left: auto; } progress { width: 100%; height: 4px; accent-color: var(--cyan); } }.hud-note { color: var(--faint); font-size: 9px; line-height: 1.7; }.hud-link { display: block; color: var(--cyan); margin-top: 12px; font-size: 10px; }
.floating { position: absolute; top: 108px; right: 60px; width: 202px; z-index: 2; max-height: calc(100% - 226px); overflow-y: auto; backdrop-filter: blur(10px); summary { padding: 9px 11px; font-size: 10px; }.hud-summary { font-size: 9px; }.hud-body { padding-inline: 11px; } dl > div { font-size: 9px; } }
@media(max-width:550px) { .floating { right: auto; left: 16px; width: 124px; top: 54px; max-height: 92px; summary { padding: 7px 9px; }.hud-title b { font-size: 6px; }.hud-summary { gap: 5px; } } }
</style>
