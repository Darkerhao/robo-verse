import { Box3, Euler, Matrix4, Plane, Ray, Sphere, Vector3 } from 'three'
import { joints } from '@/config/joints'
import { cloudCapacity, destinations, environmentObjects, homePosition, objectBounds, perceptionModes, restrictedZones, robotClearance, scanColumns, scanElevations, sensorMounts } from '@/config/perception'
import type { Detection, EnvironmentObject, LidarPoint, PerceptionCommand, PerceptionState, PlannedRoute } from '@/config/perception'
import type { RobotId, RobotState, Vector3Tuple } from '@/types/robot'
import { clamp } from './kinematics'
import { advanceRoute, isSegmentFree, pathLength, planPath } from './pathPlanning'

const tau = Math.PI * 2
const xyz = (vector: Vector3) => vector.toArray() as Vector3Tuple
const transform = (position: Vector3Tuple, x = 0, y = 0, z = 0) => new Matrix4().makeRotationFromEuler(new Euler(x, y, z)).setPosition(...position)
type Collider = { object: EnvironmentObject; shape: Box3 | Sphere }
function colliders(objects: EnvironmentObject[]): Collider[] {
  return objects.flatMap(object => object.parts.map(part => ({ object, shape: part.sphere
    ? new Sphere(new Vector3(...part.center), part.size[0] / 2)
    : new Box3(new Vector3(...part.center).sub(new Vector3(...part.size).multiplyScalar(.5)), new Vector3(...part.center).add(new Vector3(...part.size).multiplyScalar(.5))) })))
}
function cast(shapes: Collider[], origin: Vector3Tuple, direction: Vector3Tuple, range: number): LidarPoint | null {
  const source = new Vector3(...origin), ray = new Ray(source, new Vector3(...direction).normalize()), target = new Vector3()
  let nearest: LidarPoint | null = null
  for (const { object, shape } of shapes) {
    const hit = shape instanceof Sphere ? ray.intersectSphere(shape, target) : ray.intersectBox(shape, target)
    if (!hit) continue
    const distance = source.distanceTo(hit)
    if (distance > range || distance < .02 || (nearest && distance >= nearest.distance)) continue
    nearest = { position: xyz(hit), distance, objectId: object.id, category: object.category }
  }
  return nearest
}
export const castEnvironmentRay = (objects: EnvironmentObject[], origin: Vector3Tuple, direction: Vector3Tuple, range: number) => cast(colliders(objects), origin, direction, range)

/** 与 RobotModel 的 root → body → waist → neck → head 使用相同 XYZ 欧拉次序。 */
export function sensorPose(robot: RobotState, position: Vector3Tuple) {
  const matrix = transform(position, 0, -robot.heading * Math.PI / 180).multiply(transform(robot.position, robot.roll, 0, robot.pitch))
  if (robot.id === 'humanoid') {
    const angle = (key: string) => robot.joints[joints.humanoid.findIndex(joint => joint.id === key)]!
    const mount = sensorMounts.humanoid
    matrix.multiply(transform(mount.waist, 0, angle('waist.yaw'), angle('waist.bend'))).multiply(transform(mount.neck, 0, angle('neck.yaw'))).multiply(transform(mount.head))
  }
  const mount = sensorMounts[robot.id]
  return {
    lidar: xyz(new Vector3(...mount.lidar).add(new Vector3(0, .045 * mount.scale, 0)).applyMatrix4(matrix)),
    camera: xyz(new Vector3(...mount.camera).applyMatrix4(matrix)),
    cameraMatrix: matrix.clone().setPosition(new Vector3(...mount.camera).applyMatrix4(matrix)),
  }
}
type SensorPose = ReturnType<typeof sensorPose>
function detections(objects: EnvironmentObject[], shapes: Collider[], sensor: SensorPose, range: number): Detection[] {
  const inverse = sensor.cameraMatrix.clone().invert(), origin = new Vector3(...sensor.camera)
  return objects.map(object => {
    const bounds = objectBounds(object), center = new Vector3(...bounds.min).add(new Vector3(...bounds.max)).multiplyScalar(.5)
    let inView = true
    if (object.category === 'ground') {
      const downward = new Vector3(Math.cos(35 * Math.PI / 180), -Math.sin(35 * Math.PI / 180), 0).transformDirection(sensor.cameraMatrix)
      inView = new Ray(origin, downward).intersectPlane(new Plane(new Vector3(0, 1, 0), 0), center) !== null
    }
    const local = center.clone().applyMatrix4(inverse), distance = origin.distanceTo(center)
    const bearing = Math.atan2(local.z, local.x) * 180 / Math.PI
    const elevation = Math.atan2(local.y, Math.hypot(local.x, local.z)) * 180 / Math.PI
    let status: Detection['status'] = distance > range ? 'out-of-range' : !inView || local.x <= 0 || Math.abs(bearing) > 55 || Math.abs(elevation) > 40 ? 'out-of-view' : 'occluded'
    let visibility = 0
    if (status === 'occluded') {
      const samples = object.category === 'ground' ? [center] : object.parts.map(part => new Vector3(...part.center))
      visibility = samples.filter(sample => {
        const direction = sample.clone().sub(origin), hit = cast(shapes, sensor.camera, xyz(direction), direction.length() + .001)
        return hit?.objectId === object.id
      }).length / samples.length
      if (visibility > 0) status = 'detected'
    }
    return { id: object.id, name: object.name, category: object.category, anchor: xyz(center), distance, bearing, status,
      confidence: status === 'detected' ? clamp(.99 - distance * .012 - Math.abs(bearing) * .0015 - (1 - visibility) * .15, .5, .99) : 0 }
  })
}
export const detectEnvironment = (objects: EnvironmentObject[], sensor: SensorPose, range: number) => detections(objects, colliders(objects), sensor, range)

