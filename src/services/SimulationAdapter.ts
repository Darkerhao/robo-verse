import { actions, robots } from '@/config/robots'
import { endEffectors, joints, rigs } from '@/config/joints'
import { blendPoses, clamp, copyPose, forwardEndEffector, inverseEndEffector, isMoving, isTurning, motionPose, neutralPose, smoothStep } from '@/simulation/kinematics'
import { PerceptionEngine } from '@/simulation/perception'
import { destinations, environmentObjects, homePosition, restrictedZones, robotClearance } from '@/config/perception'
import { limitTravel } from '@/simulation/pathPlanning'
import { CommandEngine } from '@/simulation/CommandEngine'
import { MissionEngine } from '@/simulation/MissionEngine'
import { conformToTerrain } from '@/simulation/missionKinematics'
import { missions } from '@/config/missions'
import { telemetryFor, updateEnergy } from '@/simulation/telemetry'
import type { RobotInstruction } from '@/types/assistant'
import type { RobotAction, RobotAdapter, RobotCommand, RobotId, RobotPose, RobotState, SimulationSnapshot } from '@/types/robot'

interface RecordedFrame extends RobotPose { time: number; heading: number }
interface MotionSession {
  target?: RobotPose
  transition?: { from: RobotPose; heading: number; elapsed: number; duration: number }
  turnToTarget: boolean
  clip: RecordedFrame[]
  recordingStart: number
}
const session = (): MotionSession => ({ turnToTarget: false, clip: [], recordingStart: 0 })
const normalizeHeading = (angle: number) => ((angle % 360) + 360) % 360
const headingDifference = (target: number, current: number) => ((target - current + 540) % 360) - 180

function initialRobot(id: RobotId): RobotState {
  return { ...neutralPose(id), id, worldPosition: [...homePosition], action: 'stand', targetSpeed: id === 'quadruped' ? 1 : .8, speed: 0, heading: 0, targetHeading: 0, phase: 0, actionTime: 0, motionRate: 1, loop: true, controlMode: 'motion', jointTargets: null, ikTarget: null, recording: false, recordedFrames: 0, recordedDuration: 0, replayTime: 0, battery: id === 'quadruped' ? 98 : 94, temperature: 36, power: 24, cpu: 12, emergency: false, jointVelocities: joints[id].map(() => 0), travelSpeed: 0 }
}

export class SimulationAdapter implements RobotAdapter {
  readonly mode = 'simulation' as const
  private state: Omit<SimulationSnapshot, 'perception' | 'assistant' | 'mission' | 'telemetry'> = { time: 0, paused: false, robots: { quadruped: initialRobot('quadruped'), humanoid: initialRobot('humanoid') } }
  private perception = new PerceptionEngine()
  private listeners = new Set<(snapshot: SimulationSnapshot) => void>()
  private timer?: ReturnType<typeof setInterval>
  private sessions: Record<RobotId, MotionSession> = { quadruped: session(), humanoid: session() }
  private commands = new CommandEngine({ start: command => this.startInstruction(command), complete: (command, elapsed) => this.instructionComplete(command, elapsed), halt: robot => this.haltAssistant(robot) })
  private missions = new MissionEngine((robot, action) => this.beginAction(robot, action))

