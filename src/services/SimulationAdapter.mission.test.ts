import { describe, expect, it } from 'vitest'
import { SimulationAdapter } from './SimulationAdapter'
import { missionScenes, missions, terrainHeight } from '@/config/missions'
import { endEffectors, joints } from '@/config/joints'
import { createRobot } from '@/three/RobotModel'
import { Vector3 } from 'three'
import { handWorld } from '@/simulation/missionKinematics'
import { objectBounds } from '@/config/perception'
import { Box3 } from 'three'
import { isSegmentFree, planPath } from '@/simulation/pathPlanning'
import { worldFoot } from '@/simulation/kinematics'
import type { MissionId } from '@/types/mission'

const select = (adapter: SimulationAdapter, id: MissionId) => adapter.send({ type: 'mission', command: { type: 'select', id } })
const control = (adapter: SimulationAdapter, type: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'leave') => adapter.send({ type: 'mission', command: { type } })
const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < seconds * 10; i++) adapter.tick(.1) }

describe('任务中心完整执行', () => {
  for (const definition of Object.values(missions)) it(`${definition.name}完整闭环，步骤/结果/动作一致`, () => {
    const adapter = new SimulationAdapter(); select(adapter, definition.id); control(adapter, 'start')
    let prior = 0, moved = false, held = false, terrainContact = 0
    for (let i = 0; i < 2400; i++) {
      adapter.tick(.1)
      const { mission, robots } = adapter.snapshot(), robot = robots[definition.robot]
      expect(mission.progress).toBeGreaterThanOrEqual(prior - 1e-8); prior = mission.progress
      expect(robot.joints.every((value, index) => value >= joints[robot.id][index]!.min - 1e-8 && value <= joints[robot.id][index]!.max + 1e-8)).toBe(true)
      moved ||= Math.hypot(...robot.worldPosition.map((v, axis) => v - definition.start[axis]!)) > .1
      held ||= mission.attached
      if (definition.id === 'terrain' && mission.step > 0 && mission.status === 'running') {
        for (let footIndex = 0; footIndex < 4; footIndex++) {
          const foot = worldFoot('quadruped', robot, footIndex), height = terrainHeight(robot.worldPosition[0] + foot[0], foot[2])
          if (height > 0) { terrainContact++; expect(foot[1] - .06).toBeGreaterThanOrEqual(height - .025) }
        }
      }
      if (['succeeded', 'failed'].includes(mission.status)) break
    }
    const { mission, robots } = adapter.snapshot()
    expect(mission.status, mission.message).toBe('succeeded')
    expect(mission.progress).toBe(1); expect(mission.step).toBe(definition.steps.length); expect(mission.result).toContain('完成')
    expect(robots[definition.robot].action).toBe('stand'); expect(mission.events.filter(event => event.message.startsWith('完成：'))).toHaveLength(definition.steps.length)
    if (definition.id !== 'interaction') expect(moved).toBe(true)
    if (['pick', 'transport'].includes(definition.id)) { expect(held).toBe(true); expect(mission.attached).toBe(false); expect(mission.payloadPosition).toEqual([3, 1.12, 0]) }
    if (definition.id === 'terrain') expect(terrainContact).toBeGreaterThan(20)
    if (['inspection', 'patrol', 'rescue'].includes(definition.id)) expect(robots.quadruped.worldPosition).toEqual(definition.start)
  })
  it('每类场景有独立环境，任务覆盖所有六类场景', () => {
    expect(new Set(Object.values(missions).map(m => m.scene)).size).toBe(6)
    expect(new Set(Object.values(missionScenes).map(s => JSON.stringify(s.objects))).size).toBe(6)
  })
  it('任务暂停冻结机器人/物体/进度，继续和全局暂停不重复步骤', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'transport'); control(adapter, 'start')
    for (let i = 0; i < 300 && !adapter.snapshot().mission.attached; i++) adapter.tick(.1)
    expect(adapter.snapshot().mission.attached).toBe(true)
    control(adapter, 'pause'); const paused = adapter.snapshot(); advance(adapter, 5)
    expect(adapter.snapshot().mission).toEqual(paused.mission); expect(adapter.snapshot().robots.humanoid).toEqual(paused.robots.humanoid)
    control(adapter, 'resume'); advance(adapter, 2)
    adapter.send({ type: 'pause', value: true }); const global = adapter.snapshot(); advance(adapter, 2); expect(adapter.snapshot()).toEqual(global)
    adapter.send({ type: 'pause', value: false }); advance(adapter, 40); expect(adapter.snapshot().mission.status).toBe('succeeded')
  })
  it('停止持物保留对象，重置恢复，连续开始拒绝且不破坏任务', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'pick'); control(adapter, 'start')
    expect(() => control(adapter, 'start')).toThrow('重置')
    advance(adapter, 8); control(adapter, 'stop'); const stopped = adapter.snapshot(); advance(adapter, 5)
    expect(adapter.snapshot().mission).toEqual(stopped.mission); expect(adapter.snapshot().robots.humanoid).toEqual(stopped.robots.humanoid)
    control(adapter, 'reset'); expect(adapter.snapshot().mission.status).toBe('ready'); expect(adapter.snapshot().mission.payloadPosition).toEqual([-2, 1.12, 0])
  })
  it('急停不解除锁，非法输入不取消，手动接管结束任务', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'inspection'); control(adapter, 'start'); advance(adapter, 1)
    expect(() => adapter.send({ type: 'speed', robot: 'quadruped', value: NaN })).toThrow(); expect(adapter.snapshot().mission.status).toBe('running')
    adapter.send({ type: 'emergency', robot: 'quadruped' }); expect(adapter.snapshot().mission.status).toBe('stopped')
    expect(() => control(adapter, 'reset')).toThrow('急停'); expect(() => select(adapter, 'transport')).toThrow('急停')
    adapter.send({ type: 'release', robot: 'quadruped' }); select(adapter, 'inspection'); control(adapter, 'start'); advance(adapter, 1)
    adapter.send({ type: 'action', robot: 'quadruped', action: 'sit' }); expect(adapter.snapshot().mission.status).toBe('stopped'); expect(adapter.snapshot().robots.quadruped.action).toBe('sit')
  })
  it('双手 FK 与真实模型掌心一致', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'pick'); control(adapter, 'start'); advance(adapter, 5)
    const robot = adapter.snapshot().robots.humanoid, model = createRobot('humanoid')
    model.update(robot, .1, true); model.root.position.fromArray(robot.worldPosition); model.root.updateMatrixWorld(true)
    for (const effector of endEffectors.humanoid.filter(e => e.kind === 'hand')) {
      const key = effector.side < 0 ? 'left' : 'right'
      const palm = model.root.getObjectByName(`humanoid/body/waist/${key}-shoulder/elbow/wrist/palm`)!
      expect(palm.getWorldPosition(new Vector3()).distanceTo(new Vector3(...handWorld(robot, robot, effector.side)))).toBeLessThan(1e-8)
    }
  })
  it('抓取抬起及搬运时箱体不穿入源支架或目标支架', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'transport'); control(adapter, 'start')
    for (let i = 0; i < 650; i++) {
      adapter.tick(.1)
      const { mission } = adapter.snapshot()
      if (!mission.attached) continue
      const payload = objectBounds(mission.objects.find(object => object.id === 'payload')!)
      const box = new Box3(new Vector3(...payload.min), new Vector3(...payload.max))
      box.expandByScalar(-.012)
      for (const support of mission.objects.filter(object => object.support)) {
        const bounds = objectBounds(support), solid = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max))
        expect(box.intersectsBox(solid), `${mission.step} ${mission.stepElapsed} ${support.id} ${JSON.stringify(mission.payloadPosition)}`).toBe(false)
      }
    }
    expect(adapter.snapshot().mission.status).toBe('succeeded')
  })
  it('靠近支架的安全精确终点连接可达网格，路径不削减安全边界', () => {
    const objects = missionScenes.warehouse.objects.filter(object => object.id !== 'payload')
    const path = planPath([-2.84, 0, 0], [2.16, 0, 0], objects, [], .7)
    expect(path.length).toBeGreaterThan(2)
    path.slice(1).forEach((point, index) => expect(isSegmentFree(path[index]!, point, objects, [], .7)).toBe(true))
  })
  it('真实机械足部包围盒在阶梯过程中保持接触高度', () => {
    const adapter = new SimulationAdapter(), model = createRobot('quadruped')
    select(adapter, 'terrain'); control(adapter, 'start')
    for (let tick = 0; tick < 450; tick++) {
      adapter.tick(.1)
      const state = adapter.snapshot(), robot = state.robots.quadruped
      model.update(robot, .1, true); model.root.position.fromArray(robot.worldPosition); model.root.updateMatrixWorld(true)
      if (state.mission.status !== 'running') continue
      for (const effector of endEffectors.quadruped) {
        const ankle = model.root.getObjectByName(`quadruped/body/${effector.id}/hip/knee/ankle`)!
        const box = new Box3().setFromObject(ankle)
        for (const part of missionScenes.stairs.objects.filter(object => object.category === 'stairs').flatMap(object => object.parts)) {
          if (box.max.x < part.center[0] - part.size[0] / 2 || box.min.x > part.center[0] + part.size[0] / 2) continue
          if (box.max.z < part.center[2] - part.size[2] / 2 || box.min.z > part.center[2] + part.size[2] / 2) continue
          expect(box.min.y, `${tick} ${effector.id}`).toBeGreaterThanOrEqual(part.center[1] + part.size[1] / 2 - .015)
        }
      }
    }
    expect(adapter.snapshot().mission.status).toBe('succeeded')
  })
  it('退出页面停止任务并保留最终位姿，重返任务恢复初始对象', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'transport'); control(adapter, 'start'); advance(adapter, 12)
    control(adapter, 'leave'); const robot = adapter.snapshot().robots.humanoid, object = adapter.snapshot().mission.payloadPosition
    advance(adapter, 5); expect(adapter.snapshot().robots.humanoid.joints).toEqual(robot.joints); expect(adapter.snapshot().mission.payloadPosition).toEqual(object)
    select(adapter, 'transport'); expect(adapter.snapshot().mission.attached).toBe(false); expect(adapter.snapshot().mission.payloadPosition).toEqual([-2, 1.12, 0])
  })
  it('首次选择人形任务不接管另一台机器狗的动作', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' }); advance(adapter, 1)
    select(adapter, 'transport')
    expect(adapter.snapshot().robots.quadruped.controlMode).toBe('motion')
    expect(adapter.snapshot().robots.quadruped.action).toBe('walk')
  })
  it('持物急停后解除只解锁，保持任务姿态和箱体接触直到重置', () => {
    const adapter = new SimulationAdapter(); select(adapter, 'transport'); control(adapter, 'start'); advance(adapter, 12)
    adapter.send({ type: 'emergency', robot: 'humanoid' }); const frozen = adapter.snapshot()
    expect(frozen.mission.attached).toBe(true)
    adapter.send({ type: 'release', robot: 'humanoid' }); advance(adapter, 1)
    expect(adapter.snapshot().robots.humanoid.joints).toEqual(frozen.robots.humanoid.joints)
    expect(adapter.snapshot().mission.payloadPosition).toEqual(frozen.mission.payloadPosition)
    expect(adapter.snapshot().robots.humanoid.emergency).toBe(false)
    adapter.send({ type: 'emergency', robot: 'humanoid' }); adapter.send({ type: 'release', robot: 'humanoid' }); advance(adapter, 1)
    expect(adapter.snapshot().robots.humanoid.joints).toEqual(frozen.robots.humanoid.joints)
    control(adapter, 'reset'); expect(adapter.snapshot().mission.status).toBe('ready')
  })
  it('全局暂停进入任务被拒绝时，恢复后需重置，不能创建不推进的运行任务', () => {
    const adapter = new SimulationAdapter(); adapter.send({ type: 'pause', value: true })
    expect(() => select(adapter, 'inspection')).toThrow('全局仿真')
    adapter.send({ type: 'pause', value: false }); expect(() => control(adapter, 'start')).toThrow('重置')
    control(adapter, 'reset'); control(adapter, 'start'); advance(adapter, 1); expect(adapter.snapshot().mission.progress).toBeGreaterThan(0)
  })
  it('页面卸载前清理旧会话，再初始化任务后正常推进', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'perception', command: { type: 'enter', robot: 'humanoid' } })
    adapter.send({ type: 'perception', command: { type: 'leave' } })
    select(adapter, 'transport')
    control(adapter, 'start'); advance(adapter, 1); expect(adapter.snapshot().mission.progress).toBeGreaterThan(0)
  })
})
