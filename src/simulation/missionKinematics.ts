import { Euler, Matrix4, Vector3 } from 'three'
import { armDimensions, endEffectors, joints, rigs } from '@/config/joints'
import { terrainHeight } from '@/config/missions'
import type { RobotPose, RobotState, Vector3Tuple } from '@/types/robot'
import { constrainPose, forwardEndEffector, inverseEndEffector, placeFoot, worldFoot } from './kinematics'

const matrix = (position: Vector3Tuple, x = 0, y = 0, z = 0) => new Matrix4().makeRotationFromEuler(new Euler(x, y, z)).setPosition(...position)
const angle = (pose: RobotPose, id: string) => pose.joints[joints.humanoid.findIndex(joint => joint.id === id)]!
function shoulderFrame(robot: RobotState, pose: RobotPose, side: number) {
  return matrix(robot.worldPosition, 0, -robot.heading * Math.PI / 180)
    .multiply(matrix(pose.position, pose.roll, 0, pose.pitch))
    .multiply(matrix([0, .14, 0], 0, angle(pose, 'waist.yaw'), angle(pose, 'waist.bend')))
    .multiply(matrix([0, .335, side * .27]))
}
/** 与模型的掌心节点逐层同构，用于抓握约束；没有第二套关节状态。 */
export function handWorld(robot: RobotState, pose: RobotPose, side: number): Vector3Tuple {
  const key = side < 0 ? 'left' : 'right'
  const transform = shoulderFrame(robot, pose, side)
    .multiply(matrix([0, 0, 0], angle(pose, `${key}.shoulder.spread`), 0, angle(pose, `${key}.shoulder.pitch`)))
    .multiply(matrix([0, -armDimensions.upper, 0], 0, 0, angle(pose, `${key}.elbow`)))
    .multiply(matrix([0, -armDimensions.forearm, 0], 0, angle(pose, `${key}.wrist`)))
  return new Vector3(0, -armDimensions.palm, 0).applyMatrix4(transform).toArray()
}
export function heldPosition(robot: RobotState, pose: RobotPose): Vector3Tuple {
  const left = handWorld(robot, pose, -1), right = handWorld(robot, pose, 1), yaw = robot.heading * Math.PI / 180
  return [(left[0] + right[0]) / 2 + .11 * Math.cos(yaw), (left[1] + right[1]) / 2, (left[2] + right[2]) / 2 + .11 * Math.sin(yaw)]
}
export function setFingers(pose: RobotPose, closure: number) {
  joints.humanoid.forEach((joint, index) => { if (joint.id.includes('.finger')) pose.joints[index] = Math.min(joint.max, closure * .9) })
}
export function reachPayload(robot: RobotState, pose: RobotPose, target: Vector3Tuple, closure: number, bend = .35) {
  pose.position = [0, rigs.humanoid.height - .10 * bend / .35, 0]; pose.roll = 0; pose.pitch = 0
  pose.joints[joints.humanoid.findIndex(joint => joint.id === 'waist.bend')] = -bend
  pose.joints[joints.humanoid.findIndex(joint => joint.id === 'waist.yaw')] = 0
  rigs.humanoid.hips.forEach(([x], i) => placeFoot('humanoid', pose, i, x!, rigs.humanoid.footHeight))
  const yaw = robot.heading * Math.PI / 180
  for (const effector of endEffectors.humanoid.filter(item => item.kind === 'hand')) {
    const targetWorld = new Vector3(target[0] - .11 * Math.cos(yaw) - effector.side * .27 * Math.sin(yaw), target[1], target[2] - .11 * Math.sin(yaw) + effector.side * .27 * Math.cos(yaw))
    const local = targetWorld.applyMatrix4(shoulderFrame(robot, pose, effector.side).invert()).toArray()
    pose = inverseEndEffector('humanoid', pose, effector, local)
    // 工作空间约束由同一 FK 验证，不能通过钳制关节伪造成功抓取。
    if (Math.hypot(...forwardEndEffector('humanoid', pose, effector).map((v, i) => v - local[i]!)) > .015) throw new Error('目标超出双臂可达范围，请重置任务。')
  }
  setFingers(pose, closure)
  return pose
}
export function conformToTerrain(robot: RobotState, pose: RobotPose) {
  const yaw = robot.heading * Math.PI / 180
  const feet = rigs.quadruped.hips.map((_, index) => worldFoot('quadruped', pose, index))
  const heights = feet.map(foot => terrainHeight(robot.worldPosition[0] + foot[0] * Math.cos(yaw) - foot[2] * Math.sin(yaw), robot.worldPosition[2] + foot[0] * Math.sin(yaw) + foot[2] * Math.cos(yaw)))
  pose.position[1] += heights.reduce((sum, height) => sum + height, 0) / heights.length
  feet.forEach((foot, index) => placeFoot('quadruped', pose, index, foot[0], foot[1] + heights[index]!))
  return constrainPose('quadruped', pose)
}
