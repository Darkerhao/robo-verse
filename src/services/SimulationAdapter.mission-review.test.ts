import { describe, expect, it } from 'vitest'
import { SimulationAdapter } from './SimulationAdapter'
import { missions } from '@/config/missions'
import { robots } from '@/config/robots'
import { parseLocalCommand } from '@/simulation/commands'
import type { MissionId } from '@/types/mission'
import { worldFoot } from '@/simulation/kinematics'
import { terrainHeight } from '@/config/missions'

function prepare(id: MissionId, speed?: number) {
  const adapter = new SimulationAdapter(), robot = missions[id].robot
  if (speed !== undefined) adapter.send({ type: 'speed', robot, value: speed })
  adapter.send({ type: 'mission', command: { type: 'select', id } })
  adapter.send({ type: 'mission', command: { type: 'start' } })
  return adapter
}
const advance = (adapter: SimulationAdapter, seconds: number) => { for (let tick = 0; tick < seconds * 10; tick++) adapter.tick(.1) }

describe('阶段七独立评审回归', () => {
  for (const id of ['pick', 'transport', 'terrain'] as const) {
    it(`${id}继承工作台最高速度后仍完成任务`, () => {
      const adapter = prepare(id, robots[missions[id].robot].maxSpeed)
      for (let tick = 0; tick < 600 && adapter.snapshot().mission.status === 'running'; tick++) adapter.tick(.1)
      expect(adapter.snapshot().mission.status, adapter.snapshot().mission.message).toBe('succeeded')
    })
  }
  it('任务手动接管保留新动作的完整控制状态和可见速度', () => {
    const adapter = prepare('inspection'); advance(adapter, 2)
    adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' }); advance(adapter, 1)
    expect(adapter.snapshot().mission.status).toBe('stopped')
    expect(adapter.snapshot().robots.quadruped.action).toBe('walk')
    expect(adapter.snapshot().robots.quadruped.speed).toBeGreaterThan(0)
  })
  it('停止的任务不会冻结随后提交的AI动作', () => {
    const adapter = prepare('interaction'); advance(adapter, 1)
    adapter.send({ type: 'mission', command: { type: 'stop' } })
    adapter.send({ type: 'assistant', robot: 'humanoid', text: '挥手', provider: '本地规则', commands: parseLocalCommand('挥手', 'humanoid') })
    const before = adapter.snapshot().robots.humanoid.joints
    advance(adapter, 1)
    expect(adapter.snapshot().robots.humanoid.joints).not.toEqual(before)
    advance(adapter, 3)
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('succeeded')
  })
  it('爬阶和平衡过渡始终至少有一只支撑脚贴住台面', () => {
    const adapter = prepare('terrain')
    for (let tick = 0; tick < 250; tick++) {
      adapter.tick(.1)
      const { mission, robots } = adapter.snapshot(), robot = robots.quadruped
      if (mission.step < 2 || mission.step > 3) continue
      const gaps = [0, 1, 2, 3].map(index => {
        const foot = worldFoot('quadruped', robot, index)
        return foot[1] - .06 - terrainHeight(robot.worldPosition[0] + foot[0], foot[2])
      })
      expect(Math.min(...gaps), `tick=${tick} step=${mission.step} gaps=${gaps}`).toBeLessThan(.025)
    }
  })
  it('准备任务时调整速度不丢失已准备的任务会话', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'speed', robot: 'quadruped', value: 0 })
    adapter.send({ type: 'mission', command: { type: 'select', id: 'inspection' } })
    expect(() => adapter.send({ type: 'mission', command: { type: 'start' } })).toThrow('速度')
    adapter.send({ type: 'speed', robot: 'quadruped', value: 1 })
    adapter.send({ type: 'mission', command: { type: 'start' } }); advance(adapter, 1)
    expect(adapter.snapshot().mission.progress).toBeGreaterThan(0)
  })
  it('无需位移的人机交互允许目标速度为零', () => {
    const adapter = prepare('interaction', 0); advance(adapter, 15)
    expect(adapter.snapshot().mission.status).toBe('succeeded')
  })
})
