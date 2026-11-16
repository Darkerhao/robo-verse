import { armDimensions, endEffectors, joints, rigs } from '@/config/joints'
import { actions } from '@/config/robots'
import type { EndEffector, RobotAction, RobotId, RobotPose, RobotState, Vector3Tuple } from '@/types/robot'

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const smoothStep = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t
export const isTurning = (action: RobotAction) => action === 'turnLeft' || action === 'turnRight'
export const isMoving = (action: RobotAction) => ['walk', 'backward', 'trot', 'run', 'climb', 'carry', 'turnLeft', 'turnRight'].includes(action)

/** 限制求解半径，折叠与过伸目标也产生有限角度；用户 IK 另行校验实际可达性。 */
export function solveLeg(x: number, depth: number, upper: number, lower: number): [number, number] {
  const distance = clamp(Math.hypot(x, depth), Math.abs(upper - lower) + .001, upper + lower - .001)
  const knee = Math.PI - Math.acos(clamp((upper * upper + lower * lower - distance * distance) / (2 * upper * lower), -1, 1))
  const hip = Math.atan2(x, depth) - Math.acos(clamp((upper * upper + distance * distance - lower * lower) / (2 * upper * distance), -1, 1))
  return [hip, knee]
}

export function neutralPose(id: RobotId): RobotPose {
  const rig = rigs[id]
  const pose: RobotPose = { position: [0, rig.height, 0], roll: 0, pitch: 0, joints: joints[id].map(joint => joint.neutral) }
  for (const effector of endEffectors[id].filter(item => item.kind === 'foot')) {
    const [hip, knee] = solveLeg(0, rig.height + rig.hipY - rig.footHeight, rig.upper, rig.lower)
    const [a, b, c] = effector.indices
    pose.joints[a!] = hip; pose.joints[b!] = knee; pose.joints[c!] = -hip - knee
  }
  return pose
}

export function copyPose(pose: RobotPose): RobotPose {
  return { position: [...pose.position], roll: pose.roll, pitch: pose.pitch, joints: [...pose.joints] }
}

export function constrainPose(id: RobotId, pose: RobotPose) {
  pose.joints = pose.joints.map((angle, index) => clamp(angle, joints[id][index]!.min, joints[id][index]!.max))
  return pose
}

/** 末端坐标相对于选中髋/肩关节，+X 前方、+Y 上方、+Z 右方；手臂末端为掌心。 */
export function forwardEndEffector(id: RobotId, pose: RobotPose, effector: EndEffector): Vector3Tuple {
  const [a, b, c] = effector.indices.map(index => pose.joints[index]!)
  if (effector.kind === 'foot') {
    const { upper, lower } = rigs[id]
    return [upper * Math.sin(a!) + lower * Math.sin(a! + b!), -upper * Math.cos(a!) - lower * Math.cos(a! + b!), 0]
  }
  const lower = armDimensions.forearm + armDimensions.palm
  const x = armDimensions.upper * Math.sin(a!) + lower * Math.sin(a! + c!)
  const depth = armDimensions.upper * Math.cos(a!) + lower * Math.cos(a! + c!)
  return [x, -depth * Math.cos(b!), -depth * Math.sin(b!)]
}

export function inverseEndEffector(id: RobotId, pose: RobotPose, effector: EndEffector, target: Vector3Tuple): RobotPose {
  const result = copyPose(pose)
  const [a, b, c] = effector.indices
  if (effector.kind === 'foot') {
    const rig = rigs[id], [hip, knee] = solveLeg(target[0], -target[1], rig.upper, rig.lower)
    result.joints[a!] = hip; result.joints[b!] = knee; result.joints[c!] = -hip - knee
  } else {
    const [shoulder, elbow] = solveLeg(target[0], Math.hypot(target[1], target[2]), armDimensions.upper, armDimensions.forearm + armDimensions.palm)
    result.joints[a!] = shoulder
    result.joints[b!] = Math.atan2(-target[2], -target[1])
    result.joints[c!] = elbow
  }
  return constrainPose(id, result)
}

export function worldFoot(id: RobotId, pose: RobotPose, index: number): Vector3Tuple {
  const rig = rigs[id], effector = endEffectors[id][index]!
  const [x, y] = forwardEndEffector(id, pose, effector)
  const [hx, hz] = rig.hips[index]!
  const lx = hx! + x, ly = rig.hipY + y
  const px = Math.cos(pose.pitch) * lx - Math.sin(pose.pitch) * ly
  const py = Math.sin(pose.pitch) * lx + Math.cos(pose.pitch) * ly
  return [pose.position[0] + px, pose.position[1] + Math.cos(pose.roll) * py - Math.sin(pose.roll) * hz!, pose.position[2] + Math.sin(pose.roll) * py + Math.cos(pose.roll) * hz!]
}

