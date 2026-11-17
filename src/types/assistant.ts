import type { RobotAction, RobotId } from './robot'

export type AssistantAction = RobotAction | 'scan' | 'patrol' | 'stop'
/** AI 层的统一 RobotCommand；只有验证后的指令才能映射到设备控制协议。 */
export interface RobotInstruction {
  robotType: RobotId
  action: AssistantAction
  parameters: { degrees?: number }
  target: 'environment' | 'box' | 'object' | null
  duration: number
  priority: 'normal' | 'stop'
}
export type ExecutionStatus = 'parsed' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export interface CommandRun {
  id: number
  text: string
  provider: string
  commands: RobotInstruction[]
  status: ExecutionStatus
  step: number
  elapsed: number
  message: string
  createdAt: string
}
export interface AssistantState { history: CommandRun[] }
export const executionLabels: Record<ExecutionStatus, string> = {
  parsed: '指令已解析', queued: '等待执行', running: '正在执行', succeeded: '执行成功', failed: '执行失败', cancelled: '已取消',
}
