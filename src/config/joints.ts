import type { EndEffector, JointDefinition, RobotId } from '@/types/robot'

/** 模型、FK/IK、控制滑块和遥测共用一份机械尺寸与关节目录。角度单位为弧度。 */
export const rigs = {
  quadruped: { height: .78, hipY: -.07, upper: .37, lower: .39, footHeight: .06, hips: [[.51, -.33], [-.51, -.33], [.51, .33], [-.51, .33]] },
  humanoid: { height: 1.065, hipY: -.1, upper: .48, lower: .47, footHeight: .055, hips: [[0, -.14], [0, .14]] },
}
export const armDimensions = { upper: .37, forearm: .29, palm: .065 }

function catalog(id: RobotId) {
  const result: JointDefinition[] = []
  const effectors: EndEffector[] = []
  function add(key: string, name: string, group: string, path: string, axis: JointDefinition['axis'], min: number, max: number, neutral = 0) {
    result.push({ id: key, name, group, path: `${id}/body/${path}`, axis, min, max, neutral })
    return result.length - 1
  }
  const legs = id === 'quadruped' ? [['front-left', '前左腿'], ['rear-left', '后左腿'], ['front-right', '前右腿'], ['rear-right', '后右腿']] : [['left-leg', '左腿'], ['right-leg', '右腿']]
  for (const [index, [key, label]] of legs.entries()) {
    const path = `${key}/hip`
    const indices = [
      add(`${key}.hip`, `${label}髋关节`, label!, path, 'z', -1.65, 1.15),
      add(`${key}.knee`, `${label}膝关节`, label!, `${path}/knee`, 'z', .04, 2.45),
      add(`${key}.ankle`, `${label}${id === 'quadruped' ? '足端调平' : '踝关节'}`, label!, `${path}/knee/ankle`, 'z', -1.85, 1.25),
    ]
    effectors.push({ id: key!, name: `${label}足端`, kind: 'foot', indices, side: index < legs.length / 2 ? -1 : 1 })
  }
  if (id === 'humanoid') {
    add('waist.yaw', '腰部转向', '躯干', 'waist', 'y', -.6, .6)
    add('waist.bend', '腰部俯仰', '躯干', 'waist', 'z', -.72, .22)
    add('neck.yaw', '颈部转向', '躯干', 'waist/neck', 'y', -.8, .8)
    for (const side of [-1, 1]) {
      const key = side < 0 ? 'left' : 'right', label = side < 0 ? '左' : '右'
      const path = `waist/${key}-shoulder`, group = `${label}臂`
      const indices = [
        add(`${key}.shoulder.pitch`, `${label}肩前后摆动`, group, path, 'z', -.65, 2.65),
        add(`${key}.shoulder.spread`, `${label}肩侧向摆动`, group, path, 'x', side < 0 ? -.25 : -2.8, side < 0 ? 2.8 : .25, -side * .09),
        add(`${key}.elbow`, `${label}肘关节`, group, `${path}/elbow`, 'z', .02, 2.4, .18),
      ]
      add(`${key}.wrist`, `${label}腕部旋转`, group, `${path}/elbow/wrist`, 'y', -1.25, 1.25)
      effectors.push({ id: `${key}-hand`, name: `${label}手掌心`, kind: 'hand', indices, side })
      const palm = `${path}/elbow/wrist/palm`
      for (const [finger, name] of ['食指', '中指', '无名指', '小指', '拇指'].entries()) {
        const root = `${palm}/${finger === 4 ? 'thumb' : `finger-${finger + 1}`}`
        for (let segment = 0; segment < (finger === 4 ? 2 : 3); segment++) {
          const suffix = segment === 0 ? '' : segment === 1 ? '/hinge-1' : '/hinge-1/hinge-2'
          add(`${key}.finger${finger + 1}.${segment}`, `${label}手${name}${segment === 0 ? '指根' : `指间 ${segment}`}`, `${label}手`, root + suffix, 'z', 0, segment === 2 ? .8 : 1.15, .06)
        }
      }
    }
  }
  return { joints: result, effectors }
}

const catalogs = { quadruped: catalog('quadruped'), humanoid: catalog('humanoid') }
export const joints: Record<RobotId, JointDefinition[]> = { quadruped: catalogs.quadruped.joints, humanoid: catalogs.humanoid.joints }
export const endEffectors: Record<RobotId, EndEffector[]> = { quadruped: catalogs.quadruped.effectors, humanoid: catalogs.humanoid.effectors }
