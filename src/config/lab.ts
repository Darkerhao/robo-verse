import type { RobotId, Vector3Tuple } from '@/types/robot'
import type { PartKind, RobotPart } from '@/three/RobotParts'

export const disassemblySteps: Record<RobotId, string[]> = {
  quadruped: ['外部保护壳', '上部外壳', '电池系统', '主控制器', '传感器模块', '主体框架', '四肢机械结构', '关节电机', '减速器', '足端结构'],
  humanoid: ['头部外壳', '视觉感知模块', '胸部外壳', '主控制器', '电池系统', '双臂模块', '灵巧手', '腰部关节', '双腿模块', '关节执行器'],
}

export const partKinds: Record<PartKind, { name: string; description: string }> = {
  frame: { name: '承载结构', description: '连接机械模块并传递载荷，安装位置与相邻关节保持明确的层级关系。' },
  shell: { name: '保护外壳', description: '保护内部机构与电子模块。外壳与内部实体独立，可透明观察或单独隐藏。' },
  joint: { name: '关节机构', description: '连接相邻连杆，电机经减速器驱动局部旋转轴。受控轴的角度来自当前运动学快照。' },
  link: { name: '机械连杆', description: '连接相邻关节并传递运动，随父级关节旋转，装配状态下连杆长度保持不变。' },
  power: { name: '电池系统', description: '模块化电池包包含六组电芯、保护盖与管理板，为驱动和控制模块供电。电量为统一仿真数据。' },
  controller: { name: '计算与控制', description: '主计算板或局部管理板负责控制与电气管理。当前为实体结构展示，无真实设备通信。' },
  sensor: { name: '感知模块', description: '安装在明确的机械支架或末端上。当前展示传感器实体；扫描、识别与测量将在感知阶段接入。' },
  cooling: { name: '散热结构', description: '散热鳍片与安装件为内部电子和驱动模块提供散热结构，温度读取统一仿真快照。' },
  interface: { name: '接口与标识', description: '供电、通信、维护接口或设备标识，用于说明概念模型的模块位置与连接关系。' },
  foot: { name: '足端结构', description: '末端承载与接触结构，随髋、膝及足端关节运动。当前为运动学演示，无真实压力反馈。' },
  hand: { name: '灵巧手', description: '手掌与独立指节组成机械手，随腕部和指间关节运动，支持原有张开、抓握与指向动作。' },
}

export interface LabPart extends RobotPart {
  englishName: string
  description: string
  step: number
  jointIndices: number[]
}
export interface LabState {
  progress: number
  selectedPartId: string | null
  hidden: string[]
  transparent: boolean
  skeleton: boolean
  axes: boolean
  highlight: 'none' | 'sensor' | 'joint' | 'power' | 'controller'
}
export function defaultLabState(): LabState {
  return { progress: 0, selectedPartId: null, hidden: [], transparent: false, skeleton: false, axes: false, highlight: 'none' }
}
export function partHidden(id: string, hidden: string[]) { return hidden.some(parent => id === parent || id.startsWith(parent + '/')) }

