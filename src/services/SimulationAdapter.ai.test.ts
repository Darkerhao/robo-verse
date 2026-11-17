import { describe, expect, it } from 'vitest'
import { parseLocalCommand } from '@/simulation/commands'
import { SimulationAdapter } from './SimulationAdapter'
import { environmentObjects, restrictedZones, robotClearance } from '@/config/perception'
import { isSegmentFree } from '@/simulation/pathPlanning'
import type { RobotId } from '@/types/robot'

const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < Math.ceil(seconds / .1); i++) adapter.tick(.1) }
const enter = (adapter: SimulationAdapter, robot: RobotId = 'quadruped') => adapter.send({ type: 'perception', command: { type: 'enter', robot } })
const submit = (adapter: SimulationAdapter, text: string, robot: RobotId = 'quadruped') => adapter.send({ type: 'assistant', text, provider: '本地规则', robot, commands: parseLocalCommand(text, robot) })

describe('AI 指令接入统一仿真适配器', () => {
  it('顺序移动与转向真实完成，另一台机器人保持隔离', () => {
    const adapter = new SimulationAdapter(), commands = parseLocalCommand('向前走1秒，然后向左转45度', 'quadruped')
    enter(adapter); adapter.send({ type: 'assistant', text: '向前走1秒，然后向左转45度', provider: '本地规则', robot: 'quadruped', commands })
    advance(adapter, 8)
    const state = adapter.snapshot()
    expect(state.assistant.history[0]?.status).toBe('succeeded')
    expect(state.robots.quadruped.worldPosition[0]).toBeGreaterThan(-4.5)
    expect(state.robots.quadruped.heading).toBeCloseTo(315, 0)
    expect(state.robots.quadruped.action).toBe('stand')
    expect(state.robots.humanoid.action).toBe('stand')
  })

  it('暂停冻结队列，手动控制会取消当前 AI 指令', () => {
    const adapter = new SimulationAdapter(), commands = parseLocalCommand('挥手', 'humanoid')
    enter(adapter, 'humanoid'); adapter.send({ type: 'assistant', text: '挥手', provider: '本地规则', robot: 'humanoid', commands }); adapter.tick(.1)
    adapter.send({ type: 'pause', value: true }); const frozen = adapter.snapshot()
    advance(adapter, 3); expect(adapter.snapshot()).toEqual(frozen)
    adapter.send({ type: 'pause', value: false }); adapter.send({ type: 'action', robot: 'humanoid', action: 'wave' })
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('cancelled')
    expect(adapter.snapshot().robots.humanoid.action).toBe('wave')
  })

  it('扫描动作复用感知状态并在步骤完成后停止扫描', () => {
    const adapter = new SimulationAdapter(), commands = parseLocalCommand('扫描周围环境', 'quadruped')
    enter(adapter); adapter.send({ type: 'assistant', text: '扫描周围环境', provider: '本地规则', robot: 'quadruped', commands }); advance(adapter, .1)
    expect(adapter.snapshot().perception.scanning).toBe(true)
    advance(adapter, 5)
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('succeeded')
    expect(adapter.snapshot().perception.scanning).toBe(false)
  })

  for (const text of ['让机器狗向前走，然后向左转', '让机器狗后退']) it(`规范原句“${text}”能在安全场地内完成`, () => {
    const adapter = new SimulationAdapter()
    enter(adapter); const start = adapter.snapshot().robots.quadruped.worldPosition
    submit(adapter, text)
    for (let tick = 0; tick < 150; tick++) {
      const before = adapter.snapshot().robots.quadruped.worldPosition
      adapter.tick(.1)
      const after = adapter.snapshot().robots.quadruped.worldPosition
      expect(isSegmentFree(before, after, environmentObjects(), restrictedZones, robotClearance.quadruped)).toBe(true)
    }
    const state = adapter.snapshot()
    expect(state.assistant.history[0]?.status).toBe('succeeded')
    expect(state.robots.quadruped.worldPosition[0]).not.toBe(start[0])
    if (text.includes('后退')) expect(state.robots.quadruped.worldPosition[0]).toBeLessThan(start[0])
    else expect(state.robots.quadruped.heading).toBeCloseTo(315)
  })

  for (const [text, increasing] of [['向右转180度', true], ['向左转180度', false]] as const) it(`${text} 的中间朝向与指令方向一致`, () => {
    const adapter = new SimulationAdapter()
    enter(adapter); submit(adapter, text); advance(adapter, 1.1)
    const heading = adapter.snapshot().robots.quadruped.heading
    if (increasing) { expect(heading).toBeGreaterThan(0); expect(heading).toBeLessThan(180) }
    else expect(heading).toBeGreaterThan(180)
    advance(adapter, 5)
    expect(adapter.snapshot().robots.quadruped.heading).toBeCloseTo(180)
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('succeeded')
  })

  it('拒绝无效手动输入时保持当前路线、动作与队列', () => {
    const adapter = new SimulationAdapter()
    enter(adapter); submit(adapter, '向前走1秒'); advance(adapter, .3)
    const before = adapter.snapshot()
    expect(() => adapter.send({ type: 'action', robot: 'quadruped', action: 'wave' })).toThrow('不支持')
    expect(adapter.snapshot()).toEqual(before)
    expect(() => adapter.send({ type: 'joint', robot: 'quadruped', joint: 'unknown', value: 1 })).toThrow('没有此关节')
    expect(adapter.snapshot()).toEqual(before)
    expect(() => adapter.send({ type: 'turn', robot: 'quadruped', degrees: NaN })).toThrow('有效数值')
    expect(adapter.snapshot()).toEqual(before)
  })

  it('画质、视图和聚焦设置不取消扫描，手动动作仍可以接管', () => {
    const adapter = new SimulationAdapter()
    enter(adapter); submit(adapter, '扫描周围环境'); advance(adapter, .3)
    adapter.send({ type: 'perception', command: { type: 'settings', values: { density: 'low', mode: 'cloud' } } })
    adapter.send({ type: 'perception', command: { type: 'select', id: 'crate' } })
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('running')
    expect(adapter.snapshot().perception.scanning).toBe(true)
    adapter.send({ type: 'action', robot: 'quadruped', action: 'sit' })
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('cancelled')
    expect(adapter.snapshot().robots.quadruped.action).toBe('sit')
    expect(adapter.snapshot().perception.scanning).toBe(false)
  })

  it('急停保留最后真实姿态，解除后不继续旧队列', () => {
    const adapter = new SimulationAdapter()
    enter(adapter); submit(adapter, '跳跃，然后坐下'); advance(adapter, 1.7)
    const before = adapter.snapshot().robots.quadruped
    adapter.send({ type: 'emergency', robot: 'quadruped' })
    const stopped = adapter.snapshot().robots.quadruped
    expect(stopped.position).toEqual(before.position); expect(stopped.joints).toEqual(before.joints)
    expect(stopped.emergency).toBe(true); expect(stopped.speed).toBe(0); expect(stopped.power).toBe(0)
    advance(adapter, 2); expect(adapter.snapshot().robots.quadruped).toEqual(stopped)
    adapter.send({ type: 'release', robot: 'quadruped' }); advance(adapter, 4)
    expect(adapter.snapshot().assistant.history[0]?.status).toBe('cancelled')
    expect(adapter.snapshot().robots.quadruped.action).toBe('stand')
  })
  it('停止在全局暂停中立即取消排队动作，不能解除急停', () => {
    const adapter = new SimulationAdapter()
    enter(adapter); submit(adapter, '跳跃，然后坐下'); advance(adapter, .5)
    adapter.send({ type: 'pause', value: true }); submit(adapter, '停止当前任务')
    expect(adapter.snapshot().assistant.history.map(run => run.status)).toEqual(['succeeded', 'cancelled'])
    adapter.send({ type: 'emergency', robot: 'quadruped' }); submit(adapter, '停止当前任务')
    expect(adapter.snapshot().robots.quadruped.emergency).toBe(true)
    expect(adapter.snapshot().robots.quadruped.power).toBe(0)
  })
  it('巡检真实绕开障碍到达终点，扫描与原动作设置在结束时一致', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'loop', robot: 'quadruped', value: false }); adapter.send({ type: 'rate', robot: 'quadruped', value: 2 })
    enter(adapter); submit(adapter, '开始巡检'); advance(adapter, 25)
    const state = adapter.snapshot()
    expect(state.assistant.history[0]?.status).toBe('succeeded')
    expect(state.perception.route.status).toBe('arrived'); expect(state.perception.route.path.length).toBeGreaterThan(2)
    expect(state.robots.quadruped.worldPosition).toEqual([4.5, 0, 0]); expect(state.robots.quadruped.action).toBe('stand')
    expect(state.perception.scanning).toBe(false)
    expect(state.robots.quadruped.loop).toBe(false); expect(state.robots.quadruped.motionRate).toBe(2)
  })
})
