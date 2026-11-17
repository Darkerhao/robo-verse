import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { robots } from '@/config/robots'
import { joints } from '@/config/joints'
import type { Quality, RobotCommand, RobotId, RuntimeEvent, TelemetrySample } from '@/types/robot'

export const useSimulationStore = defineStore('simulation', () => {
  const adapter = new SimulationAdapter()
  const snapshot = shallowRef(adapter.snapshot())
  const selectedId = ref<RobotId>('quadruped')
  const quality = ref<Quality>('high')
  const grid = ref(true)
  const connected = ref(false)
  const error = ref('')
  const events = ref<RuntimeEvent[]>([])
  const histories = ref<Record<RobotId, TelemetrySample[]>>({ quadruped: [], humanoid: [] })
  let unsubscribe: (() => void) | undefined
  let lastSampleBucket = -1
  let sequence = 0
  const current = computed(() => snapshot.value.robots[selectedId.value])
  const telemetry = computed(() => snapshot.value.telemetry[selectedId.value])
  const definition = computed(() => robots[selectedId.value])
  const history = computed(() => histories.value[selectedId.value])
  function statusFor(id: RobotId) {
    return connected.value ? snapshot.value.telemetry[id].status : '仿真离线'
  }
  const status = computed(() => statusFor(selectedId.value))
  const uptime = computed(() => { const t = Math.floor(snapshot.value.time); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })

  function log(message: string, level: RuntimeEvent['level'] = 'info', robot = definition.value.name) {
    events.value.unshift({ id: ++sequence, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), level, robot, message })
    if (events.value.length > 100) events.value.length = 100
  }
  async function start() {
    if (unsubscribe) return
    unsubscribe = adapter.subscribe(state => {
      snapshot.value = state
      const sampleBucket = Math.floor(state.time * 2)
      if (sampleBucket > lastSampleBucket) {
        for (const id of Object.keys(robots) as RobotId[]) {
          const r = state.robots[id]
          const t = state.telemetry[id]
          const samples = histories.value[id]
          samples.push({ time: state.time, speed: r.speed, temperature: r.temperature, power: r.power, cpu: r.cpu, battery: r.battery, voltage: t.voltage, current: t.current, travelSpeed: r.travelSpeed, memory: t.memory, latency: t.latency, joints: [...r.joints], taskProgress: t.task?.progress ?? null, taskKey: t.task?.key ?? null })
          if (samples.length > 120) samples.shift()
        }
        lastSampleBucket = sampleBucket
      }
    })
    try { await adapter.connect(); connected.value = true; log('仿真会话已启动 · 本地模拟设备就绪', 'info', 'SYSTEM') }
    catch (cause) { error.value = String(cause); unsubscribe(); unsubscribe = undefined }
  }
  function stop() { unsubscribe?.(); unsubscribe = undefined; adapter.disconnect(); connected.value = false }
  onScopeDispose(stop)

  function send(command: RobotCommand, message?: string) {
    try {
      adapter.send(command)
      if (command.type === 'reset') { histories.value = { quadruped: [], humanoid: [] }; lastSampleBucket = -1 }
      error.value = ''
      if (message) log(message, command.type === 'emergency' ? 'warning' : 'info')
      return true
    } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); log(error.value, 'warning'); return false }
  }
  function select(id: RobotId) { selectedId.value = id; error.value = '' }
  function exportTelemetry() {
    const lines = [
      ['mode', 'robot', 'time_s', 'gait_speed_m_s', 'temperature_c', 'power_w', 'cpu_percent', 'battery_percent', 'voltage_v', 'current_a', 'travel_speed_m_s', 'memory_percent', 'latency_ms', 'task_run', 'task_progress_percent', ...joints[selectedId.value].map(joint => `${joint.id}_deg`)].join(','),
      ...history.value.map(s => ['SIMULATION', definition.value.serial, s.time.toFixed(1), s.speed.toFixed(3), s.temperature.toFixed(2), s.power.toFixed(2), s.cpu.toFixed(2), s.battery.toFixed(4), s.voltage.toFixed(3), s.current.toFixed(3), s.travelSpeed.toFixed(3), s.memory.toFixed(2), s.latency.toFixed(2), s.taskKey ?? '', s.taskProgress?.toFixed(2) ?? '', ...s.joints.map(angle => (angle * 180 / Math.PI).toFixed(2))].join(',')),
    ]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `NEXT-ROBOTICS-${definition.value.serial}-telemetry.csv`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    log(`已导出 ${history.value.length} 条仿真遥测数据`)
  }
  return { snapshot, selectedId, quality, grid, connected, error, events, histories, current, telemetry, definition, history, status, statusFor, uptime, start, stop, send, select, log, exportTelemetry }
})