/** 在倾斜的机身坐标中解足端 X/Y，再由踝轴抵消俯仰，保留支撑相接触高度。 */
function placeFoot(id: RobotId, pose: RobotPose, index: number, x: number, y: number) {
  const rig = rigs[id], [hx, hz] = rig.hips[index]!
  const relativeX = x - pose.position[0]
  const relativeY = (y - pose.position[1] + Math.sin(pose.roll) * hz!) / Math.cos(pose.roll)
  const localX = Math.cos(pose.pitch) * relativeX + Math.sin(pose.pitch) * relativeY - hx!
  const localY = -Math.sin(pose.pitch) * relativeX + Math.cos(pose.pitch) * relativeY - rig.hipY
  const [hip, knee] = solveLeg(localX, -localY, rig.upper, rig.lower)
  const [a, b, c] = endEffectors[id][index]!.indices
  pose.joints[a!] = hip; pose.joints[b!] = knee; pose.joints[c!] = -pose.pitch - hip - knee
}

/** 过渡先混合机身与实际足端位置，再解 IK，避免直接混合腿角度时脚掌下沉。 */
export function blendPoses(id: RobotId, from: RobotPose, to: RobotPose, amount: number, keepFeet = true): RobotPose {
  const t = clamp(amount, 0, 1)
  if (t === 0) return copyPose(from)
  if (t === 1) return copyPose(to)
  const result: RobotPose = {
    position: from.position.map((value, index) => mix(value, to.position[index]!, t)) as Vector3Tuple,
    roll: mix(from.roll, to.roll, t), pitch: mix(from.pitch, to.pitch, t),
    joints: from.joints.map((angle, index) => mix(angle, to.joints[index]!, t)),
  }
  if (keepFeet) rigs[id].hips.forEach((_, index) => {
    const a = worldFoot(id, from, index), b = worldFoot(id, to, index)
    placeFoot(id, result, index, mix(a[0], b[0], t), mix(a[1], b[1], t))
  })
  return constrainPose(id, result)
}

/** 支撑相缓慢向后，摆动相向前并抬足；端点速度为零，整周期连续。 */
export function gaitFoot(phase: number, stride: number, height: number, duty: number): [number, number] {
  const p = ((phase / (Math.PI * 2)) % 1 + 1) % 1
  if (p < duty) return [stride * (1 - 2 * smoothStep(p / duty)), 0]
  const swing = (p - duty) / (1 - duty)
  return [stride * (2 * smoothStep(swing) - 1), height * Math.sin(Math.PI * swing) ** 2]
}

function curve(progress: number, values: [number, number][]) {
  for (let i = 1; i < values.length; i++) {
    const [end, value] = values[i]!, [start, previous] = values[i - 1]!
    if (progress <= end) return mix(previous, value, smoothStep((progress - start) / (end - start)))
  }
  return values.at(-1)![1]
}

