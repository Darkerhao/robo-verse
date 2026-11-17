import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { environmentObjects, objectBounds, restrictedZones, robotClearance, homePosition, cloudCapacity } from '@/config/perception'
import type { EnvironmentObject, PerceptionCommand } from '@/config/perception'
import type { RobotId, Vector3Tuple } from '@/types/robot'
import { planPath, isSegmentFree } from './pathPlanning'
import { castEnvironmentRay, sensorPose, detectEnvironment } from './perception'
import { createRobot } from '@/three/RobotModel'

const send = (adapter: SimulationAdapter, command: PerceptionCommand) => adapter.send({ type: 'perception', command })
const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < seconds * 10; i++) adapter.tick(.1) }

describe('感知几何与安装位置', () => {
  it('射线只返回最近实体表面，距离外和没有交点的方向不生成点', () => {
    const objects: EnvironmentObject[] = [1, 3].map(x => ({ id: String(x), name: '箱体', category: 'box', parts: [{ center: [x, 1, 0], size: [.5, 1, 1] }] }))
    const hit = castEnvironmentRay(objects, [0, 1, 0], [1, 0, 0], 5)!
    expect(hit.objectId).toBe('1'); expect(hit.position).toEqual([.75, 1, 0]); expect(hit.distance).toBe(.75)
    expect(castEnvironmentRay(objects, [0, 1, 0], [1, 0, 0], .5)).toBeNull()
    expect(castEnvironmentRay(objects, [0, 1, 0], [0, 1, 0], 5)).toBeNull()
  })
  it('球体目标交点落在实际球面，不落在包围盒空角', () => {
    const sphere: EnvironmentObject = { id: 'sphere', name: '球', category: 'target', parts: [{ center: [2, 1, 0], size: [1, 1, 1], sphere: true }] }
    const hit = castEnvironmentRay([sphere], [0, 1, .3], [1, 0, 0], 4)!
    expect(hit.position[0]).toBeCloseTo(1.6)
    expect(new Vector3(...hit.position).distanceTo(new Vector3(2, 1, 0))).toBeCloseTo(.5)
  })
  it('两机传感器变换与真实机械节点一致，包含身体倾斜、朝向和人形腰颈', () => {
    for (const id of ['quadruped', 'humanoid'] as const) {
      const state = new SimulationAdapter().snapshot().robots[id]
      state.heading = 48; state.roll = .04; state.pitch = -.08
      if (id === 'humanoid') { state.joints[6] = .2; state.joints[7] = -.25; state.joints[8] = .3 }
      const position: Vector3Tuple = [2, 0, -1], model = createRobot(id)
      model.root.position.fromArray(position); model.update(state, 0, true); model.root.updateMatrixWorld(true)
      const path = id === 'quadruped' ? `${id}/body/lidar` : `${id}/body/waist/neck/head/lidar`
      const actual = model.root.getObjectByName(path)!.localToWorld(new Vector3(0, .045, 0))
      const sensor = sensorPose(state, position)
      expect(new Vector3(...sensor.lidar).distanceTo(actual)).toBeLessThan(1e-8)
      const leftPath = id === 'quadruped' ? `${id}/body/sensor-bridge/stereo--1` : `${id}/body/waist/neck/head/stereo--1`
      const rightPath = leftPath.replace('stereo--1', 'stereo-1')
      const camera = model.root.getObjectByName(leftPath)!.getWorldPosition(new Vector3()).add(model.root.getObjectByName(rightPath)!.getWorldPosition(new Vector3())).multiplyScalar(.5)
      expect(new Vector3(...sensor.camera).distanceTo(camera)).toBeLessThan(1e-8)
    }
  })
  it('摄像头结果随朝向和遮挡变化，不将后方或遮挡物标为已识别', () => {
    const objects: EnvironmentObject[] = [2, 4].map(x => ({ id: String(x), name: '目标', category: 'box', parts: [{ center: [x, 1, 0], size: [1, 2, 2] }] }))
    const robot = new SimulationAdapter().snapshot().robots.quadruped
    const detections = detectEnvironment(objects, sensorPose(robot, [0, 0, 0]), 10)
    expect(detections.find(d => d.id === '2')!.status).toBe('detected')
    expect(detections.find(d => d.id === '4')!.status).toBe('occluded')
    robot.heading = 180
    expect(detectEnvironment(objects, sensorPose(robot, [0, 0, 0]), 10).every(d => d.status === 'out-of-view')).toBe(true)
  })
  it('训练场包含七类实体，实体包围盒对应其几何', () => {
    const objects = environmentObjects()
    expect(new Set(objects.map(object => object.category)).size).toBe(7)
    for (const object of objects) {
      const bounds = objectBounds(object), box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
      object.parts.forEach(part => expect(box.containsPoint(new Vector3(...part.center))).toBe(true))
    }
  })
  it('两机地面识别锚点均位于真实摄像头垂直视场内', () => {
    for (const id of ['quadruped', 'humanoid'] as const) {
      const robot = new SimulationAdapter().snapshot().robots[id], sensor = sensorPose(robot, homePosition)
      const ground = detectEnvironment(environmentObjects(), sensor, 10).find(object => object.category === 'ground')!
      expect(ground.status).toBe('detected')
      const local = new Vector3(...ground.anchor).applyMatrix4(sensor.cameraMatrix.clone().invert())
      expect(Math.abs(Math.atan2(local.y, Math.hypot(local.x, local.z)) * 180 / Math.PI)).toBeLessThanOrEqual(40)
    }
  })
})

