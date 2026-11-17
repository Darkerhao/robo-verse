import { actions, robots } from '@/config/robots'
import { joints } from '@/config/joints'
import { missions } from '@/config/missions'
import { missionStatusLabels, type MissionState } from '@/types/mission'
import { executionLabels, type AssistantState } from '@/types/assistant'
import type { PerceptionState } from '@/config/perception'
import type { RobotState, RobotTelemetry, SensorStatus, TelemetryMetric, TelemetrySample } from '@/types/robot'
import { clamp } from './kinematics'

export const sensorStatusLabels: Record<SensorStatus, string> = { standby: '待机', active: '运行', paused: '已暂停', stopped: '急停', history: '历史回看' }

/** 只读取唯一仿真状态；传感器“运行”表示几何模拟正在执行，不表示硬件在线。 */
export function telemetryFor(robot: RobotState, paused: boolean, perception: PerceptionState, mission: MissionState, assistant: AssistantState): RobotTelemetry {
  const spec = robots[robot.id]
  const controlLabel = { motion: '动作演示', joint: '关节控制', ik: '末端 IK', replay: '动作回放' }[robot.controlMode]
  const action = robot.controlMode === 'motion' ? actions[robot.action].label : controlLabel
  const inMission = mission.active && missions[mission.id].robot === robot.id
  const sensing = perception.active && perception.robot === robot.id && !inMission
  const latestRun = assistant.history.find(item => item.commands[0]?.robotType === robot.id)
  const runningAI = latestRun && ['queued', 'running'].includes(latestRun.status)
  const frozen = paused || inMission && mission.status === 'paused'
  const sensor = (active: boolean): SensorStatus => robot.emergency ? 'stopped' : frozen ? 'paused' : active ? 'active' : 'standby'
  const scanning = inMission ? mission.status === 'running' && !!mission.scanOrigin : sensing && perception.scanning && perception.historyId === null
  const camera = inMission ? mission.status === 'running' && !!mission.scanOrigin : sensing
  const detections = inMission ? mission.detections : sensing ? perception.detections : []
  const jointLoads = joints[robot.id].map((joint, index) => robot.emergency ? 0 : clamp(5 + Math.abs(robot.joints[index]! - joint.neutral) / (joint.max - joint.min) * 22 + (robot.jointVelocities[index] ?? 0) * 14 + (inMission && mission.attached && joint.group.includes('臂') ? 18 : 0), 0, 100))
  const voltage = spec.nominalVoltage * (.9 + robot.battery / 100 * .15)
  const task = inMission ? { key: `mission:${mission.runId}`, name: missions[mission.id].name, status: missionStatusLabels[mission.status], progress: mission.progress * 100 }
    : latestRun ? { key: `assistant:${latestRun.id}`, name: runningAI ? 'AI 顺序指令' : '最近 AI 指令', status: executionLabels[latestRun.status], progress: latestRun.step / latestRun.commands.length * 100 } : null
  return {
    mode: inMission ? '任务执行' : runningAI ? 'AI 控制' : sensing ? '环境感知' : controlLabel,
    status: robot.emergency ? '急停锁定' : paused ? '仿真已暂停' : inMission ? missionStatusLabels[mission.status] : action,
    action,
    voltage, current: robot.power / voltage,
    remainingMinutes: robot.power > 0 ? spec.batteryWh * robot.battery / 100 / robot.power * 60 : null,
    memory: clamp(18 + robot.joints.length * .25 + (sensing ? perception.points.length / 6000 * 12 + perception.history.length : 0) + (inMission ? mission.objects.length * .5 : 0), 0, 100),
    latency: robot.emergency ? 0 : 2 + robot.cpu * .12,
    jointLoads, jointLoad: Math.max(...jointLoads),
    stability: clamp(100 - (Math.abs(robot.roll) + Math.abs(robot.pitch)) * 90 - robot.speed / spec.maxSpeed * 8, 0, 100),
    direction: (robot.heading + (robot.action === 'backward' ? 180 : 0)) % 360,
    sensors: { camera: sensor(camera), lidar: sensing && perception.historyId !== null && !robot.emergency && !frozen ? 'history' : sensor(scanning), imu: sensor(true), environment: sensor(camera || scanning) },
    targets: detections.filter(item => item.status === 'detected').length, task,
  }
}

/** 演示功耗来自关节差分、步态与感知负载；Wh × 3600 换算为焦耳后积分放电。 */
export function updateEnergy(robot: RobotState, telemetry: RobotTelemetry, dt: number) {
  if (robot.emergency) { robot.power = 0; robot.cpu = 0; return }
  const load = robot.speed / robots[robot.id].maxSpeed
  const jointVelocity = robot.jointVelocities.reduce((sum, value) => sum + value, 0)
  const sensing = (telemetry.sensors.lidar === 'active' ? 12 : 0) + (telemetry.sensors.camera === 'active' ? 8 : 0)
  robot.power = 24 + load * 240 + jointVelocity * 2 + sensing + telemetry.jointLoad * .35
  robot.cpu = clamp(12 + load * 38 + jointVelocity * .6 + sensing, 0, 95)
  robot.temperature += (36 + load * 21 + Math.min(8, jointVelocity) - robot.temperature) * dt * .08
  robot.battery = Math.max(0, robot.battery - robot.power * dt / (robots[robot.id].batteryWh * 3600) * 100)
}

/** 无任务用空值；任务重新开始或切换时断线，避免把两次执行接成一条曲线。 */
export function telemetryPoints(samples: TelemetrySample[], metric: TelemetryMetric, jointIndex = 0): [number, number | null][] {
  return samples.flatMap((sample, index) => {
    const value = metric === 'joint' ? (sample.joints[jointIndex] ?? 0) * 180 / Math.PI : sample[metric]
    const point: [number, number | null] = [sample.time, value]
    return metric === 'taskProgress' && index > 0 && samples[index - 1]!.taskKey !== sample.taskKey ? [[sample.time, null], point] : [point]
  })
}
