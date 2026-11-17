import type { RobotDefinition, RobotId, RobotAction } from '@/types/robot'
import { joints } from './joints'

/** 原创概念机的演示设定，不是厂商规格或动力学测量。 */
export const robots: Record<RobotId, RobotDefinition> = {
  quadruped: { batteryWh: 420, nominalVoltage: 48, payloadKg: 5, referencePower: 140, structure: '四条独立三轴腿链 · 承载躯干', locomotion: '四拍行走 / 对角小跑 / 前后足组奔跑', sensors: '双目 / 深度 / 雷达 / IMU / 超声波', applications: '工厂巡检、安防巡逻、复杂地形、搜救', id: 'quadruped', name: 'RV K1', serial: 'RV-SIM-001', category: '四足机器人', description: '灵活、稳定，探索四足运动的可能性。', drivenAxes: joints.quadruped.length, mass: 28, maxSpeed: 2.5, actions: ['idle', 'stand', 'walk', 'backward', 'trot', 'run', 'turnLeft', 'turnRight', 'sit', 'jump', 'crouch', 'climb', 'balance', 'shake'] },
  humanoid: { batteryWh: 600, nominalVoltage: 48, payloadKg: 3, referencePower: 240, structure: '双足 + 双臂 + 腰颈 + 独立五指', locomotion: '双足交替 / 躯干补偿 / 协调摆臂', sensors: '双目 / 深度 / 雷达 / IMU / 足底传感器', applications: '物品抓取、仓库搬运、人机交互', id: 'humanoid', name: 'RV H1', serial: 'RV-SIM-002', category: '人形机器人', description: '从双足步态到灵巧手，探索协调的机械运动。', drivenAxes: joints.humanoid.length, mass: 47, maxSpeed: 1.8, actions: ['idle', 'stand', 'walk', 'backward', 'run', 'turnLeft', 'turnRight', 'wave', 'raiseArms', 'crouch', 'bend', 'pickUp', 'carry', 'handshake', 'point', 'grip', 'openHand'] },
}

export const actions: Record<RobotAction, { label: string; english: string; icon: string; description: string; duration: number; animated: boolean }> = {
  idle: { label: '自然待机', english: 'Idle', icon: 'robot', description: '轻微重心调整，足端保持支撑。', duration: 4, animated: true },
  stand: { label: '站立', english: 'Stand', icon: 'stand', description: '恢复中立站姿，全部关节平滑回正。', duration: 0, animated: false },
  walk: { label: '行走', english: 'Walk', icon: 'walk', description: '明确区分支撑与摆动相；四足依次抬足，双足交替并协调摆臂。', duration: 3, animated: true },
  backward: { label: '后退', english: 'Walk Backward', icon: 'walk', description: '反向足端轨迹，保持原地协调步态。', duration: 3, animated: true },
  trot: { label: '小跑', english: 'Trot', icon: 'activity', description: '对角足同步交替，与四拍行走步态区分。', duration: 2.5, animated: true },
  run: { label: '奔跑', english: 'Run', icon: 'activity', description: '提高步频和抬足高度；四足采用前后足组交替，双足增加腾空相。', duration: 2.5, animated: true },
  turnLeft: { label: '左转', english: 'Turn Left', icon: 'turnLeft', description: '小幅交替迈步并连续向左调整朝向。', duration: 2, animated: true },
  turnRight: { label: '右转', english: 'Turn Right', icon: 'turnRight', description: '小幅交替迈步并连续向右调整朝向。', duration: 2, animated: true },
  sit: { label: '坐下', english: 'Sit', icon: 'crouch', description: '后腿弯曲、机身后移，前腿维持支撑。', duration: 0, animated: false },
  jump: { label: '跳跃', english: 'Jump', icon: 'bolt', description: '蓄力下蹲、起跳、腾空收腿、落地缓冲、恢复站姿。', duration: 3, animated: true },
  crouch: { label: '下蹲', english: 'Squat / Crouch', icon: 'crouch', description: '降低机身重心，由 IK 保持足端接触。', duration: 0, animated: false },
  climb: { label: '台阶步态', english: 'Climb', icon: 'layers', description: '原地练习抬足、踏上与下落轨迹；场景阶梯任务在阶段七实现。', duration: 4, animated: true },
  balance: { label: '动态平衡', english: 'Balance', icon: 'target', description: '机身侧倾与俯仰时，各腿由 IK 补偿支撑高度。', duration: 4, animated: true },
  shake: { label: '身体晃动', english: 'Shake', icon: 'activity', description: '连续晃动承载躯干，关节补偿足端位置。', duration: 3, animated: true },
  wave: { label: '挥手', english: 'Wave', icon: 'hand', description: '右肩、肘与腕协同招手，右手张开。', duration: 3, animated: true },
  raiseArms: { label: '举起双臂', english: 'Raise Arms', icon: 'person', description: '双肩对称举起，肘腕与张开的五指保持自然姿态。', duration: 0, animated: false },
  bend: { label: '弯腰', english: 'Bend', icon: 'crouch', description: '腰部前屈并后移重心，双腿保持支撑。', duration: 0, animated: false },
  pickUp: { label: '抓取演示', english: 'Pick Up', icon: 'hand', description: '弯腰、伸手、合指、抬臂的完整动作序列；物品交互在阶段七实现。', duration: 5, animated: true },
  carry: { label: '搬运姿态', english: 'Carry', icon: 'cube', description: '双臂托举、双手闭合并低速交替迈步；对象搬运在阶段七实现。', duration: 4, animated: true },
  handshake: { label: '握手', english: 'Handshake', icon: 'hand', description: '右臂末端伸向前方，手指半握并小幅上下运动。', duration: 3, animated: true },
  point: { label: '指向', english: 'Point', icon: 'target', description: '右臂向前伸展，仅食指伸直，其余指节闭合。', duration: 0, animated: false },
  grip: { label: '抓握', english: 'Grip', icon: 'hand', description: '双手各指根、指间关节逐步闭合成抓握姿态。', duration: 0, animated: false },
  openHand: { label: '张开手掌', english: 'Open Hand', icon: 'hand', description: '双手五指展开，保持腕部与手臂独立。', duration: 0, animated: false },
}
