import type { Quality, RobotId, Vector3Tuple } from '@/types/robot'

export type PerceptionMode = 'normal' | 'lidar' | 'cloud' | 'vision' | 'path'
export type ObjectCategory = 'person' | 'box' | 'equipment' | 'obstacle' | 'ground' | 'stairs' | 'target'
export interface EnvironmentPart { center: Vector3Tuple; size: Vector3Tuple; sphere?: boolean }
export interface EnvironmentObject { id: string; name: string; category: ObjectCategory; parts: EnvironmentPart[] }
export interface Bounds { min: Vector3Tuple; max: Vector3Tuple }
export interface LidarPoint { position: Vector3Tuple; objectId: string; category: ObjectCategory; distance: number }
export interface ScanFrame { id: number; time: number; origin: Vector3Tuple; points: LidarPoint[] }
export interface Detection {
  id: string; name: string; category: ObjectCategory; distance: number; bearing: number; confidence: number
  status: 'detected' | 'occluded' | 'out-of-view' | 'out-of-range'
  anchor: Vector3Tuple
}
export interface PlannedRoute {
  status: 'idle' | 'planned' | 'running' | 'paused' | 'arrived' | 'blocked' | 'stopped'
  start: Vector3Tuple; goal: Vector3Tuple; path: Vector3Tuple[]; waypoint: number
  length: number; travelled: number; replans: number; message: string
}
export interface PerceptionSettings {
  mode: PerceptionMode; scanning: boolean; scanSpeed: number; range: number
  showPoints: boolean; showBeams: boolean; showContours: boolean
  pointColor: 'class' | 'distance'; density: Quality
}
export interface PerceptionState extends PerceptionSettings {
  active: boolean; robot: RobotId; position: Vector3Tuple; obstacleSide: -1 | 1
  angle: number; revision: number; sensorOrigin: Vector3Tuple; cameraOrigin: Vector3Tuple
  points: LidarPoint[]; beams: Vector3Tuple[]; history: ScanFrame[]; historyId: number | null
  detections: Detection[]; selectedObject: string | null; route: PlannedRoute
}
export type PerceptionCommand =
  | { type: 'enter'; robot: RobotId }
  | { type: 'leave' }
  | { type: 'settings'; values: Partial<PerceptionSettings> }
  | { type: 'clear' }
  | { type: 'history'; id: number | null }
  | { type: 'select'; id: string | null }
  | { type: 'goal'; position: Vector3Tuple }
  | { type: 'route'; action: 'start' | 'pause' | 'stop' | 'reset' }
  | { type: 'obstacle' }

export const categories: Record<ObjectCategory, { name: string; color: string }> = {
  person: { name: '人员', color: '#39F5B5' }, box: { name: '箱体', color: '#FFBA67' },
  equipment: { name: '设备', color: '#816CFF' }, obstacle: { name: '障碍物', color: '#FF788A' },
  ground: { name: '地面', color: '#528BA9' }, stairs: { name: '楼梯', color: '#43E5FF' },
  target: { name: '目标物', color: '#E5F4A6' },
}
export const perceptionModes: { id: PerceptionMode; name: string; icon: string }[] = [
  { id: 'normal', name: '正常视图', icon: 'cube' }, { id: 'lidar', name: '激光雷达', icon: 'radar' },
  { id: 'cloud', name: '环境点云', icon: 'grid' }, { id: 'vision', name: 'AI 识别', icon: 'target' },
  { id: 'path', name: '路径规划', icon: 'route' },
]
export const trainingBounds: Bounds = { min: [-6, 0, -5], max: [6, 3, 5] }
export const homePosition: Vector3Tuple = [-4.5, 0, 0]
export const destinations = [
  { name: '东侧终点', position: [4.5, 0, 0] as Vector3Tuple },
  { name: '西侧起点', position: homePosition },
  { name: '南侧观察点', position: [-4.5, 0, 3.5] as Vector3Tuple },
]
export const restrictedZones: Bounds[] = [{ min: [3, 0, -4.4], max: [3.8, .015, -2.8] }]
/** 使用保守占地包络，四足包含机身、传感器与四肢，人形包含自然下垂双臂。 */
export const robotClearance: Record<RobotId, number> = { quadruped: 1.05, humanoid: .7 }
export const cloudCapacity = 6000
export const scanColumns: Record<Quality, number> = { high: 180, medium: 120, low: 72 }
export const scanElevations = [-35, -24, -15, -8, 0, 8, 15, 24, 35].map(value => value * Math.PI / 180)

/** 模型和感知变换共用安装尺寸，摄像头位于双目中心，雷达射线从镜窗中心发出。 */
export const sensorMounts = {
  quadruped: { lidar: [.32, .286, 0] as Vector3Tuple, scale: 1, camera: [.774, .133, 0] as Vector3Tuple },
  humanoid: {
    waist: [0, .14, 0] as Vector3Tuple, neck: [0, .49, 0] as Vector3Tuple, head: [.02, .18, 0] as Vector3Tuple,
    lidar: [-.012, .153, 0] as Vector3Tuple, scale: .53, camera: [.16, .025, 0] as Vector3Tuple,
  },
}

/** 同一组实体尺寸用于三维几何、射线检测、识别包围框和导航占地。 */
export function environmentObjects(obstacleSide: -1 | 1 = 1): EnvironmentObject[] {
  const block = (center: Vector3Tuple, size: Vector3Tuple): EnvironmentPart => ({ center, size })
  return [
    { id: 'ground', name: '训练场地面', category: 'ground', parts: [block([0, -.0075, 0], [12, .015, 10])] },
    { id: 'barrier', name: '中央隔离障碍', category: 'obstacle', parts: [block([0, .65, 0], [1.1, 1.3, 2.8])] },
    { id: 'movable-crate', name: '可移动箱体', category: 'box', parts: [block([0, .45, 3 * obstacleSide], [1.4, .9, .9])] },
    { id: 'crate', name: '仓储箱体', category: 'box', parts: [block([-4, .4, 3.3], [.9, .8, .9])] },
    { id: 'equipment', name: '检测设备柜', category: 'equipment', parts: [block([4, .85, 3.3], [1, 1.7, .8])] },
    { id: 'person', name: '训练场工作人员', category: 'person', parts: [
      { center: [-3.6, 1.62, -3.1], size: [.28, .28, .28], sphere: true },
      block([-3.6, 1.16, -3.1], [.36, .62, .23]),
      block([-3.71, .43, -3.1], [.13, .86, .17]), block([-3.49, .43, -3.1], [.13, .86, .17]),
      block([-3.84, 1.05, -3.1], [.10, .58, .14]), block([-3.36, 1.05, -3.1], [.10, .58, .14]),
    ] },
    { id: 'stairs', name: '阶梯训练装置', category: 'stairs', parts: Array.from({ length: 4 }, (_, i) => block([4.4 + (i - 1.5) * .3, (i + 1) * .1, -3.4], [.3, (i + 1) * .2, 1.05])) },
    { id: 'target', name: '待定位目标球', category: 'target', parts: [
      block([4.6, .17, 1.8], [.42, .34, .42]), { center: [4.6, .52, 1.8], size: [.36, .36, .36], sphere: true },
    ] },
  ]
}

export function objectBounds(object: EnvironmentObject): Bounds {
  return {
    min: [0, 1, 2].map(axis => Math.min(...object.parts.map(part => part.center[axis]! - part.size[axis]! / 2))) as Vector3Tuple,
    max: [0, 1, 2].map(axis => Math.max(...object.parts.map(part => part.center[axis]! + part.size[axis]! / 2))) as Vector3Tuple,
  }
}
