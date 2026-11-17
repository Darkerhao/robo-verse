import { describe, expect, it } from 'vitest'
import { SimulationAdapter } from './SimulationAdapter'
import { endEffectors } from '@/config/joints'
import { forwardEndEffector } from '@/simulation/kinematics'

const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < seconds * 10; i++) adapter.tick(.1) }
const mission = () => {
  const adapter = new SimulationAdapter()
  adapter.send({ type: 'action', robot: 'humanoid', action: 'wave' })
  adapter.send({ type: 'mission', command: { type: 'select', id: 'inspection' } })
  adapter.send({ type: 'mission', command: { type: 'start' } })
  advance(adapter, 2)
  return adapter
}

describe('阶段八评审：控制边界的遥测一致性', () => {
  it('切到关节、IK和回放时当前动作说明跟随控制模式', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'humanoid', action: 'walk' }); advance(adapter, 1)
    adapter.send({ type: 'joint', robot: 'humanoid', joint: 'right.shoulder.pitch', value: .5 }); advance(adapter, 1)
    expect(adapter.snapshot().telemetry.humanoid.action).toBe('关节控制')
    const hand = endEffectors.humanoid.find(e => e.id === 'right-hand')!
    const position = forwardEndEffector('humanoid', adapter.snapshot().robots.humanoid, hand)
    adapter.send({ type: 'ik', robot: 'humanoid', effector: hand.id, position })
    expect(adapter.snapshot().telemetry.humanoid.action).toBe('末端 IK')
    adapter.send({ type: 'record', robot: 'humanoid', value: true }); advance(adapter, 1)
    adapter.send({ type: 'record', robot: 'humanoid', value: false })
    adapter.send({ type: 'replay', robot: 'humanoid' })
    expect(adapter.snapshot().telemetry.humanoid.action).toBe('动作回放')
  })

  it.each(['stop', 'leave'] as const)('全局暂停中%s任务清除运动导数与动态负载，不改变另一机冻结读数', type => {
    const adapter = mission()
    adapter.send({ type: 'pause', value: true })
    const frozen = adapter.snapshot()
    expect(frozen.robots.quadruped.travelSpeed).toBeGreaterThan(.5)
    adapter.send({ type: 'mission', command: { type } })
    const stopped = adapter.snapshot()
    expect(stopped.robots.quadruped.travelSpeed).toBe(0)
    expect(stopped.robots.quadruped.jointVelocities.every(value => value === 0)).toBe(true)
    expect(stopped.robots.quadruped.power).toBeLessThan(frozen.robots.quadruped.power)
    expect(stopped.robots.quadruped.battery).toBe(frozen.robots.quadruped.battery)
    expect(stopped.robots.quadruped.joints).toEqual(frozen.robots.quadruped.joints)
    expect(stopped.robots.humanoid).toEqual(frozen.robots.humanoid)
    advance(adapter, 1)
    expect(adapter.snapshot()).toEqual(stopped)
  })

  it('路线暂停后立即全局暂停，不保留已停止的位移速度', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'quadruped' } })
    adapter.send({ type: 'perception', command: { type: 'route', action: 'start' } })
    advance(adapter, 2)
    expect(adapter.snapshot().robots.quadruped.travelSpeed).toBeGreaterThan(.5)
    adapter.send({ type: 'perception', command: { type: 'route', action: 'pause' } })
    adapter.send({ type: 'pause', value: true })
    expect(adapter.snapshot().robots.quadruped.travelSpeed).toBe(0)
  })

  it('全局暂停中重置感知路线清除运动导数，不积分能源', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'quadruped' } })
    adapter.send({ type: 'perception', command: { type: 'route', action: 'start' } })
    advance(adapter, 2)
    adapter.send({ type: 'pause', value: true })
    const before = adapter.snapshot()
    adapter.send({ type: 'perception', command: { type: 'route', action: 'reset' } })
    const reset = adapter.snapshot()
    expect(reset.robots.quadruped.travelSpeed).toBe(0)
    expect(reset.robots.quadruped.jointVelocities.every(value => value === 0)).toBe(true)
    expect(reset.robots.quadruped.power).toBeLessThan(before.robots.quadruped.power)
    expect(reset.robots.quadruped.battery).toBe(before.robots.quadruped.battery)
    expect(reset.robots.humanoid).toEqual(before.robots.humanoid)
  })
})