const emptyRoute = (): PlannedRoute => ({ status: 'idle', start: [...homePosition], goal: [...destinations[0]!.position], path: [], waypoint: 1, length: 0, travelled: 0, replans: 0, message: '选择终点后规划路线' })
function initialState(): PerceptionState {
  return { active: false, robot: 'quadruped', mode: 'lidar', scanning: true, scanSpeed: .4, range: 10, showPoints: true, showBeams: true, showContours: false, pointColor: 'class', density: 'high', position: [...homePosition], obstacleSide: 1, angle: 0, revision: 0, sensorOrigin: [0, 0, 0], cameraOrigin: [0, 0, 0], points: [], beams: [], history: [], historyId: null, selectedObject: null, detections: [], route: emptyRoute() }
}

/** 只由 SimulationAdapter 的 tick 推进；没有额外计时器或独立机器人运动状态。 */
export class PerceptionEngine {
  state = initialState()
  private objects = environmentObjects()
  private shapes = colliders(this.objects)
  private nextAngle = 0
  private totalAngle = 0
  private nextSweep = 1
  private framePoints: LidarPoint[] = []
  private sequence = 0

  reset() { this.state = initialState(); this.objects = environmentObjects(); this.shapes = colliders(this.objects); this.clear() }
  snapshot() { return structuredClone(this.state) }
  clear() {
    Object.assign(this.state, { points: [], beams: [], history: [], historyId: null, angle: 0 })
    this.nextAngle = 0; this.totalAngle = 0; this.nextSweep = 1; this.framePoints = []; this.state.revision++
  }
  stop(message = '路线已停止') {
    if (['running', 'paused'].includes(this.state.route.status)) { this.state.route.status = 'stopped'; this.state.route.message = message }
  }
  private plan(keepRunning = false) {
    const state = this.state, route = state.route
    route.path = planPath(state.position, route.goal, this.objects, restrictedZones, robotClearance[state.robot])
    route.start = [...state.position]; route.waypoint = 1; route.length = route.travelled + pathLength(route.path)
    route.status = route.path.length ? keepRunning ? 'running' : 'planned' : 'blocked'
    route.message = route.path.length ? '已绕开实体与禁行区域' : '终点不可达，请选择空闲地面'
  }
  send(command: PerceptionCommand, robots: Record<RobotId, RobotState>) {
    const state = this.state
    if (command.type === 'enter') {
      const robot = robots[command.robot]
      if (!robot.emergency) robot.worldPosition = [...homePosition]
      // 感知位置直接引用机器人的唯一世界坐标，急停后切换机型也不会重置锁定位姿。
      state.active = true; state.robot = command.robot; state.position = robot.worldPosition; state.route = emptyRoute(); state.selectedObject = null
      this.clear(); this.plan()
    } else if (command.type === 'leave') {
      const moving = ['running', 'paused'].includes(state.route.status)
      this.stop('已退出感知训练场'); state.active = false
      return moving ? 'stand' : undefined
    } else if (command.type === 'settings') {
      const values = command.values
      if ((values.scanSpeed !== undefined && !Number.isFinite(values.scanSpeed)) || (values.range !== undefined && !Number.isFinite(values.range))) throw new Error('扫描参数必须是有效数值。')
      if (values.mode !== undefined && !perceptionModes.some(mode => mode.id === values.mode)) throw new Error('未知感知模式。')
      const clear = values.range !== undefined && values.range !== state.range || values.density !== undefined && values.density !== state.density
      Object.assign(state, values)
      state.scanSpeed = clamp(state.scanSpeed, .1, 2); state.range = clamp(state.range, 3, 14)
      if (clear) this.clear()
      if (values.scanning) state.historyId = null
      state.revision++
    } else if (command.type === 'clear') this.clear()
    else if (command.type === 'select') {
      if (command.id && !this.objects.some(object => object.id === command.id)) throw new Error('场景中不存在该目标。')
      state.selectedObject = command.id
    } else if (command.type === 'history') {
      if (command.id !== null && !state.history.some(frame => frame.id === command.id)) throw new Error('扫描历史已清除。')
      state.historyId = command.id; state.scanning = command.id === null; state.revision++
      if (command.id !== null && state.route.status === 'running') { state.route.status = 'paused'; state.route.message = '查看扫描历史，路线已暂停'; return 'stand' }
    } else if (command.type === 'goal') {
      if (command.position.length !== 3 || !command.position.every(Number.isFinite)) throw new Error('目标位置必须是三个有效数值。')
      const moving = state.route.status === 'running'
      state.route.goal = [command.position[0], 0, command.position[2]]; state.route.travelled = 0; state.route.replans = 0; this.plan()
      if (moving) return 'stand'
    } else if (command.type === 'obstacle') {
      const side = state.obstacleSide === 1 ? -1 : 1, objects = environmentObjects(side)
      if (!isSegmentFree(state.position, state.position, objects, restrictedZones, robotClearance[state.robot])) throw new Error('箱体移动位置与机器人重叠，请先移动机器人。')
      const running = state.route.status === 'running', paused = state.route.status === 'paused'
      state.obstacleSide = side; this.objects = objects; this.shapes = colliders(objects); this.clear()
      state.route.replans++; this.plan(running)
      if (paused && state.route.status === 'planned') state.route.status = 'paused'
      if (running && state.route.status === 'blocked') return 'stand'
    } else if (command.type === 'route') {
      if (command.action === 'start') {
        if (robots[state.robot].emergency) throw new Error('请先解除急停，再执行路线。')
        if (state.route.status !== 'paused') { state.route.travelled = 0; this.plan() }
        if (!state.route.path.length) throw new Error(state.route.message)
        state.route.status = 'running'; state.route.message = '沿安全路线移动'; state.historyId = null
        return 'walk'
      }
      if (command.action === 'pause') { if (state.route.status === 'running') { state.route.status = 'paused'; state.route.message = '路线已暂停' }; return 'stand' }
      if (command.action === 'stop') { this.stop(); return 'stand' }
      if (robots[state.robot].emergency) throw new Error('请先解除急停，再重置路线。')
      state.position.splice(0, 3, ...homePosition); state.route = emptyRoute(); this.clear(); this.plan(); return 'stand'
    }
  }
  navigate(dt: number, robot: RobotState) {
    if (this.state.active) advanceRoute(dt, robot, this.state.route, this.objects, restrictedZones, robotClearance[robot.id])
  }

