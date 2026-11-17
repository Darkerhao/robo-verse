import type { EnvironmentPart } from './perception'
import type { MissionDefinition, MissionId, MissionObject, MissionSceneDefinition, MissionSceneId, MissionStep } from '@/types/mission'
import type { RobotAction, Vector3Tuple } from '@/types/robot'

const box = (center: Vector3Tuple, size: Vector3Tuple): EnvironmentPart => ({ center, size })
const object = (id: string, name: string, category: MissionObject['category'], center: Vector3Tuple, size: Vector3Tuple, color?: string): MissionObject => ({ id, name, category, parts: [box(center, size)], color })
const ground = () => object('ground', '任务场地', 'ground', [0, -.025, 0], [12, .05, 10], '#162333')
function person(center: Vector3Tuple): MissionObject {
  const [x, , z] = center
  return { id: 'person', name: '模拟人员', category: 'person', parts: [
    { center: [x, 1.63, z], size: [.28, .28, .28], sphere: true }, box([x, 1.15, z], [.34, .65, .26]),
    box([x, .44, z - .1], [.19, .88, .13]), box([x, .44, z + .1], [.19, .88, .13]),
    box([x, 1.1, z - .25], [.12, .58, .12]), box([x, 1.1, z + .25], [.12, .58, .12]),
  ] }
}
const rack = (x: number, z: number, id: string): MissionObject => ({ id, name: '仓储货架', category: 'equipment', color: '#627588', parts: [
  ...[-.9, .9].flatMap(dx => [-.35, .35].map(dz => box([x + dx, 1.05, z + dz], [.08, 2.1, .08]))),
  ...[.15, .95, 1.75].map(y => box([x, y, z], [1.9, .07, .8])),
  box([x, .55, z], [1.15, .7, .58]), box([x + .3, 1.35, z], [.7, .7, .58]),
] })
const workObjects = (): MissionObject[] => [
  object('payload', '待搬运箱体', 'box', [-2, 1.12, 0], [.22, .2, .54], '#d1a16a'),
  { ...object('source', '取物支架', 'equipment', [-2, .51, 0], [.12, 1.02, .6]), support: true },
  { ...object('destination', '放置支架', 'equipment', [3, .51, 0], [.12, 1.02, .6]), support: true },
]
// 台阶与可行走表面共用这些尺寸，0.08 m 的每级高度保留当前机械腿的可达空间。
export const stairTreads = [-1.6, -.8, 0, .8].map((x, index) => ({ x, height: [ .08, .16, .16, .08 ][index]!, width: .8 }))
export const missionScenes: Record<MissionSceneId, MissionSceneDefinition> = {
  factory: { id: 'factory', name: '智能工厂', caption: '设备巡检 / 异常定位', color: '#43e5ff', light: '#b9dfff', zones: [], objects: [ground(),
    object('pump', '冷却泵组', 'equipment', [2.8, .75, -2.8], [1.2, 1.5, 1]),
    { ...object('cabinet', '配电控制柜', 'equipment', [2.8, 1, 2.8], [1, 2, .8]), anomaly: '控制柜温升异常（预设仿真故障）' },
    object('pipeline', '输送管线', 'equipment', [-1, 1.1, -4.35], [6, .3, .25]),
    object('machine', '生产单元', 'equipment', [-1, .7, 4.5], [3, 1.4, .75]),
  ] },
  warehouse: { id: 'warehouse', name: '现代仓库', caption: '双手抓握 / 定点配送', color: '#ffba67', light: '#ffe2ba', zones: [], objects: [ground(), ...workObjects(), rack(-2, -3.2, 'rack-a'), rack(2, 3.3, 'rack-b')] },
  laboratory: { id: 'laboratory', name: '科技实验室', caption: '目标识别 / 精细操作 / 人机交互', color: '#816cff', light: '#d6ccff', zones: [], objects: [ground(), ...workObjects(), person([2.7, 0, -3]),
    object('bench', '实验仪器台', 'equipment', [-1, .65, 3.6], [4, 1.3, .8]), object('console', '实验控制台', 'equipment', [4.4, .8, 3.4], [.8, 1.6, 1]),
  ] },
  road: { id: 'road', name: '室外巡检道路', caption: '人员检测 / 异常区域巡逻', color: '#39f5b5', light: '#fff1d5', zones: [{ min: [2.6, 0, -4.4], max: [4.5, .02, -2] }], objects: [ground(),
    { ...person([3.4, 0, -3]), anomaly: '人员进入预设警戒区域' },
    object('fence', '道路护栏', 'obstacle', [0, .4, 4.3], [9, .8, .12]),
    object('power', '路侧巡检设备', 'equipment', [3.7, .8, 3], [.7, 1.6, .7]),
    ...[-3, 0, 3].map((x, i) => object(`lamp-${i}`, '道路灯柱', 'equipment', [x, 1.5, -4.6], [.1, 3, .1])),
  ] },
  stairs: { id: 'stairs', name: '楼梯训练场', caption: '上下台阶 / 越障 / 狭窄通道', color: '#43e5ff', light: '#c9ecff', zones: [], objects: [ground(),
    { id: 'steps', name: '双向训练阶梯', category: 'stairs', parts: stairTreads.map(t => box([t.x + t.width / 2, t.height / 2, 0], [t.width, t.height, 2.4])) },
    object('hurdle', '低矮越障训练条', 'stairs', [2.6, .035, 0], [.18, .07, 2.4]),
    object('lane-left', '通道左边界', 'obstacle', [2.6, .25, -1.45], [2, .5, .12]),
    object('lane-right', '通道右边界', 'obstacle', [2.6, .25, 1.45], [2, .5, .12]),
  ] },
  obstacles: { id: 'obstacles', name: '障碍物训练场', caption: '废墟搜索 / 安全返航', color: '#ff788a', light: '#dce3ef', zones: [], objects: [ground(),
    object('rubble-a', '废墟障碍 A', 'obstacle', [-.4, .55, 0], [1.2, 1.1, 2]),
    object('rubble-b', '废墟障碍 B', 'obstacle', [2.8, .35, 2.6], [1.4, .7, 1.1]),
    person([3, 0, -2.8]),
  ] },
}
const move = (name: string, goal: Vector3Tuple, action: RobotAction = 'walk'): MissionStep => ({ name, kind: 'move', action, goal })
const scan = (name: string, target: string): MissionStep => ({ name, kind: 'scan', action: 'stand', duration: 2, target })
const action = (name: string, motion: RobotAction, duration = 2.5): MissionStep => ({ name, kind: 'action', action: motion, duration })
const manipulation = (carry: boolean): MissionStep[] => [
  scan('识别待取箱体', 'payload'),
  move('靠近已识别箱体', [-2.84, 0, 0]),
  { name: '弯腰并张开双手', kind: 'reach', action: 'bend', duration: 2, target: 'payload' },
  { name: '闭合手指并建立抓握', kind: 'grasp', action: 'grip', duration: 1.2, target: 'payload' },
  { name: '抬起箱体并站立', kind: 'lift', action: 'grip', duration: 2 },
  move(carry ? '沿仓库通道搬运' : '将物品移至放置位置', [2.16, 0, 0], 'carry'),
  { name: '弯腰对准放置支架', kind: 'place', action: 'bend', duration: 2, target: 'destination', heading: 0 },
  { name: '松开手指并放置箱体', kind: 'release', action: 'openHand', duration: 1.2 },
  action('收回双臂，确认放置结果', 'stand', 1.5),
]
export const missions: Record<MissionId, MissionDefinition> = {
  inspection: { id: 'inspection', name: '工业巡检', scene: 'factory', robot: 'quadruped', description: '巡查两组设备，记录预设异常，生成结果并返回起点。', start: [-4.3, 0, 0], steps: [
    move('前往冷却泵组', [.3, 0, -2.8]), scan('扫描冷却泵组', 'pump'), move('前往配电控制柜', [.3, 0, 2.8]), scan('识别配电柜异常', 'cabinet'), move('返回巡检起点', [-4.3, 0, 0]),
  ] },
  patrol: { id: 'patrol', name: '安防巡逻', scene: 'road', robot: 'quadruped', description: '沿道路巡逻，检测警戒区域人员，记录事件并返回。', start: [-4.3, 0, 0], steps: [move('抵达道路巡逻点', [.5, 0, -2.8]), scan('检查警戒区域人员', 'person'), move('巡查道路设备', [1.2, 0, 2.8]), scan('扫描路侧设备', 'power'), move('返回巡逻起点', [-4.3, 0, 0])] },
  terrain: { id: 'terrain', name: '复杂地形', scene: 'stairs', robot: 'quadruped', description: '逐足适应台阶高度，上下阶梯、越过低障碍并通过狭窄通道。', start: [-4.3, 0, 0], steps: [move('接近阶梯', [-2.6, 0, 0]), move('攀登训练阶梯', [0, 0, 0], 'climb'), action('台阶上动态平衡', 'balance', 3), move('下阶梯并跨越低障碍', [3.8, 0, 0], 'climb'), action('通道出口恢复站立', 'stand', 1.5)] },
  rescue: { id: 'rescue', name: '搜救任务', scene: 'obstacles', robot: 'quadruped', description: '绕开废墟障碍，发现并标记人员位置，返回安全区域。', start: [-4.3, 0, 0], steps: [move('绕行废墟搜索', [.6, 0, -2.8]), scan('识别并标记待救援人员', 'person'), move('返回安全区域', [-4.3, 0, 0])] },
  pick: { id: 'pick', name: '物品抓取', scene: 'laboratory', robot: 'humanoid', description: '识别支架上的箱体，以双臂 IK 抓取并移至指定支架。', start: [-3.5, 0, 0], steps: manipulation(false) },
  transport: { id: 'transport', name: '仓库搬运', scene: 'warehouse', robot: 'humanoid', description: '接近箱体，弯腰抓握、站立搬运，完成定点放置。', start: [-4.5, 0, 0], steps: [move('靠近取货支架', [-3.5, 0, 0]), ...manipulation(true)] },
  interaction: { id: 'interaction', name: '人机交互', scene: 'laboratory', robot: 'humanoid', description: '模拟人员接近，识别后挥手，再指向实验台完成引导。', start: [.3, 0, -3], steps: [
    { name: '等待人员接近', kind: 'approach', action: 'stand', duration: 3, target: 'person', goal: [1.9, 0, -3] },
    scan('识别接近人员', 'person'), action('挥手欢迎', 'wave', 3), { ...action('指向实验台', 'point', 3), target: 'bench' }, action('交互完成，恢复待机', 'stand', 1.5),
  ] },
}
export const sceneMissions = (scene: MissionSceneId) => Object.values(missions).filter(mission => mission.scene === scene)

/** 足端实体覆盖范围的最高表面，避免脚掌中心尚未跨过棱边时穿入台阶立面。 */
export function terrainHeight(x: number, z: number) {
  if (Math.abs(z) > 1.2) return 0
  return Math.max(0, ...stairTreads.filter(t => x + .13 >= t.x && x - .13 <= t.x + t.width).map(t => t.height), Math.abs(x - 2.6) <= .22 ? .07 : 0)
}
