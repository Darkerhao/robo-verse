export type RobotId = 'quadruped' | 'humanoid'
export type RobotAction = 'idle' | 'stand' | 'walk' | 'backward' | 'trot' | 'run' | 'turnLeft' | 'turnRight' | 'sit' | 'jump' | 'crouch' | 'climb' | 'balance' | 'shake' | 'wave' | 'raiseArms' | 'bend' | 'pickUp' | 'carry' | 'handshake' | 'point' | 'grip' | 'openHand'
export type CameraView = 'perspective' | 'front' | 'side' | 'top'
export type Quality = 'high' | 'medium' | 'low'
export type Vector3Tuple = [number, number, number]
export type ControlMode = 'motion' | 'joint' | 'ik' | 'replay'

export interface JointDefinition {
  id: string
  name: string
  group: string
  path: string
  axis: 'x' | 'y' | 'z'
  min: number
  max: number
  neutral: number
}

export interface EndEffector {
  id: string
  name: string
  kind: 'foot' | 'hand'
  indices: number[]
  side: number
}

export interface RobotPose {
  position: Vector3Tuple
  roll: number
  pitch: number
  joints: number[]
}

export interface RobotDefinition {
  id: RobotId
  name: string
  serial: string
  category: string
  description: string
  drivenAxes: number
  mass: number
  maxSpeed: number
  actions: RobotAction[]
}

export interface RobotState extends RobotPose {
  id: RobotId
  action: RobotAction
  targetSpeed: number
  speed: number
  heading: number
  targetHeading: number
  phase: number
  actionTime: number
  motionRate: number
  loop: boolean
  controlMode: ControlMode
  jointTargets: number[] | null
  ikTarget: { effector: string; position: Vector3Tuple } | null
  recording: boolean
  recordedFrames: number
  recordedDuration: number
  replayTime: number
  battery: number
  temperature: number
  power: number
  cpu: number
  emergency: boolean
}

export interface SimulationSnapshot {
  time: number
  paused: boolean
  robots: Record<RobotId, RobotState>
}

export type RobotCommand =
  | { type: 'action'; robot: RobotId; action: RobotAction }
  | { type: 'speed'; robot: RobotId; value: number }
  | { type: 'rate'; robot: RobotId; value: number }
  | { type: 'loop'; robot: RobotId; value: boolean }
  | { type: 'joint'; robot: RobotId; joint: string; value: number }
  | { type: 'ik'; robot: RobotId; effector: string; position: Vector3Tuple }
  | { type: 'record'; robot: RobotId; value: boolean }
  | { type: 'replay'; robot: RobotId }
  | { type: 'clearRecording'; robot: RobotId }
  | { type: 'stop'; robot: RobotId }
  | { type: 'turn'; robot: RobotId; degrees: number }
  | { type: 'emergency'; robot: RobotId }
  | { type: 'release'; robot: RobotId }
  | { type: 'pause'; value: boolean }
  | { type: 'reset' }

/** 实际设备适配器必须返回设备确认的状态，不能沿用仿真数据作为连接成功依据。 */
export interface RobotAdapter {
  readonly mode: 'simulation' | 'ros2' | 'mqtt'
  connect(): Promise<void>
  disconnect(): void
  send(command: RobotCommand): void | Promise<void>
  subscribe(listener: (snapshot: SimulationSnapshot) => void): () => void
}

export interface TelemetrySample { time: number; speed: number; temperature: number; power: number; cpu: number; battery: number }
export interface RuntimeEvent { id: number; time: string; level: 'info' | 'warning'; robot: string; message: string }