  tick(dt: number, time: number, robot: RobotState) {
    const state = this.state
    if (!state.active || (robot.emergency && dt > 0)) return
    const sensor = sensorPose(robot, state.position)
    state.sensorOrigin = sensor.lidar; state.cameraOrigin = sensor.camera
    state.detections = detections(this.objects, this.shapes, sensor, state.range)
    if (robot.emergency || !state.scanning || state.historyId !== null || dt <= 0) return
    this.totalAngle += dt * state.scanSpeed * tau
    state.angle = this.totalAngle % tau
    const step = tau / scanColumns[state.density], added: LidarPoint[] = []
    while (this.nextAngle <= this.totalAngle + 1e-8) {
      if (this.nextAngle >= this.nextSweep * tau - 1e-8) {
        state.history.unshift({ id: ++this.sequence, time, origin: [...sensor.lidar], points: [...this.framePoints] })
        state.history.length = Math.min(5, state.history.length); this.framePoints = []; this.nextSweep++
      }
      const angle = this.nextAngle % tau
      state.beams = []
      for (const elevation of scanElevations) {
        const direction: Vector3Tuple = [Math.cos(angle) * Math.cos(elevation), Math.sin(elevation), Math.sin(angle) * Math.cos(elevation)]
        const point = cast(this.shapes, sensor.lidar, direction, state.range)
        state.beams.push(point?.position ?? xyz(new Vector3(...sensor.lidar).addScaledVector(new Vector3(...direction), state.range)))
        if (point) { added.push(point); this.framePoints.push(point) }
      }
      this.nextAngle += step
    }
    state.points = state.points.concat(added).slice(-cloudCapacity); state.revision++
  }
}