/** 位移以机器人坐标轴定义，保留父子装配关系；子模块只在自身步骤额外分离。 */
export function disassemblyBinding(id: RobotId, item: RobotPart): { step: number; offset: Vector3Tuple } {
  const path = item.id.slice(id.length + '/body'.length)
  const key = item.id.split('/').at(-1)!
  const side = /left|--1/.test(path) ? -1 : 1
  const offset: Vector3Tuple = [0, 0, 0]
  let step = id === 'quadruped' ? 6 : 8
  if (id === 'quadruped') {
    const limb = /\/(front|rear)-(left|right)(\/|$)/.test(path)
    if (path.startsWith('/battery')) { step = 3; if (key === 'battery') offset.splice(0, 3, -.65, .5, 0) }
    else if (path.startsWith('/controller')) { step = 4; if (key === 'controller') offset.splice(0, 3, .95, .55, 0) }
    else if (path.startsWith('/roof')) { step = 2; if (key === 'roof') offset[1] = .85 }
    else if (/^\/(left-shell|right-shell|belly)(\/|$)/.test(path)) {
      step = 1
      if (key.endsWith('-shell')) offset[2] = side * .65
      if (key === 'belly') offset[1] = -.22
    } else if (limb) {
      step = key === 'motor' ? 8 : key === 'reducer' ? 9 : path.includes('/foot') ? 10 : 7
      if (/^(front|rear)-(left|right)$/.test(key)) offset.splice(0, 3, key.startsWith('front') ? .25 : -.25, .13, side * .42)
      else if (key === 'motor') offset[2] = side * .38
      else if (key === 'reducer') offset[2] = side * .64
      else if (key.endsWith('-shell')) offset[2] = side * .22
      else if (key.endsWith('-link')) offset[2] = side * .12
      else if (key === 'foot') offset.splice(0, 3, path.includes('front-') ? .25 : -.25, .13, side * .12)
    } else if (item.kind === 'sensor' || item.kind === 'interface' || /sensor-(bridge|rack)/.test(key)) {
      step = 5
      if (key === 'sensor-bridge') offset[0] = .8
      else if (key === 'lidar') offset.splice(0, 3, .45, .75, 0)
      else if (key === 'imu') offset.splice(0, 3, 0, .48, .55)
      else if (key.startsWith('ultrasonic')) offset[2] = side * .55
      else if (key === 'wireless') offset.splice(0, 3, -.5, .35, 0)
      else if (key === 'ports') offset[0] = -.4
      else if (key === 'sensor-rack') offset[1] = .28
    } else {
      if (key === 'frame') offset[1] = .25
      if (item.kind === 'cooling') offset[2] = side * .42
    }
  } else {
    const arm = /\/(left|right)-shoulder(\/|$)/.test(path)
    const leg = /\/(left|right)-leg(\/|$)/.test(path)
    if (path.includes('/battery')) { step = 5; if (key === 'battery') offset.splice(0, 3, -.8, .3, 0) }
    else if (path.includes('/controller')) { step = 4; if (key === 'controller') offset.splice(0, 3, .8, .38, 0) }
    else if (path.includes('/head')) {
      step = /\/(shell|face)(\/|$)/.test(path) || key === 'status' ? 1 : 2
      if (key === 'shell') offset[1] = .65
      else if (key === 'face' || key === 'status') offset.splice(0, 3, .5, .18, 0)
      else if (key === 'optical-rack') offset.splice(0, 3, .42, .25, 0)
      else if (key === 'lidar') offset.splice(0, 3, -.3, .45, 0)
      else if (/stereo|depth|voice/.test(key)) offset.splice(0, 3, .65, .16, key.includes('stereo') ? side * .12 : 0)
    } else if (arm || leg) {
      step = /^(motor|reducer)$/.test(key) ? 10 : leg ? 9 : path.includes('/palm') ? 7 : 6
      if (key.endsWith('-shoulder')) offset.splice(0, 3, 0, .12, side * .65)
      else if (key.endsWith('-leg')) offset.splice(0, 3, 0, .12, side * .42)
      else if (key === 'palm') offset.splice(0, 3, .25, .07, side * .16)
      else if (key === 'motor') offset[2] = side * .3
      else if (key === 'reducer') offset[2] = side * .52
      else if (key.endsWith('-shell')) offset[2] = side * .2
    } else if (item.kind === 'shell' || item.kind === 'cooling' || item.kind === 'interface') {
      step = 3
      if (key.startsWith('chest-shell')) offset[2] = side * .6
      else offset[0] = /back|cooling|ports/.test(key) ? -.6 : .6
    } else if (key === 'waist') offset[1] = .26
  }
  return { step, offset }
}

export function englishPartName(item: RobotPart) {
  const key = item.id.split('/').at(-1)!
  const names: Record<string, string> = { body: 'Main assembly', roof: 'Top enclosure', belly: 'Bottom guard', battery: 'Battery pack', bms: 'Battery management board', cover: 'Battery cover', controller: 'Main controller', imu: 'Inertial measurement unit', lidar: '360 degree LiDAR', depth: 'Depth camera', motor: 'Joint motor', reducer: 'Planetary reducer', waist: 'Waist joint', neck: 'Neck joint', head: 'Head frame', face: 'Vision visor', palm: 'Palm', foot: 'Foot', hip: 'Hip joint', knee: 'Knee joint', ankle: 'Ankle joint' }
  return names[key] ?? key.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}
