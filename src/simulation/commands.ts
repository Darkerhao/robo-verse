import { actions, robots } from '@/config/robots'
import type { RobotId } from '@/types/robot'
import type { AssistantAction, RobotInstruction } from '@/types/assistant'

const aliases: [RegExp, AssistantAction][] = [
  [/^(?:向前走|往前走|向前行走|前进|行走|走路)$/, 'walk'],
  [/^(?:向后走|往后走|后退)$/, 'backward'], [/^(?:向左转|往左转|左转)$/, 'turnLeft'], [/^(?:向右转|往右转|右转)$/, 'turnRight'],
  [/^(?:坐下|坐下来)$/, 'sit'], [/^(?:站起来|站起|站立|起立|恢复站姿)$/, 'stand'], [/^(?:跳跃|跳一下|跳起来)$/, 'jump'],
  [/^(?:挥手|挥挥手|招手)$/, 'wave'], [/^(?:举起双臂|举起双手|举手|抬起双臂)$/, 'raiseArms'],
  [/^(?:下蹲|蹲下)$/, 'crouch'], [/^(?:弯腰|弯下腰)$/, 'bend'], [/^(?:张开手掌|张开双手|打开手掌)$/, 'openHand'],
  [/^(?:抓握|握拳|合拢手掌)$/, 'grip'], [/^(?:指向目标|指向目标物|指向前方)$/, 'point'], [/^握手$/, 'handshake'],
  [/^(?:抓取物品|抓起物品|抓取箱子|抓起箱子|拿起箱子|抓取演示)$/, 'pickUp'], [/^(?:搬运箱子|搬运物品|搬运|搬运姿态)$/, 'carry'],
  [/^(?:扫描周围环境|扫描环境|扫描周围|扫描)$/, 'scan'], [/^(?:开始巡检|自动巡检|巡检)$/, 'patrol'],
  [/^(?:停止当前任务|停止任务|停止当前动作|停止|取消当前任务|取消任务|取消)$/, 'stop'],
  [/^(?:小跑|对角小跑)$/, 'trot'], [/^(?:奔跑|跑步)$/, 'run'], [/^(?:自然待机|待机)$/, 'idle'],
  [/^动态平衡$/, 'balance'], [/^(?:身体晃动|晃动)$/, 'shake'], [/^台阶步态$/, 'climb'],
]
export const instructionLabel = (command: RobotInstruction) => command.action === 'scan' ? '扫描周围环境' : command.action === 'patrol' ? '巡检路线演示' : command.action === 'stop' ? '停止当前任务' : actions[command.action].label
export const defaultDuration = (action: AssistantAction) => action === 'stop' ? 0 : action === 'scan' ? 4 : action === 'patrol' ? 40 : action in actions ? Math.max(2.5, actions[action as keyof typeof actions].duration) : 3

function instruction(robotType: RobotId, action: AssistantAction): RobotInstruction {
  return { robotType, action, parameters: {}, target: action === 'scan' || action === 'patrol' ? 'environment' : action === 'pickUp' || action === 'carry' ? 'box' : action === 'point' ? 'object' : null, duration: defaultDuration(action), priority: action === 'stop' ? 'stop' : 'normal' }
}

