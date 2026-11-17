import { missionScenes, missions } from '@/config/missions'
import { objectBounds, robotClearance } from '@/config/perception'
import type { PlannedRoute } from '@/config/perception'
import type { MissionCommand, MissionId, MissionState } from '@/types/mission'
import type { RobotAction, RobotPose, RobotState, Vector3Tuple } from '@/types/robot'
import { advanceRoute, pathLength, planPath } from './pathPlanning'
import { detectEnvironment, sensorPose } from './perception'
import { heldPosition, reachPayload, setFingers } from './missionKinematics'
import { blendPoses, clamp, copyPose, neutralPose, smoothStep } from './kinematics'

const emptyRoute = (start: Vector3Tuple): PlannedRoute => ({ status: 'idle', start: [...start], goal: [...start], path: [], waypoint: 1, length: 0, travelled: 0, replans: 0, message: '等待任务开始' })
function initialState(id: MissionId): MissionState {
  const definition = missions[id], objects = structuredClone(missionScenes[definition.scene].objects)
  return { active: false, id, status: 'ready', step: 0, stepElapsed: 0, elapsed: 0, progress: 0, message: '准备就绪，开始后自动执行任务。', events: [], result: null, route: emptyRoute(definition.start), detections: [], scanOrigin: null, objects, marked: [], attached: false, payloadPosition: objects.find(object => object.id === 'payload')?.parts[0]?.center ?? null, payloadHeading: 0, revision: 0 }
}

