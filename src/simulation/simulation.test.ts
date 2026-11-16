import { describe, expect, it, vi, afterEach } from 'vitest'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { motionPose, neutralPose, solveLeg, worldFoot } from './kinematics'
import { rigs } from '@/config/joints'

describe('统一仿真与控制语义', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('初始快照明确属于仿真，两台设备各自独立', () => {
    const adapter = new SimulationAdapter()
    expect(adapter.mode).toBe('simulation')
    adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' })
    for (let i = 0; i < 30; i++) adapter.tick(.1)
    const state = adapter.snapshot()
    expect(state.robots.quadruped.speed).toBeCloseTo(1)
    expect(state.robots.quadruped.power).toBeGreaterThan(state.robots.humanoid.power)
    expect(state.robots.humanoid.action).toBe('stand')
    expect(state.robots.humanoid.speed).toBe(0)
  })
  it('暂停冻结时间、遥测和关节，拒绝新的运动指令', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'quadruped', action: 'trot' })
    adapter.tick(.1)
    adapter.send({ type: 'pause', value: true })
    const frozen = adapter.snapshot()
    for (let i = 0; i < 20; i++) adapter.tick(.1)
    expect(adapter.snapshot()).toEqual(frozen)
    expect(() => adapter.send({ type: 'turn', robot: 'quadruped', degrees: 15 })).toThrow('继续仿真')
    adapter.send({ type: 'pause', value: false }); adapter.tick(.1)
    expect(adapter.snapshot().time).toBeGreaterThan(frozen.time)
  })
  it('急停立即归零驱动输出并锁定姿态，重置不能绕过急停', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'humanoid', action: 'walk' }); adapter.tick(.1)
    adapter.send({ type: 'emergency', robot: 'humanoid' })
    const frozen = adapter.snapshot().robots.humanoid
    expect(frozen.speed).toBe(0)
    expect(frozen.power).toBe(0)
    adapter.tick(.1)
    expect(adapter.snapshot().robots.humanoid).toEqual(frozen)
    expect(() => adapter.send({ type: 'action', robot: 'humanoid', action: 'wave' })).toThrow('解除急停')
    adapter.send({ type: 'reset' })
    expect(adapter.snapshot().robots.humanoid.emergency).toBe(true)
    adapter.send({ type: 'release', robot: 'humanoid' })
    expect(adapter.snapshot().robots.humanoid.action).toBe('stand')
    expect(adapter.snapshot().robots.humanoid.emergency).toBe(false)
  })
  it('拒绝不支持动作和无效数值，限制速度并规范朝向', () => {
    const adapter = new SimulationAdapter()
    expect(() => adapter.send({ type: 'action', robot: 'humanoid', action: 'trot' })).toThrow('不支持')
    expect(() => adapter.send({ type: 'speed', robot: 'quadruped', value: NaN })).toThrow('有效数值')
    adapter.send({ type: 'speed', robot: 'humanoid', value: 99 })
    expect(adapter.snapshot().robots.humanoid.targetSpeed).toBe(1.8)
    adapter.send({ type: 'turn', robot: 'quadruped', degrees: -15 })
    expect(adapter.snapshot().robots.quadruped.targetHeading).toBe(345)
    expect(adapter.snapshot().robots.quadruped.heading).toBe(0)
    for (let i = 0; i < 20; i++) adapter.tick(.1)
    expect(adapter.snapshot().robots.quadruped.heading).toBe(345)
  })
  it('暂停中解除急停立即提供完整站姿，不遗留旧动作关节', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'humanoid', action: 'crouch' })
    for (let i = 0; i < 20; i++) adapter.tick(.1)
    adapter.send({ type: 'pause', value: true })
    adapter.send({ type: 'emergency', robot: 'humanoid' })
    adapter.send({ type: 'release', robot: 'humanoid' })
    const state = adapter.snapshot()
    expect(state.paused).toBe(true)
    expect(state.robots.humanoid.position).toEqual(neutralPose('humanoid').position)
    expect(state.robots.humanoid.joints).toEqual(neutralPose('humanoid').joints)
  })
  it('快照隔离外部修改，订阅解除后不再回调', () => {
    const adapter = new SimulationAdapter(), listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)
    const snapshot = adapter.snapshot(); snapshot.robots.quadruped.joints[0] = 999
    expect(adapter.snapshot().robots.quadruped.joints[0]).not.toBe(999)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe(); adapter.tick(.1)
    expect(listener).toHaveBeenCalledTimes(1)
  })
  it('重复启动不创建额外定时器，断开后停止更新', async () => {
    vi.useFakeTimers()
    const adapter = new SimulationAdapter()
    await adapter.connect(); await adapter.connect()
    vi.advanceTimersByTime(1000)
    expect(adapter.snapshot().time).toBeCloseTo(1)
    adapter.disconnect(); vi.advanceTimersByTime(1000)
    expect(adapter.snapshot().time).toBeCloseTo(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('后台页面不推进仿真，恢复可见后继续且不补算后台时间', async () => {
    vi.useFakeTimers()
    const visibility = { hidden: true }
    vi.stubGlobal('document', visibility)
    const adapter = new SimulationAdapter()
    await adapter.connect()
    vi.advanceTimersByTime(5000)
    expect(adapter.snapshot().time).toBe(0)
    visibility.hidden = false
    vi.advanceTimersByTime(1000)
    expect(adapter.snapshot().time).toBeCloseTo(1)
    adapter.disconnect()
  })
})

describe('机械运动学', () => {
  it('逆运动学结果通过正运动学回算到指定足端', () => {
    for (const [x, depth] of [[0, .65], [.15, .59], [-.15, .59], [0, .43]]) {
      const [hip, knee] = solveLeg(x!, depth!, .37, .39)
      const actualX = Math.sin(hip) * .37 + Math.sin(hip + knee) * .39
      const actualDepth = Math.cos(hip) * .37 + Math.cos(hip + knee) * .39
      expect(actualX).toBeCloseTo(x!, 6)
      expect(actualDepth).toBeCloseTo(depth!, 6)
    }
  })
  it('小跑的对角腿成对同步，左右腿交替', () => {
    const state = new SimulationAdapter().snapshot().robots.quadruped
    const pose = motionPose({ ...state, action: 'trot', phase: 4, speed: 1 })
    const feet = rigs.quadruped.hips.map((_, index) => worldFoot('quadruped', pose, index))
    expect(feet[0]![1]).toBeCloseTo(feet[3]![1], 6)
    expect(feet[1]![1]).toBeCloseTo(feet[2]![1], 6)
    expect(feet[0]![1]).not.toBeCloseTo(feet[1]![1], 4)
  })
  it('零速下步态停止；完整步态周期所有关节有限且脚掌平行地面', () => {
    const base = new SimulationAdapter().snapshot().robots
    expect(motionPose({ ...base.quadruped, action: 'walk', phase: 0, speed: 0 })).toEqual(motionPose({ ...base.quadruped, action: 'walk', phase: 10, speed: 0 }))
    for (const id of ['quadruped', 'humanoid'] as const) for (let phase = 0; phase < Math.PI * 2; phase += .1) {
      const pose = motionPose({ ...base[id], action: 'walk', phase, speed: 1.8 })
      expect(pose.joints.every(Number.isFinite)).toBe(true)
      for (let i = 0; i < rigs[id].hips.length * 3; i += 3) expect(pose.joints[i]! + pose.joints[i + 1]! + pose.joints[i + 2]! + pose.pitch).toBeCloseTo(0)
    }
  })
})