/** 对本地和外部 Provider 使用相同边界，不信任模型返回的动作名或参数。 */
export function validateInstructions(value: unknown, robot: RobotId): RobotInstruction[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error('每次需要 1–12 个白名单动作。')
  const commands = value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('指令格式无效。')
    const c = entry as RobotInstruction
    if (Object.keys(c).sort().join(',') !== 'action,duration,parameters,priority,robotType,target') throw new Error('指令包含未知字段或缺少必要字段。')
    if (c.robotType !== robot) throw new Error('指令机型与当前机器人不同，请先切换机器人。')
    if (!(robots[robot].actions as string[]).concat('scan', ...(robot === 'quadruped' ? ['patrol'] : []), 'stop').includes(c.action)) throw new Error('当前机器人不支持此动作。')
    if (!c.parameters || typeof c.parameters !== 'object' || Array.isArray(c.parameters) || Object.keys(c.parameters).some(key => key !== 'degrees')) throw new Error('指令参数不在白名单内。')
    if (c.parameters.degrees !== undefined && (!['turnLeft', 'turnRight'].includes(c.action) || !Number.isFinite(c.parameters.degrees) || c.parameters.degrees < 1 || c.parameters.degrees > 180)) throw new Error('转向角度仅支持 1–180 度。')
    const expected = instruction(robot, c.action)
    if (c.target !== expected.target || c.priority !== expected.priority) throw new Error('目标或优先级不在白名单内。')
    if (!Number.isFinite(c.duration) || (c.action === 'stop' ? c.duration !== 0 : c.duration < .5 || c.duration > (c.action === 'patrol' ? 120 : 20))) throw new Error('动作时长仅支持 0.5–20 秒，巡检最多 120 秒。')
    return { ...c, parameters: { ...c.parameters } }
  })
  if (commands.some(c => c.action === 'stop') && commands.length !== 1) throw new Error('停止请单独发送，不能和运动指令组合。')
  return commands
}

export function parseLocalCommand(input: string, robot: RobotId): RobotInstruction[] {
  if (!input.trim() || input.length > 240) throw new Error('请输入 1–240 字的机器人指令。')
  const clauses = input.trim().replace(/[。.!！]+$/, '').split(/(?:然后|接着|随后|再|之后|并且|并|以及|，|,|；|;|\n)+/).map(s => s.trim()).filter(Boolean)
  if (!clauses.length || clauses.length > 8) throw new Error('一次最多输入 8 段顺序指令。')
  const commands: RobotInstruction[] = []
  for (let clause of clauses) {
    clause = clause.replace(/^(?:请|麻烦)(?:让|把)?/, '').replace(/^(?:让|使)/, '')
    const subject = clause.match(/^(机器狗|四足机器人|人形机器人|机器人|RV\s*K1|RV\s*H1)/i)
    if (subject) {
      const named = /机器狗|四足|K1/i.test(subject[0]) ? 'quadruped' : /人形|H1/i.test(subject[0]) ? 'humanoid' : robot
      if (named !== robot) throw new Error('指令机型与当前机器人不同，请先切换机器人。')
      clause = clause.slice(subject[0].length).trim()
    }
    clause = clause.replace(/\s+/g, '').replace(/(?:吧|一下吧)$/, '')
    let duration: number | undefined, degrees: number | undefined
    const time = clause.match(/(?:持续)?(\d+(?:\.\d+)?)秒$/)
    if (time) { duration = Number(time[1]); clause = clause.slice(0, time.index) }
    const angle = clause.match(/(\d+(?:\.\d+)?)度$/)
    if (angle) { degrees = Number(angle[1]); clause = clause.slice(0, angle.index) }
    if (/^弯腰(?:抓起|抓取|拿起)(?:箱子|物品)$/.test(clause)) {
      if (duration !== undefined || degrees !== undefined) throw new Error('组合抓取演示请使用默认时长。')
      commands.push(...(['bend', 'openHand', 'pickUp', 'grip', 'stand'] as const).map(action => instruction(robot, action)))
      continue
    }
    const action = aliases.find(([pattern]) => pattern.test(clause))?.[1]
    if (!action) throw new Error(`未识别“${clause}”。仅支持已列出的机器人动作，请拆成明确的顺序指令。`)
    const c = instruction(robot, action)
    if (duration !== undefined) c.duration = duration
    if (degrees !== undefined) c.parameters.degrees = degrees
    if (action === 'turnLeft' || action === 'turnRight') c.parameters.degrees ??= 45
    commands.push(c)
  }
  return validateInstructions(commands, robot)
}