describe('路线规划与几何避障', () => {
  it.each(['quadruped', 'humanoid'] as const)('%s 导航安全半径覆盖最高行走速度的机械实体包络', id => {
    const adapter = new SimulationAdapter(), model = createRobot(id)
    adapter.send({ type: 'speed', robot: id, value: 99 }); adapter.send({ type: 'action', robot: id, action: 'walk' })
    let radius = 0
    for (let i = 0; i < 60; i++) {
      adapter.tick(.1); model.update(adapter.snapshot().robots[id], 0, true)
      const box = new Box3().setFromObject(model.root)
      radius = Math.max(radius, Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))))
    }
    expect(radius).toBeLessThanOrEqual(robotClearance[id])
  })
  it.each(['quadruped', 'humanoid'] as const)('%s 路径绕开实体和禁行区域，所有连续路段有足够占地间距', id => {
    const objects = environmentObjects(), radius = robotClearance[id]
    expect(isSegmentFree(homePosition, [4.5, 0, 0], objects, restrictedZones, radius)).toBe(false)
    const path = planPath(homePosition, [4.5, 0, 0], objects, restrictedZones, radius)
    expect(path.length).toBeGreaterThan(2); expect(path[0]).toEqual(homePosition); expect(path.at(-1)).toEqual([4.5, 0, 0])
    path.slice(1).forEach((point, i) => expect(isSegmentFree(path[i]!, point, objects, restrictedZones, radius)).toBe(true))
  })
  it('实体内部、禁行区和训练场之外的终点明确无法到达', () => {
    for (const goal of [[0, 0, 0], [3.4, 0, -3.5], [8, 0, 0]] as Vector3Tuple[]) {
      expect(planPath(homePosition, goal, environmentObjects(), restrictedZones, .95)).toEqual([])
    }
  })
})

