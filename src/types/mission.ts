import type { Bounds, Detection, EnvironmentObject, PlannedRoute } from '@/config/perception'
import type { RobotAction, RobotId, Vector3Tuple } from './robot'

export type MissionId = 'inspection' | 'patrol' | 'terrain' | 'rescue' | 'pick' | 'transport' | 'interaction'
export type MissionSceneId = 'factory' | 'warehouse' | 'laboratory' | 'road' | 'stairs' | 'obstacles'
export type MissionStatus = 'ready' | 'running' | 'paused' | 'stopped' | 'succeeded' | 'failed'
export interface MissionObject extends EnvironmentObject {
  color?: string
  anomaly?: string
  support?: boolean
}
export interface MissionStep {
  name: string
  kind: 'move' | 'scan' | 'action' | 'reach' | 'grasp' | 'lift' | 'place' | 'release' | 'approach'
  action: RobotAction
  duration?: number
  goal?: Vector3Tuple
  target?: string
  heading?: number
}
export interface MissionDefinition {
  id: MissionId; name: string; scene: MissionSceneId; robot: RobotId; description: string
  start: Vector3Tuple; steps: MissionStep[]
}
export interface MissionSceneDefinition {
  id: MissionSceneId; name: string; caption: string; color: string; light: string
  objects: MissionObject[]; zones: Bounds[]
}
export interface MissionEvent { id: number; time: number; level: 'info' | 'warning'; message: string }
export interface MissionState {
  active: boolean; id: MissionId; status: MissionStatus; step: number; stepElapsed: number; elapsed: number
  progress: number; message: string; events: MissionEvent[]; result: string | null
  route: PlannedRoute; detections: Detection[]; scanOrigin: Vector3Tuple | null
  objects: MissionObject[]; marked: string[]; attached: boolean; payloadPosition: Vector3Tuple | null
  payloadHeading: number; revision: number
}
export type MissionCommand = { type: 'select'; id: MissionId } | { type: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'leave' }
export const missionStatusLabels: Record<MissionStatus, string> = { ready: '准备就绪', running: '正在执行', paused: '已暂停', stopped: '已停止', succeeded: '任务完成', failed: '执行失败' }
