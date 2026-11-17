import { describe, expect, it } from 'vitest'
import { SimulationAdapter } from './SimulationAdapter'
import { robots } from '@/config/robots'
import { joints } from '@/config/joints'
import { telemetryPoints } from '@/simulation/telemetry'
import { parseLocalCommand } from '@/simulation/commands'
import type { TelemetrySample } from '@/types/robot'

const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < seconds * 10; i++) adapter.tick(.1) }

describe('数字孪生遥测一致性', () => {
  it('AI执行成功保留100%终态但退出AI运行模式，清空历史后移除结果', () => {
    const adapter = new SimulationAdapter(), text = '挥手1秒，然后张开手掌1秒'
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'humanoid' } })
    adapter.send({ type: 'assistant', robot: 'humanoid', text, provider: '本地规则', commands: parseLocalCommand(text, 'humanoid') })
    advance(adapter, 4)
    const state = adapter.snapshot()
    expect(state.assistant.history[0]!.status).toBe('succeeded')
    expect(state.robots.humanoid.action).toBe('openHand')
    expect(state.telemetry.humanoid.task?.progress).toBe(100)
    expect(state.telemetry.humanoid.task?.status).toBe('执行成功')
    expect(state.telemetry.humanoid.mode).toBe('环境感知')
    adapter.send({ type: 'clearAssistant' })
    expect(adapter.snapshot().telemetry.humanoid.task).toBeNull()
  })

  it('电流/功率/电压及按容量积分的电量守恒，续航使用当前功耗', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'quadruped', action: 'run' })
    const before = adapter.snapshot().robots.quadruped.battery
    let energy = 0
    for (let i = 0; i < 300; i++) { adapter.tick(.1); energy += adapter.snapshot().robots.quadruped.power * .1 }
    const { robots: state, telemetry } = adapter.snapshot(), r = state.quadruped, t = telemetry.quadruped
    expect(t.voltage * t.current).toBeCloseTo(r.power, 8)
    expect(before - r.battery).toBeCloseTo(energy / (robots.quadruped.batteryWh * 3600) * 100, 8)
    expect(t.remainingMinutes).toBeCloseTo(robots.quadruped.batteryWh * r.battery / 100 / r.power * 60, 8)
    expect(r.battery).toBeGreaterThan(97)
  })

  it('关节滑块实际过渡产生角速度和负载，稳定后回落且不伪造位移', () => {
    const adapter = new SimulationAdapter(), joint = joints.humanoid.find(j => j.id === 'right.shoulder.pitch')!
    const index = joints.humanoid.indexOf(joint)
    adapter.send({ type: 'joint', robot: 'humanoid', joint: joint.id, value: joint.max })
    advance(adapter, .4)
    const moving = adapter.snapshot()
    expect(moving.telemetry.humanoid.mode).toBe('关节控制')
    expect(moving.robots.humanoid.jointVelocities[index]).toBeGreaterThan(0)
    expect(moving.telemetry.humanoid.jointLoads[index]).toBeGreaterThan(5)
    expect(moving.robots.humanoid.travelSpeed).toBe(0)
    advance(adapter, 5)
    expect(adapter.snapshot().robots.humanoid.jointVelocities.every(v => v === 0)).toBe(true)
    expect(adapter.snapshot().robots.humanoid.power).toBeLessThan(moving.robots.humanoid.power)
  })

  it('原地步态与实际路线位移速度分开，后退方向反向', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'quadruped', action: 'backward' }); advance(adapter, 2)
    expect(adapter.snapshot().robots.quadruped.speed).toBeGreaterThan(.9)
    expect(adapter.snapshot().robots.quadruped.travelSpeed).toBe(0)
    expect(adapter.snapshot().telemetry.quadruped.direction).toBe(180)
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'quadruped' } })
    adapter.send({ type: 'perception', command: { type: 'route', action: 'start' } }); advance(adapter, 2)
    expect(adapter.snapshot().robots.quadruped.travelSpeed).toBeGreaterThan(0)
  })

  it('感知传感器状态跟随进入/扫描开关/历史/退出且两机隔离', () => {
    const adapter = new SimulationAdapter()
    expect(adapter.snapshot().telemetry.quadruped.sensors.lidar).toBe('standby')
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'quadruped' } }); advance(adapter, 3)
    let state = adapter.snapshot()
    expect(state.telemetry.quadruped.sensors.camera).toBe('active')
    expect(state.telemetry.quadruped.sensors.lidar).toBe('active')
    expect(state.telemetry.humanoid.sensors.camera).toBe('standby')
    expect(state.telemetry.quadruped.targets).toBe(state.perception.detections.filter(d => d.status === 'detected').length)
    adapter.send({ type: 'perception', command: { type: 'settings', values: { scanning: false } } })
    expect(adapter.snapshot().telemetry.quadruped.sensors.lidar).toBe('standby')
    adapter.send({ type: 'perception', command: { type: 'history', id: state.perception.history[0]!.id } })
    expect(adapter.snapshot().telemetry.quadruped.sensors.lidar).toBe('history')
    adapter.send({ type: 'perception', command: { type: 'leave' } })
    expect(adapter.snapshot().telemetry.quadruped.targets).toBe(0)
  })

  it('任务暂停保持能源冻结但清除运动负载，恢复后随实际动作变化', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'mission', command: { type: 'select', id: 'inspection' } })
    adapter.send({ type: 'mission', command: { type: 'start' } }); advance(adapter, 2)
    const running = adapter.snapshot()
    expect(running.telemetry.quadruped.task?.progress).toBeCloseTo(running.mission.progress * 100)
    adapter.send({ type: 'mission', command: { type: 'pause' } })
    const paused = adapter.snapshot()
    expect(paused.robots.quadruped.power).toBeLessThan(running.robots.quadruped.power)
    expect(paused.telemetry.quadruped.status).toBe('已暂停')
    advance(adapter, 5)
    expect(adapter.snapshot().robots.quadruped).toEqual(paused.robots.quadruped)
    adapter.send({ type: 'mission', command: { type: 'resume' } }); advance(adapter, 2)
    expect(adapter.snapshot().mission.progress).toBeGreaterThan(paused.mission.progress)
  })

  it('任务扫描的目标数来源于任务检测，同机重置生成新的曲线批次', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'mission', command: { type: 'select', id: 'inspection' } })
    adapter.send({ type: 'mission', command: { type: 'start' } })
    for (let i = 0; i < 400 && !adapter.snapshot().mission.scanOrigin; i++) adapter.tick(.1)
    const state = adapter.snapshot()
    expect(state.mission.scanOrigin).not.toBeNull()
    expect(state.telemetry.quadruped.sensors.lidar).toBe('active')
    expect(state.telemetry.quadruped.targets).toBe(state.mission.detections.filter(d => d.status === 'detected').length)
    adapter.send({ type: 'mission', command: { type: 'reset' } })
    expect(adapter.snapshot().telemetry.quadruped.task?.key).not.toBe(state.telemetry.quadruped.task?.key)
    expect(adapter.snapshot().telemetry.quadruped.task?.progress).toBe(0)
  })

  it('全局暂停冻结读数，急停立即关闭输出并显示传感器停止，解除恢复', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'humanoid', action: 'wave' }); advance(adapter, 2)
    adapter.send({ type: 'pause', value: true }); const paused = adapter.snapshot(); advance(adapter, 4)
    expect(adapter.snapshot()).toEqual(paused)
    expect(paused.telemetry.humanoid.sensors.imu).toBe('paused')
    adapter.send({ type: 'emergency', robot: 'humanoid' }); const state = adapter.snapshot()
    expect(state.telemetry.humanoid.current).toBe(0)
    expect(state.telemetry.humanoid.remainingMinutes).toBeNull()
    expect(state.telemetry.humanoid.sensors.imu).toBe('stopped')
    expect(state.telemetry.humanoid.jointLoads.every(value => value === 0)).toBe(true)
    adapter.send({ type: 'release', robot: 'humanoid' }); adapter.send({ type: 'pause', value: false }); advance(adapter, 1)
    expect(adapter.snapshot().telemetry.humanoid.sensors.imu).toBe('active')
  })

  it('快照隔离新增关节速率和遥测数组', () => {
    const adapter = new SimulationAdapter(), state = adapter.snapshot()
    state.robots.quadruped.jointVelocities[0] = 99
    state.telemetry.quadruped.jointLoads[0] = 99
    expect(adapter.snapshot().robots.quadruped.jointVelocities[0]).toBe(0)
    expect(adapter.snapshot().telemetry.quadruped.jointLoads[0]).not.toBe(99)
  })

  it('趋势允许负角度，无任务为空值，不连接不同任务批次', () => {
    const base: TelemetrySample = { time: 1, speed: 0, temperature: 36, power: 24, cpu: 12, battery: 98, voltage: 50, current: .48, travelSpeed: 0, memory: 21, latency: 3, joints: [-Math.PI / 2], taskKey: 'mission:1', taskProgress: 90 }
    const samples = [base, { ...base, time: 1.5, taskKey: 'mission:2', taskProgress: 0 }, { ...base, time: 2, taskKey: null, taskProgress: null }]
    expect(telemetryPoints(samples, 'joint')[0]![1]).toBe(-90)
    expect(telemetryPoints(samples, 'taskProgress')).toEqual([[1, 90], [1.5, null], [1.5, 0], [2, null], [2, null]])
  })
})