/** 只编排任务。动作、位姿、时间仍由 SimulationAdapter 持有；导航和识别复用既有算法。 */
export class MissionEngine {
  state = initialState('inspection')
  private entered = false
  private approachStart: Vector3Tuple | null = null
  private manipulationStart: RobotPose | null = null
  private payloadStart: Vector3Tuple | null = null
  constructor(private action: (robot: RobotState, action: RobotAction) => void) {}
  get definition() { return missions[this.state.id] }
  get running() { return this.state.active && this.state.status === 'running' }
  get ownsRobot() { return this.state.active && ['running', 'paused'].includes(this.state.status) }
  snapshot() { return structuredClone(this.state) }
  private event(message: string, level: 'info' | 'warning' = 'info') {
    this.state.events.push({ id: (this.state.events.at(-1)?.id ?? 0) + 1, time: this.state.elapsed, level, message })
    if (this.state.events.length > 100) this.state.events.shift()
  }
  select(id: MissionId, robot: RobotState) {
    if (!missions[id]) throw new Error('未知任务。')
    if (robot.emergency) throw new Error('请先解除急停，再切换或重置任务。')
    this.state = initialState(id); this.state.active = true; this.entered = false
    robot.worldPosition = [...this.definition.start]; robot.heading = 0; robot.targetHeading = 0
    Object.assign(robot, neutralPose(robot.id)); this.action(robot, 'stand'); robot.recording = false
  }
  send(command: Exclude<MissionCommand, { type: 'select' }>, robot: RobotState) {
    const state = this.state
    if (command.type === 'leave') { this.stop(robot, '离开任务中心，任务已停止。'); state.active = false; return }
    if (command.type === 'stop') { this.stop(robot, '用户已停止任务；重置后可重新开始。'); return }
    if (robot.emergency) throw new Error('请先解除急停。')
    if (command.type === 'reset') { this.select(state.id, robot); return }
    if (command.type === 'start') {
      if (!state.active) throw new Error('请先重置任务，恢复初始场景后再开始。')
      if (state.status !== 'ready') throw new Error('请先重置任务，再开始新的执行。')
      if (robot.targetSpeed <= 0 && this.definition.steps.some(step => step.kind === 'move')) throw new Error('移动速度为零，请先调整速度。')
      state.status = 'running'; this.event(`开始${this.definition.name} · SIMULATION`)
    } else if (command.type === 'pause') {
      if (state.status !== 'running') return
      state.status = 'paused'; robot.speed = 0; this.event('任务暂停，机器人与对象位姿已冻结。')
    } else if (command.type === 'resume') {
      if (state.status !== 'paused') return
      state.status = 'running'; this.event('继续任务。')
    }
    state.message = state.status === 'paused' ? '任务已暂停，可继续或停止。' : this.definition.steps[state.step]?.name ?? state.message
  }
  stop(robot: RobotState, message: string, failed = false) {
    if (!this.ownsRobot) return
    this.state.status = failed ? 'failed' : 'stopped'; this.state.message = message; this.state.result = null
    this.state.route.status = 'stopped'; this.state.scanOrigin = null; robot.speed = 0
    // 持物停止保留抓握位姿，重置显式恢复场景；不能让箱体掉落或传送回起点。
    this.event(message, failed ? 'warning' : 'info')
  }
  private navigationObjects() { return this.state.objects.filter(object => object.category !== 'stairs' && !(object.id === 'payload' && this.state.attached)) }
  private targetPosition(id: string): Vector3Tuple {
    const object = this.state.objects.find(item => item.id === id)
    if (!object) throw new Error('任务目标不存在，请重置任务。')
    const bounds = objectBounds(object)
    return [(bounds.min[0] + bounds.max[0]) / 2, id === 'destination' ? bounds.max[1] + .1 : (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2]
  }
  private enter(robot: RobotState) {
    const state = this.state, step = this.definition.steps[state.step]!
    state.message = step.name; state.scanOrigin = null; state.detections = []
    if (step.kind === 'move') {
      const goal = step.goal!, path = planPath(robot.worldPosition, goal, this.navigationObjects(), missionScenes[this.definition.scene].zones, robotClearance[robot.id])
      if (!path.length) throw new Error('目标不可达，任务已停止。请重置场景后重试。')
      state.route = { ...emptyRoute(robot.worldPosition), status: 'running', goal: [...goal], path, length: pathLength(path), message: '沿规划路径执行任务' }
    } else if (step.target && !['grasp', 'reach', 'approach'].includes(step.kind)) {
      const target = this.targetPosition(step.target)
      robot.heading = step.heading ?? (Math.atan2(target[2] - robot.worldPosition[2], target[0] - robot.worldPosition[0]) * 180 / Math.PI + 360) % 360
      robot.targetHeading = robot.heading
    }
    if (step.kind === 'approach') this.approachStart = this.targetPosition(step.target!)
    if (state.attached) this.updatePayload(heldPosition(robot, robot), robot.heading)
    this.manipulationStart = copyPose(robot); this.payloadStart = this.state.payloadPosition ? [...this.state.payloadPosition] : null
    this.action(robot, step.action); this.event(`执行：${step.name}`); this.entered = true
  }
  beforeTick(dt: number, robot: RobotState) {
    if (!this.running || robot.emergency) return
    try {
      if (!this.entered) this.enter(robot)
      const step = this.definition.steps[this.state.step]!
      if (step.kind === 'move') {
        if (robot.targetSpeed <= 0) throw new Error('移动速度为零，任务已停止。调整速度并重置后重试。')
        advanceRoute(dt, robot, this.state.route, this.navigationObjects(), missionScenes[this.definition.scene].zones, robotClearance[robot.id])
        if (this.state.route.status === 'blocked') throw new Error(this.state.route.message)
      }
      if (step.kind === 'approach') {
        const person = this.state.objects.find(object => object.id === step.target)!, current = this.targetPosition(step.target!)
        const t = clamp((this.state.stepElapsed + dt) / step.duration!, 0, 1)
        const target = this.approachStart!.map((value, axis) => axis === 1 ? value : value + (step.goal![axis]! - value) * t)
        person.parts.forEach(part => { part.center[0] += target[0]! - current[0]; part.center[2] += target[2]! - current[2] })
        this.state.revision++
      }
    } catch (error) { this.stop(robot, error instanceof Error ? error.message : '任务执行失败', true) }
  }
  pose(robot: RobotState, desired: RobotPose, dt: number) {
    if (!this.state.active || robot.id !== this.definition.robot) return desired
    if (!this.running) return desired
    const step = this.definition.steps[this.state.step]!
    try {
      if (['reach', 'grasp', 'place', 'release', 'lift'].includes(step.kind)) {
        const t = clamp((this.state.stepElapsed + dt) / step.duration!, 0, 1)
        let position = this.targetPosition(step.kind === 'place' || step.kind === 'release' ? 'destination' : 'payload'), bend = .35
        if (step.kind === 'lift' || step.kind === 'place') {
          const yaw = robot.heading * Math.PI / 180
          const carry: Vector3Tuple = [robot.worldPosition[0] + .54 * Math.cos(yaw), 1.18, robot.worldPosition[2] + .54 * Math.sin(yaw)]
          const from = this.payloadStart!, to = step.kind === 'lift' ? carry : position
          // 抬升先离开支架，再收臂；放置先伸臂，再垂直下降，避免角度混合使箱体穿过台面。
          const horizontal = smoothStep(step.kind === 'lift' ? (t - .45) / .55 : t / .55)
          const vertical = smoothStep(step.kind === 'lift' ? t / .45 : (t - .55) / .45)
          position = [from[0] + (to[0] - from[0]) * horizontal, from[1] + (to[1] - from[1]) * vertical, from[2] + (to[2] - from[2]) * horizontal]
          bend = step.kind === 'lift' ? .35 * (1 - horizontal) : .35 * horizontal
        }
        const closure = step.kind === 'reach' || step.kind === 'release' ? 0 : 1
        desired = reachPayload(robot, desired, position, closure, bend)
        if (step.kind === 'reach') desired = blendPoses('humanoid', this.manipulationStart!, desired, smoothStep(t))
        if (step.kind === 'grasp' || step.kind === 'release') setFingers(desired, step.kind === 'grasp' ? smoothStep(t) : 1 - smoothStep(t))
      } else if (this.state.attached) {
        const yaw = robot.heading * Math.PI / 180
        const held = reachPayload(robot, copyPose(desired), [robot.worldPosition[0] + .54 * Math.cos(yaw), 1.18, robot.worldPosition[2] + .54 * Math.sin(yaw)], 1, 0)
        desired.joints.splice(6, desired.joints.length - 6, ...held.joints.slice(6))
      }
    } catch (error) { this.stop(robot, error instanceof Error ? error.message : '运动求解失败', true); return robot }
    return desired
  }
  afterTick(dt: number, robot: RobotState) {
    if (!this.running || robot.emergency) return
    const state = this.state, step = this.definition.steps[state.step]!
    state.elapsed += dt; state.stepElapsed += dt
    if (state.attached) this.updatePayload(heldPosition(robot, robot), robot.heading)
    const complete = step.kind === 'move' ? state.route.status === 'arrived' : state.stepElapsed >= step.duration! - 1e-8
    if (step.kind === 'scan') {
      const sensor = sensorPose(robot, robot.worldPosition)
      state.scanOrigin = sensor.lidar; state.detections = detectEnvironment(state.objects, sensor, 12)
      if (complete) {
        const detection = state.detections.find(item => item.id === step.target)
        if (detection?.status !== 'detected') { this.stop(robot, '目标未进入视场或被遮挡，识别失败；请重置场景重试。', true); return }
        state.marked.push(detection.id)
        const anomaly = state.objects.find(item => item.id === step.target)?.anomaly
        this.event(`${detection.name} · ${detection.distance.toFixed(2)} m · ${anomaly ?? '几何识别正常'}`, anomaly ? 'warning' : 'info')
      }
    }
    if (complete && step.kind === 'grasp') {
      if (Math.hypot(...heldPosition(robot, robot).map((v, i) => v - state.payloadPosition![i]!)) > .035) { this.stop(robot, '双手未到达抓握位置，已停止任务。', true); return }
      state.attached = true; this.updatePayload(heldPosition(robot, robot), robot.heading); this.event('双手接触已确认，箱体随掌心约束移动。')
    }
    if (complete && step.kind === 'release') {
      const target = this.targetPosition('destination')
      if (Math.hypot(...state.payloadPosition!.map((v, i) => v - target[i]!)) > .035) { this.stop(robot, '箱体尚未对准放置支架，已停止任务。', true); return }
      state.attached = false; this.updatePayload(target, 0); this.event('箱体已放置到指定支架，抓握约束解除。')
    }
    const fraction = step.kind === 'move' ? state.route.length ? state.route.travelled / state.route.length : 1 : Math.min(1, state.stepElapsed / step.duration!)
    state.progress = (state.step + fraction) / this.definition.steps.length
    if (!complete) return
    this.event(`完成：${step.name}`); state.step++; state.stepElapsed = 0; this.entered = false; state.scanOrigin = null
    if (state.step === this.definition.steps.length) {
      state.status = 'succeeded'; state.progress = 1; this.action(robot, 'stand')
      const warnings = state.events.filter(event => event.level === 'warning').length
      state.result = `${this.definition.name}完成 · ${state.step} 个步骤 · ${state.marked.length} 个识别目标 · ${warnings} 项预设异常 · ${state.elapsed.toFixed(1)} s`
      state.message = state.result; this.event(state.result)
    }
  }
  private updatePayload(position: Vector3Tuple, heading: number) {
    this.state.payloadPosition = [...position]; this.state.payloadHeading = heading
    this.state.objects.find(object => object.id === 'payload')!.parts[0]!.center = this.state.payloadPosition; this.state.revision++
  }
}