  async connect() {
    if (this.timer) return
    this.timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) this.tick(.1) }, 100)
    this.publish()
  }

  disconnect() { this.commands.cancel('仿真连接已关闭'); this.missions.stop(this.state.robots[this.missions.definition.robot], '仿真连接已关闭'); clearInterval(this.timer); this.timer = undefined; this.listeners.clear() }
  subscribe(listener: (snapshot: SimulationSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): SimulationSnapshot {
    return { ...this.state, telemetry: { quadruped: this.telemetry('quadruped'), humanoid: this.telemetry('humanoid') }, mission: this.missions.snapshot(), assistant: structuredClone(this.commands.state), perception: this.perception.snapshot(), robots: Object.fromEntries(Object.values(this.state.robots).map(robot => {
      const clip = this.sessions[robot.id].clip
      const target = this.sessions[robot.id].target
      return [robot.id, { ...robot, ...copyPose(robot), worldPosition: [...robot.worldPosition], jointVelocities: [...robot.jointVelocities], jointTargets: target ? [...target.joints] : null, ikTarget: robot.ikTarget ? { ...robot.ikTarget, position: [...robot.ikTarget.position] } : null, recordedFrames: clip.length, recordedDuration: clip.at(-1)?.time ?? 0 }]
    })) as Record<RobotId, RobotState> }
  }

  send(command: RobotCommand) {
    if (command.type === 'mission') {
      const instruction = command.command, current = this.state.robots[this.missions.definition.robot]
      if (this.state.paused && ['start', 'resume', 'select', 'reset'].includes(instruction.type)) throw new Error('请先继续全局仿真。')
      if (instruction.type === 'select') {
        if (!missions[instruction.id]) throw new Error('未知任务。')
        const robot = this.state.robots[missions[instruction.id].robot]
        if (this.missions.state.active && current.emergency || robot.emergency) throw new Error('请先解除急停，再切换任务。')
        if (this.missions.state.active) this.holdMission()
        this.commands.cancel('任务中心已接管'); this.perception.send({ type: 'leave' }, this.state.robots)
        this.missions.select(instruction.id, robot)
      } else {
        const wasActive = this.missions.state.active
        this.missions.send(instruction, current)
        if (wasActive && ['stop', 'leave'].includes(instruction.type)) this.holdMission()
      }
    } else if (command.type === 'assistant') {
      const stop = command.commands.length === 1 && command.commands[0]?.action === 'stop'
      if (!stop && (this.state.paused || this.state.robots[command.robot].emergency)) throw new Error('请先继续仿真并解除当前机器人急停。')
      if (this.missions.ownsRobot) throw new Error('请先停止任务中心的任务，再执行 AI 指令。')
      this.commands.submit(command.text, command.provider, command.commands, command.robot)
      if (this.missions.definition.robot === command.robot) this.missions.state.active = false
    } else if (command.type === 'cancelAssistant') this.commands.cancel('用户已取消当前任务')
    else if (command.type === 'clearAssistant') this.commands.clear()
    else {
      const activeRobot = this.commands.active?.commands[0]?.robotType
      const replacedMotion = this.apply(command)
      const perceptionControl = command.type === 'perception' && (['enter', 'leave', 'goal', 'route', 'history', 'obstacle'].includes(command.command.type) || (command.command.type === 'settings' && command.command.values.scanning !== undefined))
      if (command.type !== 'pause' && (command.type === 'reset' || perceptionControl || ('robot' in command && command.robot === activeRobot))) {
        // 命令先通过原控制入口，拒绝输入不改变旧任务；接管后保留新动作。
        this.commands.cancel(command.type === 'emergency' ? '急停已取消指令' : '手动控制已接管，指令已取消', false)
        if (activeRobot && !replacedMotion) this.haltAssistant(activeRobot)
        else if (activeRobot && command.type !== 'reset' && this.perception.state.robot === activeRobot && command.type !== 'perception') this.perception.state.scanning = false
      }
      const preparingSpeed = command.type === 'speed' && this.missions.state.status === 'ready'
      if (this.missions.state.active && command.type !== 'pause' && !preparingSpeed && (command.type === 'reset' || perceptionControl || ('robot' in command && command.robot === this.missions.definition.robot))) {
        this.missions.stop(this.state.robots[this.missions.definition.robot], command.type === 'emergency' ? '急停已终止任务，请解除急停后重置。' : '手动控制已接管，任务已停止。')
        if (!replacedMotion) this.holdMission()
        if (command.type !== 'emergency' && command.type !== 'release') this.missions.state.active = false
      }
    }
    if (!this.state.paused) this.refreshEnergy(0)
    this.publish()
  }

  private apply(command: Exclude<RobotCommand, { type: 'assistant' | 'cancelAssistant' | 'clearAssistant' | 'mission' }>) {
    let replacedMotion = false
    if (command.type === 'reset') {
      // 急停锁不能被重置会话间接解除。
      const stops = Object.values(this.state.robots).filter(robot => robot.emergency).map(robot => robot.id)
      this.state = { time: 0, paused: false, robots: { quadruped: initialRobot('quadruped'), humanoid: initialRobot('humanoid') } }
      this.sessions = { quadruped: session(), humanoid: session() }
      this.perception.reset()
      stops.forEach(id => { this.state.robots[id].emergency = true; this.state.robots[id].power = 0 })
      replacedMotion = true
    } else if (command.type === 'pause') {
      this.state.paused = command.value
    } else if (command.type === 'perception') {
      const instruction = command.command, previous = this.perception.state
      const previousRobot = this.state.robots[previous.robot], moving = ['running', 'paused'].includes(previous.route.status)
      if (instruction.type === 'route' && instruction.action === 'start' && this.state.paused) throw new Error('请先继续仿真，再执行路线。')
      const action = this.perception.send(instruction, this.state.robots)
      if (instruction.type === 'enter' && moving && !previousRobot.emergency) this.beginAction(previousRobot, 'stand')
      const robot = this.state.robots[this.perception.state.robot]
      if (action && !robot.emergency) this.beginAction(robot, action)
      replacedMotion = !!action
    } else {
      const robot = this.state.robots[command.robot]
      const control = this.sessions[robot.id]
      if (command.type === 'emergency') {
        robot.emergency = true; robot.speed = 0; robot.power = 0; robot.cpu = 0; robot.travelSpeed = 0; robot.jointVelocities.fill(0); robot.recording = false
        replacedMotion = true
        if (this.perception.state.active && this.perception.state.robot === robot.id) { this.perception.stop('急停已停止路线'); this.perception.state.scanning = false }
      } else if (command.type === 'release') {
        const holdingTask = robot.emergency && this.missions.state.active && this.missions.definition.robot === robot.id
        robot.emergency = false
        if (holdingTask) this.holdMission()
        else {
          robot.action = 'stand'; robot.speed = 0
          Object.assign(robot, neutralPose(robot.id))
          robot.phase = 0; robot.actionTime = 0; robot.controlMode = 'motion'; robot.ikTarget = null; robot.recording = false
          robot.targetHeading = robot.heading; control.target = undefined; control.transition = undefined; control.turnToTarget = false
        }
        robot.power = 24; robot.cpu = 12
        replacedMotion = true
      } else {
        if (robot.emergency) throw new Error('请先解除急停，再发送运动指令。')
        if (this.state.paused) throw new Error('请先继续仿真，再发送运动指令。')
        const takeControl = () => { replacedMotion = true; if (this.perception.state.active && this.perception.state.robot === robot.id) this.perception.stop('手动控制已停止路线') }
        if (command.type === 'action') {
          if (!robots[robot.id].actions.includes(command.action)) throw new Error('当前机器人不支持此动作。')
          takeControl()
          this.beginAction(robot, command.action)
        } else if (command.type === 'stop') {
          takeControl()
          this.beginAction(robot, 'stand')
        } else if (command.type === 'loop') {
          robot.loop = command.value
        } else if (command.type === 'speed') {
          if (!Number.isFinite(command.value)) throw new Error('速度必须是有效数值。')
          robot.targetSpeed = clamp(command.value, 0, robots[robot.id].maxSpeed)
        } else if (command.type === 'rate') {
          if (!Number.isFinite(command.value)) throw new Error('倍率必须是有效数值。')
          robot.motionRate = clamp(command.value, .25, 2)
        } else if (command.type === 'turn') {
          if (!Number.isFinite(command.degrees)) throw new Error('角度必须是有效数值。')
          takeControl()
          const goal = normalizeHeading(robot.targetHeading + command.degrees)
          this.beginAction(robot, command.degrees < 0 ? 'turnLeft' : 'turnRight')
          robot.targetHeading = goal; control.turnToTarget = true
        } else if (command.type === 'joint') {
          const index = joints[robot.id].findIndex(joint => joint.id === command.joint)
          if (index < 0) throw new Error('当前机器人没有此关节。')
          if (!Number.isFinite(command.value)) throw new Error('关节角度必须是有效数值。')
          takeControl()
          const target = this.controlPose(robot, index < rigs[robot.id].hips.length * 3)
          const definition = joints[robot.id][index]!
          target.joints[index] = clamp(command.value, definition.min, definition.max)
          robot.controlMode = 'joint'; robot.ikTarget = null
          this.setTarget(robot, target)
        } else if (command.type === 'ik') {
          const effector = endEffectors[robot.id].find(item => item.id === command.effector)
          if (!effector) throw new Error('当前机器人没有此末端执行器。')
          if (command.position.length !== 3 || !command.position.every(Number.isFinite)) throw new Error('末端位置必须是三个有效数值。')
          const target = inverseEndEffector(robot.id, this.controlPose(robot, effector.kind === 'foot'), effector, command.position)
          const actual = forwardEndEffector(robot.id, target, effector)
          if (Math.hypot(...actual.map((value, index) => value - command.position[index]!)) > .005) throw new Error('目标超出当前关节工作空间，请调整末端位置。')
          takeControl()
          robot.controlMode = 'ik'; robot.ikTarget = { effector: effector.id, position: [...command.position] }
          this.setTarget(robot, target)
        } else if (command.type === 'record') {
          if (robot.controlMode === 'replay') throw new Error('请先停止回放，再记录关节动作。')
          if (command.value) {
            control.clip = []; control.recordingStart = this.state.time; robot.recording = true
            this.recordFrame(robot)
          } else if (robot.recording) { this.recordFrame(robot); robot.recording = false }
        } else if (command.type === 'clearRecording') {
          if (robot.controlMode === 'replay' || robot.recording) throw new Error('请先结束记录或停止回放。')
          control.clip = []; robot.replayTime = 0
        } else if (command.type === 'replay') {
          if (robot.recording) throw new Error('请先结束记录，再回放动作。')
          if (control.clip.length < 2 || control.clip.at(-1)!.time <= 0) throw new Error('请先记录一段关节动作。')
          takeControl()
          robot.controlMode = 'replay'; robot.ikTarget = null; robot.action = 'stand'; robot.speed = 0; robot.replayTime = 0
          this.setTarget(robot, copyPose(control.clip[0]!))
        }
      }
    }
    this.perception.tick(0, this.state.time, this.state.robots[this.perception.state.robot])
    return replacedMotion
  }

  tick(dt: number) {
    if (this.state.paused || !Number.isFinite(dt) || dt <= 0) return
    dt = Math.min(dt, .2)
    const previous = { quadruped: copyPose(this.state.robots.quadruped), humanoid: copyPose(this.state.robots.humanoid) }
    const positions = { quadruped: [...this.state.robots.quadruped.worldPosition], humanoid: [...this.state.robots.humanoid.worldPosition] }
    this.state.time += dt
    const sensingRobot = this.state.robots[this.perception.state.robot]
    const missionRobot = this.state.robots[this.missions.definition.robot]
    this.missions.beforeTick(dt, missionRobot)
    const navigating = this.perception.state.route.status === 'running'
    this.perception.navigate(dt, sensingRobot)
    if (navigating && this.perception.state.route.status !== 'running' && !sensingRobot.emergency) this.beginAction(sensingRobot, 'stand')
    Object.values(this.state.robots).forEach(robot => {
      if (robot.emergency) return
      const inMission = this.missions.state.active && robot.id === this.missions.definition.robot
      if (inMission && ['paused', 'stopped', 'failed'].includes(this.missions.state.status)) return
      const control = this.sessions[robot.id]
      const followingRoute = this.perception.state.active && this.perception.state.robot === robot.id && this.perception.state.route.status === 'running'
      const moving = robot.controlMode === 'motion' && isMoving(robot.action)
      const factor = isTurning(robot.action) || robot.action === 'climb' ? .35 : robot.action === 'carry' ? .5 : 1
      const target = moving ? robot.targetSpeed * factor : 0
      robot.speed += (target - robot.speed) * (1 - Math.exp(-dt * 5))
      if (robot.speed < .001) robot.speed = 0
      // 自动移动的连续步态按实际速度推进，工作台的播放设置保留到任务结束后。
      const commanded = this.commands.active?.commands[0]?.robotType === robot.id || inMission && this.missions.running
      const actionDt = dt * (followingRoute || commanded ? 1 : robot.motionRate)
      let desired: RobotPose
      if (robot.controlMode === 'motion') {
        robot.actionTime += actionDt
        robot.phase += actionDt * (moving ? robot.speed * (robot.action === 'run' ? 8 : robot.action === 'trot' ? 7 : 5) : actions[robot.action].duration ? Math.PI * 2 / actions[robot.action].duration : 0)
        if (isTurning(robot.action) && robot.speed > .001) {
          if (control.turnToTarget) {
            let difference = headingDifference(robot.targetHeading, robot.heading)
            if (difference === -180 && robot.action === 'turnRight') difference = 180
            robot.heading = normalizeHeading(robot.heading + clamp(difference, -45 * actionDt, 45 * actionDt))
            if (Math.abs(difference) <= 45 * actionDt) this.beginAction(robot, 'stand')
          } else {
            robot.heading = normalizeHeading(robot.heading + (robot.action === 'turnLeft' ? -1 : 1) * 25 * actionDt * smoothStep(robot.actionTime / .5))
            robot.targetHeading = robot.heading
          }
        }
        if (!followingRoute && !commanded && !robot.loop && actions[robot.action].animated && robot.actionTime >= actions[robot.action].duration - 1e-8) this.beginAction(robot, 'stand')
        desired = motionPose(robot)
      } else if (robot.controlMode === 'replay') {
        robot.replayTime += actionDt
        const duration = control.clip.at(-1)!.time
        if (robot.replayTime >= duration) {
          if (robot.loop) { robot.replayTime %= duration; this.transition(robot, control.clip[0]!) }
          else { robot.replayTime = duration; robot.controlMode = 'joint' }
        }
        let right = control.clip.findIndex(frame => frame.time >= robot.replayTime)
        if (right < 1) right = Math.max(1, right)
        const a = control.clip[right - 1]!, b = control.clip[right]!
        const amount = clamp((robot.replayTime - a.time) / (b.time - a.time), 0, 1)
        desired = blendPoses(robot.id, a, b, amount, false)
        robot.heading = normalizeHeading(a.heading + headingDifference(b.heading, a.heading) * amount)
        robot.targetHeading = robot.heading
        control.target = desired
      } else {
        desired = control.target!
      }
      // 先让目标姿态落在真实地形，再与同一坐标空间的旧姿态过渡，避免台阶高度叠加。
      if (inMission && this.missions.definition.scene === 'stairs') desired = conformToTerrain(robot, desired)
      if (control.transition) {
        control.transition.elapsed += actionDt
        const amount = smoothStep(control.transition.elapsed / control.transition.duration)
        desired = blendPoses(robot.id, control.transition.from, desired, amount, robot.controlMode === 'motion')
        if (robot.controlMode === 'replay') robot.heading = normalizeHeading(control.transition.heading + headingDifference(robot.heading, control.transition.heading) * amount)
        if (amount >= 1) control.transition = undefined
      }
      if (inMission) desired = this.missions.pose(robot, desired, dt)
      Object.assign(robot, desired)
      if (robot.recording) this.recordFrame(robot)
    })
    this.missions.afterTick(dt, missionRobot)
    this.perception.tick(dt, this.state.time, sensingRobot)
    this.commands.tick(dt)
    for (const robot of Object.values(this.state.robots)) {
      robot.jointVelocities = robot.joints.map((angle, index) => Math.abs(angle - previous[robot.id].joints[index]!) / dt)
      robot.travelSpeed = Math.hypot(...robot.worldPosition.map((value, index) => value - positions[robot.id][index]!)) / dt
    }
    this.refreshEnergy(dt)
    this.publish()
  }

  private telemetry(id: RobotId) { return telemetryFor(this.state.robots[id], this.state.paused, this.perception.state, this.missions.state, this.commands.state) }

  private refreshEnergy(dt: number) {
    for (const robot of Object.values(this.state.robots)) {
      const held = this.missions.state.active && this.missions.definition.robot === robot.id && ['paused', 'stopped', 'failed'].includes(this.missions.state.status)
      if (held || robot.emergency) { robot.jointVelocities.fill(0); robot.travelSpeed = 0 }
      updateEnergy(robot, this.telemetry(robot.id), held ? 0 : dt)
    }
  }

  private haltAssistant(id: RobotId) {
    const robot = this.state.robots[id]
    if (this.perception.state.robot === id) { this.perception.stop('AI 指令移动已停止'); this.perception.state.scanning = false }
    if (!robot.emergency) this.beginAction(robot, 'stand')
  }

  private holdMission() {
    const robot = this.state.robots[this.missions.definition.robot]
    if (robot.emergency) return
    robot.controlMode = 'joint'; robot.speed = 0; robot.recording = false; robot.ikTarget = null
    // 停止/退出可发生在全局暂停中，不能依赖下一个 tick 清除已经失效的运动读数。
    robot.travelSpeed = 0; robot.jointVelocities.fill(0)
    updateEnergy(robot, this.telemetry(robot.id), 0)
    const control = this.sessions[robot.id]
    control.target = copyPose(robot); control.transition = undefined; control.turnToTarget = false
  }

  private startInstruction(command: RobotInstruction) {
    const robot = this.state.robots[command.robotType], action = command.action
    if (robot.emergency) throw new Error('机器人急停锁定，指令已终止。')
    if (action === 'scan' || action === 'patrol' || ['walk', 'backward', 'run', 'trot'].includes(action)) {
      if (!this.perception.state.active || this.perception.state.robot !== robot.id) throw new Error('请在 AI 控制训练场执行移动或扫描。')
      if (action === 'scan') { this.beginAction(robot, 'stand'); this.apply({ type: 'perception', command: { type: 'settings', values: { scanning: true, mode: 'lidar' } } }); return }
      if (robot.targetSpeed <= 0) throw new Error('移动速度为零，请先调整速度后重新发送。')
      const heading = robot.heading * Math.PI / 180, distance = robot.targetSpeed * command.duration * (action === 'backward' ? -1 : 1)
      const goal = action === 'patrol' ? [...destinations[0]!.position] as [number, number, number] : limitTravel(robot.worldPosition, [robot.worldPosition[0] + Math.cos(heading) * distance, 0, robot.worldPosition[2] + Math.sin(heading) * distance], environmentObjects(this.perception.state.obstacleSide), restrictedZones, robotClearance[robot.id])
      this.apply({ type: 'perception', command: { type: 'goal', position: goal } })
      this.apply({ type: 'perception', command: { type: 'route', action: 'start' } })
      if (action !== 'patrol') this.beginAction(robot, action as RobotAction)
      this.apply({ type: 'perception', command: { type: 'settings', values: { mode: action === 'patrol' ? 'lidar' : 'path', scanning: action === 'patrol' } } })
      return
    }
    if (action === 'turnLeft' || action === 'turnRight') {
      if (robot.targetSpeed <= 0) throw new Error('移动速度为零，无法执行转向。')
      this.apply({ type: 'turn', robot: robot.id, degrees: (command.parameters.degrees ?? 45) * (action === 'turnLeft' ? -1 : 1) })
    } else if (action !== 'stop') this.apply({ type: 'action', robot: robot.id, action })
  }

  private instructionComplete(command: RobotInstruction, elapsed: number) {
    const robot = this.state.robots[command.robotType], action = command.action
    if (action === 'patrol' || ['walk', 'backward', 'run', 'trot'].includes(action)) {
      const route = this.perception.state.route
      if (route.status === 'arrived') return true
      if (route.status !== 'running') throw new Error(route.message)
      if (elapsed > Math.max(command.duration, route.length / Math.max(robot.targetSpeed, .1)) + 8) throw new Error('移动超时，请检查速度和路线后重新发送。')
      return false
    }
    if (action === 'turnLeft' || action === 'turnRight') return robot.action === 'stand'
    return elapsed >= command.duration - 1e-8
  }

  private beginAction(robot: RobotState, action: RobotAction) {
    const control = this.sessions[robot.id]
    robot.action = action; robot.actionTime = 0; robot.controlMode = 'motion'; robot.ikTarget = null
    robot.targetHeading = robot.heading; control.turnToTarget = false; control.target = undefined
    robot.travelSpeed = 0
    if (!isMoving(action)) robot.speed = 0
    this.transition(robot, motionPose(robot))
    if (this.state.paused) { robot.jointVelocities.fill(0); updateEnergy(robot, this.telemetry(robot.id), 0) }
  }

  private controlPose(robot: RobotState, lift: boolean) {
    const target = copyPose(robot.controlMode === 'joint' || robot.controlMode === 'ik' ? this.sessions[robot.id].target! : robot)
    // 仅腿部/足端实验留出离地空间，手臂与机械手保持当前机身高度。
    if (lift) target.position[1] = Math.max(target.position[1], rigs[robot.id].height + .25)
    return target
  }

  private setTarget(robot: RobotState, target: RobotPose) {
    robot.speed = 0; robot.travelSpeed = 0; robot.targetHeading = robot.heading
    this.sessions[robot.id].target = target; this.sessions[robot.id].turnToTarget = false
    this.transition(robot, target)
  }

  private transition(robot: RobotState, target: RobotPose) {
    const difference = Math.max(...target.joints.map((angle, index) => Math.abs(angle - robot.joints[index]!)))
    this.sessions[robot.id].transition = { from: copyPose(robot), heading: robot.heading, elapsed: 0, duration: Math.max(.6, difference / 2.5) }
  }

  private recordFrame(robot: RobotState) {
    const control = this.sessions[robot.id], time = Math.min(20, this.state.time - control.recordingStart)
    if (control.clip.at(-1)?.time === time) return
    control.clip.push({ ...copyPose(robot), heading: robot.heading, time })
    if (time >= 20 - 1e-8) robot.recording = false
  }

  private publish() { const snapshot = this.snapshot(); this.listeners.forEach(listener => listener(snapshot)) }
}