describe('感知与机器人运动共用仿真时钟', () => {
  it('旋转扫描产生实体关联点和完整扫描历史；暂停保持角度、点云与姿态', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); advance(adapter, 4)
    const perception = adapter.snapshot().perception
    expect(perception.points.length).toBeGreaterThan(100); expect(perception.history.length).toBeGreaterThan(0)
    for (const point of perception.points) {
      const object = environmentObjects().find(item => item.id === point.objectId)!, bounds = objectBounds(object)
      expect(new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)).expandByScalar(1e-7).containsPoint(new Vector3(...point.position))).toBe(true)
      expect(point.distance).toBeLessThanOrEqual(perception.range)
    }
    adapter.send({ type: 'pause', value: true }); const frozen = adapter.snapshot(); advance(adapter, 2)
    expect(adapter.snapshot()).toEqual(frozen)
  })
  it('扫描范围和画质控制有效，关停后清除不会继续生成点，历史有界', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'humanoid' })
    send(adapter, { type: 'settings', values: { range: 3, density: 'low', scanSpeed: 2 } }); advance(adapter, 8)
    const perception = adapter.snapshot().perception
    expect(perception.points.length).toBeLessThanOrEqual(cloudCapacity); expect(perception.history.length).toBeLessThanOrEqual(5)
    expect(perception.points.every(point => point.distance <= 3)).toBe(true)
    send(adapter, { type: 'settings', values: { scanning: false } }); send(adapter, { type: 'clear' }); advance(adapter, 1)
    expect(adapter.snapshot().perception.points).toEqual([]); expect(adapter.snapshot().perception.history).toEqual([])
  })
  it.each(['quadruped', 'humanoid'] as const)('%s 实际沿路线移动，步态与传感器位置同步，抵达后归站姿', (id: RobotId) => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: id }); send(adapter, { type: 'goal', position: [4.5, 0, 0] }); send(adapter, { type: 'route', action: 'start' })
    const initial = adapter.snapshot().perception
    advance(adapter, 2)
    const moving = adapter.snapshot()
    expect(moving.robots[id].action).toBe('walk'); expect(moving.robots[id].speed).toBeGreaterThan(0)
    expect(moving.perception.position).not.toEqual(initial.position); expect(moving.perception.sensorOrigin).not.toEqual(initial.sensorOrigin)
    for (let i = 0; i < 400 && adapter.snapshot().perception.route.status === 'running'; i++) {
      const previous = adapter.snapshot().perception.position; adapter.tick(.1)
      expect(isSegmentFree(previous, adapter.snapshot().perception.position, environmentObjects(), restrictedZones, robotClearance[id])).toBe(true)
    }
    const finished = adapter.snapshot()
    expect(finished.perception.route.status).toBe('arrived'); expect(finished.perception.position).toEqual([4.5, 0, 0])
    expect(finished.robots[id].action).toBe('stand'); expect(finished.robots[id].speed).toBe(0)
    expect(finished.perception.route.travelled).toBeGreaterThan(9)
  })
  it('暂停/继续、停止与退出有完整控制语义，其他机型保持独立', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, 1)
    send(adapter, { type: 'route', action: 'pause' }); const position = adapter.snapshot().perception.position; advance(adapter, 1)
    expect(adapter.snapshot().perception.position).toEqual(position)
    send(adapter, { type: 'route', action: 'start' }); advance(adapter, 1)
    expect(adapter.snapshot().perception.position).not.toEqual(position)
    send(adapter, { type: 'leave' }); const exited = adapter.snapshot().perception; advance(adapter, 1)
    expect(adapter.snapshot().perception).toEqual(exited); expect(adapter.snapshot().robots.quadruped.action).toBe('stand')
    expect(adapter.snapshot().robots.humanoid.action).toBe('stand')
  })
  it('动态箱体切到当前路线时重新规划，保留当前位置且新路径无碰撞', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, .5)
    const before = adapter.snapshot().perception
    send(adapter, { type: 'obstacle' }); const after = adapter.snapshot().perception
    expect(after.position).toEqual(before.position); expect(after.route.replans).toBe(1)
    expect(after.route.path).not.toEqual(before.route.path)
    after.route.path.slice(1).forEach((point, i) => expect(isSegmentFree(after.route.path[i]!, point, environmentObjects(-1), restrictedZones, robotClearance.quadruped)).toBe(true))
  })
  it('急停冻结传感器与位置，路线重置不能解除急停或恢复驱动', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, 1)
    adapter.send({ type: 'emergency', robot: 'quadruped' }); const frozen = adapter.snapshot().perception; advance(adapter, 1)
    expect(adapter.snapshot().perception).toEqual(frozen)
    expect(() => send(adapter, { type: 'route', action: 'start' })).toThrow('解除急停')
    expect(() => send(adapter, { type: 'route', action: 'reset' })).toThrow('解除急停')
    expect(adapter.snapshot().perception.position).toEqual(frozen.position)
    expect(adapter.snapshot().robots.quadruped.emergency).toBe(true); expect(adapter.snapshot().robots.quadruped.power).toBe(0)
  })
  it('切换五种视图不重置路线/位置，快照与历史隔离外部修改', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); advance(adapter, 3)
    const before = adapter.snapshot().perception
    for (const mode of ['normal', 'lidar', 'cloud', 'vision', 'path'] as const) {
      send(adapter, { type: 'settings', values: { mode } })
      expect(adapter.snapshot().perception.position).toEqual(before.position)
    }
    const external = adapter.snapshot().perception
    external.position[0] = 999; external.points[0]!.position[0] = 999; external.history[0]!.points[0]!.position[0] = 999
    expect(adapter.snapshot().perception.position[0]).not.toBe(999)
    expect(adapter.snapshot().perception.points[0]!.position[0]).not.toBe(999)
    expect(adapter.snapshot().perception.history[0]!.points[0]!.position[0]).not.toBe(999)
  })
  it('急停后切换机型并让另一台移动，不改变已锁定机器人的世界位置', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, 1)
    adapter.send({ type: 'emergency', robot: 'quadruped' }); const locked = adapter.snapshot().perception.position
    send(adapter, { type: 'enter', robot: 'humanoid' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, 2)
    send(adapter, { type: 'enter', robot: 'quadruped' })
    expect(adapter.snapshot().perception.position).toEqual(locked)
    expect(adapter.snapshot().robots.quadruped.emergency).toBe(true)
  })
  it('全局暂停中解除急停，传感器立即跟随确认的站姿更新', () => {
    const adapter = new SimulationAdapter()
    send(adapter, { type: 'enter', robot: 'quadruped' })
    adapter.send({ type: 'action', robot: 'quadruped', action: 'crouch' }); advance(adapter, 2)
    adapter.send({ type: 'pause', value: true }); adapter.send({ type: 'emergency', robot: 'quadruped' }); adapter.send({ type: 'release', robot: 'quadruped' })
    const snapshot = adapter.snapshot(), sensor = sensorPose(snapshot.robots.quadruped, snapshot.perception.position)
    expect(snapshot.perception.sensorOrigin).toEqual(sensor.lidar); expect(snapshot.perception.cameraOrigin).toEqual(sensor.camera)
  })
  it('自动路线不被工作台单次播放提前结束，离开后仍保留原倍率与单次语义', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'loop', robot: 'quadruped', value: false }); adapter.send({ type: 'rate', robot: 'quadruped', value: 2 })
    send(adapter, { type: 'enter', robot: 'quadruped' }); send(adapter, { type: 'route', action: 'start' }); advance(adapter, 4)
    let snapshot = adapter.snapshot()
    expect(snapshot.perception.route.status).toBe('running'); expect(snapshot.robots.quadruped.action).toBe('walk')
    expect(snapshot.robots.quadruped.loop).toBe(false); expect(snapshot.robots.quadruped.motionRate).toBe(2)
    advance(adapter, 16); snapshot = adapter.snapshot()
    expect(snapshot.perception.route.status).toBe('arrived')
    send(adapter, { type: 'leave' }); adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' }); advance(adapter, 2)
    expect(adapter.snapshot().robots.quadruped.action).toBe('stand')
  })
})