/** 所有动作只在这里产生姿态；Three.js、控制台与遥测读取相同关节数组。 */
export function motionPose(state: RobotState): RobotPose {
  const { id, action, phase, speed } = state, rig = rigs[id]
  let pose = neutralPose(id)
  if (action === 'stand') return pose
  const moving = isMoving(action) && speed > .001
  const turning = isTurning(action)
  const progress = actions[action].duration ? (state.actionTime % actions[action].duration) / actions[action].duration : 0
  const set = (key: string, value: number) => { const index = joints[id].findIndex(joint => joint.id === key); pose.joints[index] = value }
  const hand = (side: string, closure: number, pointing = false) => {
    for (let finger = 1; finger <= 5; finger++) for (let segment = 0; segment < (finger === 5 ? 2 : 3); segment++) {
      set(`${side}.finger${finger}.${segment}`, pointing && finger === 1 ? 0 : closure * (finger === 5 ? .85 : [.95, 1.05, .75][segment]!))
    }
  }
  if (action === 'idle') { pose.position[1] += Math.sin(phase) * .004; pose.pitch = Math.sin(phase * .5) * .012 }
  if (moving) {
    pose.position[1] += Math.sin(phase * 2) * (action === 'run' ? .018 : .006)
    pose.roll = Math.sin(phase) * (id === 'humanoid' ? .015 : .008)
    pose.pitch = Math.cos(phase * 2) * (action === 'run' ? .025 : .009)
    if (id === 'humanoid') pose.position[2] = Math.sin(phase) * .018
  }
  if (action === 'crouch') pose.position[1] -= id === 'quadruped' ? .18 : .21
  if (action === 'sit') { pose.position[1] -= .19; pose.position[0] = -.06; pose.pitch = .22 }
  if (action === 'balance' || action === 'shake') {
    pose.roll = Math.sin(phase * (action === 'shake' ? 2 : 1)) * .065
    pose.pitch = Math.sin(phase * 2) * .045
    pose.position[0] = Math.sin(phase) * .035
  }
  let flight = 0
  if (action === 'jump') {
    const compression = curve(progress, [[0, 0], [.25, 1], [.38, 0], [.72, 0], [.84, .8], [1, 0]])
    const airborne = clamp((progress - .38) / .34, 0, 1)
    flight = progress > .38 && progress < .72 ? 4 * airborne * (1 - airborne) : 0
    pose.position[1] += -.17 * compression + .34 * flight
  }
  if (id === 'humanoid') {
    if (moving && action !== 'carry') {
      for (const [index, side] of ['left', 'right'].entries()) {
        set(`${side}.shoulder.pitch`, Math.cos(phase + index * Math.PI) * Math.min(.5, speed * .32) * (action === 'backward' ? -1 : 1))
        set(`${side}.elbow`, action === 'run' ? .7 : .25)
      }
      set('waist.yaw', Math.sin(phase) * .035)
    }
    if (action === 'wave') {
      set('right.shoulder.spread', -2.25); set('right.shoulder.pitch', -.18)
      set('right.elbow', .6 + Math.sin(phase * 2) * .2); set('right.wrist', Math.sin(phase * 2) * .38)
      set('neck.yaw', -.18); hand('right', 0)
    }
    if (action === 'raiseArms') for (const [index, side] of ['left', 'right'].entries()) {
      set(`${side}.shoulder.spread`, index === 0 ? 2.55 : -2.55); set(`${side}.elbow`, .16); hand(side, 0)
    }
    if (action === 'bend') { set('waist.bend', -.52); pose.position[0] = -.04; pose.position[1] -= .04 }
    if (action === 'pickUp') {
      const reach = curve(progress, [[0, 0], [.3, 1], [.56, 1], [.85, 0], [1, 0]])
      const closure = curve(progress, [[0, 0], [.36, 0], [.48, 1], [.85, 1], [1, 0]])
      set('waist.bend', -.62 * reach); pose.position[1] -= .14 * reach; pose.position[0] = -.035 * reach
      const effector = endEffectors.humanoid.find(item => item.id === 'right-hand')!
      pose = inverseEndEffector(id, pose, effector, [.20 + .36 * reach, -.56 + .18 * reach, .045])
      hand('right', closure)
    }
    if (action === 'carry' || action === 'grip' || action === 'openHand') {
      for (const side of ['left', 'right']) {
        set(`${side}.shoulder.pitch`, .2); set(`${side}.elbow`, 1.1)
        hand(side, action === 'openHand' ? 0 : 1)
      }
    }
    if (action === 'point') {
      set('right.shoulder.pitch', 1.48); set('right.elbow', .12)
      set('right.shoulder.spread', -.1); set('neck.yaw', -.1); hand('right', 1, true)
    }
    if (action === 'handshake') {
      const effector = endEffectors.humanoid.find(item => item.id === 'right-hand')!
      pose = inverseEndEffector(id, pose, effector, [.42, -.25 + Math.sin(phase * 2) * .035, .065])
      hand('right', .4)
    }
  }
  rig.hips.forEach(([hx], index) => {
    let x = hx!, y = rig.footHeight
    if (moving) {
      const offsets = id === 'humanoid' ? [0, .5] : action === 'trot' ? [0, .5, .5, 0] : action === 'run' ? [0, .5, 0, .5] : [0, .5, .75, .25]
      const duty = action === 'run' ? .42 : action === 'trot' ? .56 : id === 'quadruped' ? .76 : .64
      const [stride, lift] = gaitFoot(phase + offsets[index]! * Math.PI * 2, Math.min(.25, speed * (turning ? .1 : .16)), Math.min(1, speed / .5) * (action === 'climb' ? .22 : action === 'run' ? .15 : .09), duty)
      x += stride * (action === 'backward' ? -1 : 1)
      y += lift
    }
    if (action === 'sit') x += index % 2 === 0 ? .06 : -.035
    if (action === 'jump') y += .42 * flight
    placeFoot(id, pose, index, x, y)
  })
  return constrainPose(id, pose)
}
