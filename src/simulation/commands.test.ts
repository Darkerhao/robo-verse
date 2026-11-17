import { describe, expect, it } from 'vitest'
import { parseLocalCommand, validateInstructions } from './commands'

describe('本地 AI 指令解析', () => {
  it('将中文顺序动作解析为可执行白名单指令', () => {
    const result = parseLocalCommand('让机器狗向前走1秒，然后向左转45度', 'quadruped')
    expect(result.map(item => item.action)).toEqual(['walk', 'turnLeft'])
    expect(result[0]!.duration).toBe(1)
    expect(result[1]!.parameters.degrees).toBe(45)
  })
  it('将组合抓取展开为已有机械动作', () => {
    expect(parseLocalCommand('人形机器人弯腰抓起箱子', 'humanoid').map(item => item.action)).toEqual(['bend', 'openHand', 'pickUp', 'grip', 'stand'])
  })
  it('拒绝越权机型、未知动作和组合停止', () => {
    expect(() => parseLocalCommand('让人形机器人挥手', 'quadruped')).toThrow('机型')
    expect(() => parseLocalCommand('打开舱门', 'quadruped')).toThrow('未识别')
    const stop = parseLocalCommand('停止当前任务', 'quadruped')
    expect(() => validateInstructions([...stop, ...parseLocalCommand('站起来', 'quadruped')], 'quadruped')).toThrow('停止请单独发送')
  })
  it('整句包含未知或禁止片段时不提取执行已知动作', () => {
    for (const text of ['向前走，然后打开舱门', '不要向前走', '删除文件并站起来', '停止，然后向前走']) expect(() => parseLocalCommand(text, 'quadruped')).toThrow()
  })
  it('边界时长与角度有效，超界和非有限值明确拒绝', () => {
    expect(parseLocalCommand('挥手0.5秒', 'humanoid')[0]?.duration).toBe(.5)
    expect(parseLocalCommand('向右转180度', 'quadruped')[0]?.parameters.degrees).toBe(180)
    for (const duration of [0, .49, 20.01, NaN, Infinity, '3']) {
      const valid = parseLocalCommand('挥手', 'humanoid')[0]!
      expect(() => validateInstructions([{ ...valid, duration }], 'humanoid')).toThrow('时长')
    }
    for (const degrees of [0, 181, NaN, Infinity, '45']) {
      const valid = parseLocalCommand('向右转', 'quadruped')[0]!
      expect(() => validateInstructions([{ ...valid, parameters: { degrees } }], 'quadruped')).toThrow('角度')
    }
  })
  it('完整格式的外部指令仍拒绝越权动作、目标、参数和额外字段', () => {
    const valid = parseLocalCommand('站立', 'quadruped')[0]!
    for (const patch of [{ action: 'openDoor' }, { target: 'person' }, { priority: 'admin' }, { parameters: { shell: 'run' } }, { execute: true }]) expect(() => validateInstructions([{ ...valid, ...patch }], 'quadruped')).toThrow()
  })
})
