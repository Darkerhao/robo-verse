import { describe, expect, it, vi } from 'vitest'
import { CommandEngine } from './CommandEngine'
import type { RobotInstruction } from '@/types/assistant'

const command = (action: RobotInstruction['action']): RobotInstruction => ({ robotType: 'quadruped', action, parameters: {}, target: action === 'scan' ? 'environment' : null, duration: action === 'stop' ? 0 : 1, priority: action === 'stop' ? 'stop' : 'normal' })
describe('AI 顺序执行引擎', () => {
  it('在同一时钟内按顺序完成并保留执行历史', () => {
    const started: string[] = [], engine = new CommandEngine({ start: c => started.push(c.action), complete: (_c, elapsed) => elapsed >= 1, halt: () => undefined })
    engine.submit('走然后待机', '本地规则', [command('walk'), command('stand')], 'quadruped')
    engine.tick(.1); expect(started).toEqual(['walk'])
    engine.tick(1); engine.tick(.1); expect(started).toEqual(['walk', 'stand'])
    engine.tick(1); expect(engine.state.history[0]!.status).toBe('succeeded')
  })
  it('取消当前队列后不再启动下一步', () => {
    const started: string[] = [], engine = new CommandEngine({ start: c => started.push(c.action), complete: () => false, halt: () => undefined })
    engine.submit('连续动作', '本地规则', [command('walk'), command('stand')], 'quadruped'); engine.tick(.1); engine.cancel('用户取消'); engine.tick(3)
    expect(started).toEqual(['walk']); expect(engine.state.history[0]!.status).toBe('cancelled')
  })
  it('步骤失败会停止驱动，保留原因并跳过剩余步骤', () => {
    const start = vi.fn(() => { throw new Error('路线不可达') }), halt = vi.fn()
    const engine = new CommandEngine({ start, complete: () => false, halt })
    engine.submit('连续动作', '本地规则', [command('walk'), command('stand')], 'quadruped')
    engine.tick(.1); engine.tick(.1)
    expect(start).toHaveBeenCalledOnce(); expect(halt).toHaveBeenCalledWith('quadruped')
    expect(engine.state.history[0]).toMatchObject({ status: 'failed', step: 0, message: '路线不可达' })
  })
  it('拒绝并发和运行中清空，独立停止立即取消旧运行', () => {
    const halt = vi.fn(), engine = new CommandEngine({ start: () => undefined, complete: () => false, halt })
    engine.submit('行走', '本地规则', [command('walk')], 'quadruped'); engine.tick(.1)
    expect(() => engine.submit('站立', '本地规则', [command('stand')], 'quadruped')).toThrow('执行中')
    expect(() => engine.clear()).toThrow('先取消')
    engine.submit('停止', '本地规则', [command('stop')], 'quadruped')
    expect(engine.state.history.map(run => run.status)).toEqual(['succeeded', 'cancelled'])
    expect(engine.active).toBeUndefined(); expect(halt).toHaveBeenCalledWith('quadruped')
    engine.clear(); expect(engine.state.history).toEqual([])
  })
})
