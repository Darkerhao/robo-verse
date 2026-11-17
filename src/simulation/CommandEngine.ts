import type { AssistantState, CommandRun, RobotInstruction } from '@/types/assistant'
import type { RobotId } from '@/types/robot'
import { instructionLabel, validateInstructions } from './commands'
import { actions } from '@/config/robots'

interface CommandHost { start(command: RobotInstruction): void; complete(command: RobotInstruction, elapsed: number): boolean; halt(robot: RobotId): void }
/** 仅由适配器的同一个 tick 驱动，历史本身就是队列状态。 */
export class CommandEngine {
  state: AssistantState = { history: [] }
  private sequence = 0
  constructor(private host: CommandHost) {}
  get active() { return this.state.history.find(run => run.status === 'queued' || run.status === 'running') }
  submit(text: string, provider: string, value: unknown, robot: RobotId) {
    const commands = validateInstructions(value, robot)
    if (!text.trim() || text.length > 240) throw new Error('指令文本长度无效。')
    if (commands[0]!.action === 'stop') this.cancel('自然语言停止已取消当前任务')
    else if (this.active) throw new Error('已有指令执行中，请先取消或等待完成。')
    const run: CommandRun = { id: ++this.sequence, text, provider, commands, status: 'queued', step: 0, elapsed: 0, message: '等待仿真执行', createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }) }
    this.state.history.unshift(run); this.state.history.length = Math.min(30, this.state.history.length)
    if (commands[0]!.action === 'stop') { this.host.halt(robot); run.status = 'succeeded'; run.step = 1; run.message = '当前任务已停止' }
  }
  cancel(message: string, halt = true) { const run = this.active; if (!run) return; if (halt) this.host.halt(run.commands[0]!.robotType); run.status = 'cancelled'; run.message = message }
  clear() { if (this.active) throw new Error('请先取消当前任务，再清空历史。'); this.state.history = [] }
  tick(dt: number) {
    const run = this.active; if (!run) return
    const command = run.commands[run.step]!
    try {
      if (run.status === 'queued') { this.host.start(command); run.status = 'running'; run.message = instructionLabel(command); return }
      run.elapsed += dt
      if (!this.host.complete(command, run.elapsed)) return
      if (command.action === 'scan' || command.action === 'patrol' || (command.action in actions && actions[command.action as keyof typeof actions].animated)) this.host.halt(command.robotType)
      run.step++; run.elapsed = 0
      if (run.step === run.commands.length) { run.status = 'succeeded'; run.message = '全部动作执行完成' } else { run.status = 'queued'; run.message = '上一步完成，等待下一步' }
    } catch (cause) { this.host.halt(command.robotType); run.status = 'failed'; run.message = cause instanceof Error ? cause.message : String(cause) }
  }
}
