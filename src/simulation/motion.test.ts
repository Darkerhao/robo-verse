import { describe, expect, it } from 'vitest'
import { actions, robots } from '@/config/robots'
import { endEffectors, joints, rigs } from '@/config/joints'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { blendPoses, forwardEndEffector, gaitFoot, motionPose, neutralPose, solveLeg, worldFoot } from './kinematics'
import type { RobotCommand, RobotId } from '@/types/robot'

const advance = (adapter: SimulationAdapter, seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) adapter.tick(.05) }

describe('完整动作与关节约束', () => {
  for (const id of ['quadruped', 'humanoid'] as const) {
    it(`${id} 所有动作整周期有限、限位一致，足端不低于支撑面`, () => {
      const initial = new SimulationAdapter().snapshot().robots[id]
      expect(initial.joints).toHaveLength(robots[id].drivenAxes)
      for (const action of robots[id].actions) for (let i = 0; i <= 120; i++) {
        const pose = motionPose({ ...initial, action, phase: i / 120 * Math.PI * 2, actionTime: i / 120 * (actions[action].duration || 3), speed: robots[id].maxSpeed })
        pose.joints.forEach((angle, index) => {
          expect(Number.isFinite(angle), `${action}/${index}`).toBe(true)
          expect(angle).toBeGreaterThanOrEqual(joints[id][index]!.min)
          expect(angle).toBeLessThanOrEqual(joints[id][index]!.max)
        })
        for (let foot = 0; foot < rigs[id].hips.length; foot++) expect(worldFoot(id, pose, foot)[1], `${action}/${i}/${foot}`).toBeGreaterThanOrEqual(rigs[id].footHeight - .002)
      }
    })

    it(`${id} 连续切换、停止和恢复默认姿态没有指令瞬跳`, () => {
      const adapter = new SimulationAdapter()
      for (const action of robots[id].actions) {
        const before = adapter.snapshot().robots[id]
        adapter.send({ type: 'action', robot: id, action })
        expect(adapter.snapshot().robots[id].joints).toEqual(before.joints)
        advance(adapter, 1.5)
      }
      adapter.send({ type: 'stop', robot: id })
      advance(adapter, 2)
      const state = adapter.snapshot().robots[id]
      expect(state.action).toBe('stand'); expect(state.speed).toBe(0)
      expect(state.joints).toEqual(neutralPose(id).joints)
      expect(state.position).toEqual(neutralPose(id).position)
      expect(state.controlMode).toBe('motion')
    })
  }

  it('四拍行走保持至少三足支撑，小跑对角同步，奔跑足组与两者不同', () => {
    const initial = new SimulationAdapter().snapshot().robots.quadruped
    for (let phase = 0; phase < Math.PI * 2; phase += .03) {
      const pose = motionPose({ ...initial, action: 'walk', phase, speed: 1 })
      const supporting = rigs.quadruped.hips.filter((_, index) => worldFoot('quadruped', pose, index)[1] < .061).length
      expect(supporting).toBeGreaterThanOrEqual(3)
    }
    const trot = motionPose({ ...initial, action: 'trot', phase: 4.5, speed: 1.5 })
    const run = motionPose({ ...initial, action: 'run', phase: 4.5, speed: 1.5 })
    expect(worldFoot('quadruped', trot, 0)[1]).toBeCloseTo(worldFoot('quadruped', trot, 3)[1], 6)
    expect(worldFoot('quadruped', run, 0)[1]).toBeCloseTo(worldFoot('quadruped', run, 2)[1], 6)
    expect(trot.joints).not.toEqual(run.joints)
  })

  it('足端轨迹在支撑/摆动边界与周期边界连续', () => {
    for (const duty of [.42, .56, .64, .76]) for (const p of [0, duty, 1]) {
      const before = gaitFoot((p - 1e-6) * Math.PI * 2, .2, .1, duty)
      const after = gaitFoot((p + 1e-6) * Math.PI * 2, .2, .1, duty)
      expect(Math.hypot(before[0] - after[0], before[1] - after[1])).toBeLessThan(1e-5)
    }
  })

  it('零距离与过伸目标不会导致 NaN，界面会独立拒绝不可达目标', () => {
    for (const [x, depth] of [[0, 0], [10, 10], [0, .001]]) expect(solveLeg(x!, depth!, .37, .39).every(Number.isFinite)).toBe(true)
  })

  it('蹲下到站立的全过渡保持足端高度，而不只验证终点', () => {
    const adapter = new SimulationAdapter(), initial = adapter.snapshot().robots.quadruped
    const from = motionPose({ ...initial, action: 'crouch' }), to = neutralPose('quadruped')
    for (let t = 0; t <= 1; t += .01) {
      const pose = blendPoses('quadruped', from, to, t)
      for (let foot = 0; foot < 4; foot++) expect(worldFoot('quadruped', pose, foot)[1]).toBeCloseTo(.06, 6)
    }
  })

  it('跳跃包含下蹲、腾空和回落，单次动作自动完成，静态姿态保持', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'loop', robot: 'quadruped', value: false })
    adapter.send({ type: 'action', robot: 'quadruped', action: 'jump' })
    advance(adapter, .7); expect(adapter.snapshot().robots.quadruped.position[1]).toBeLessThan(rigs.quadruped.height)
    advance(adapter, .95); expect(adapter.snapshot().robots.quadruped.position[1]).toBeGreaterThan(rigs.quadruped.height + .2)
    advance(adapter, 2); expect(adapter.snapshot().robots.quadruped.action).toBe('stand')
    adapter.send({ type: 'action', robot: 'quadruped', action: 'sit' }); advance(adapter, 8)
    expect(adapter.snapshot().robots.quadruped.action).toBe('sit')
  })

  it('倍率改变动作时间，目标速度为零后停止迈步', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'rate', robot: 'humanoid', value: 2 })
    adapter.send({ type: 'action', robot: 'humanoid', action: 'wave' })
    advance(adapter, 1); expect(adapter.snapshot().robots.humanoid.actionTime).toBeCloseTo(2)
    adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' }); advance(adapter, 2)
    adapter.send({ type: 'speed', robot: 'quadruped', value: 0 }); advance(adapter, 2)
    const before = adapter.snapshot().robots.quadruped.joints
    advance(adapter, 1); expect(adapter.snapshot().robots.quadruped.joints).toEqual(before)
  })

  it('托举动作上臂自然下垂、前臂前伸，双手位于躯干前方', () => {
    const initial = new SimulationAdapter().snapshot().robots.humanoid
    const pose = motionPose({ ...initial, action: 'carry', speed: .4 })
    for (const effector of endEffectors.humanoid.filter(item => item.kind === 'hand')) {
      const [pitch, , elbow] = effector.indices.map(index => pose.joints[index]!)
      expect(Math.abs(pitch!)).toBeLessThan(.4)
      expect(elbow!).toBeGreaterThan(1)
      const [x, y] = forwardEndEffector('humanoid', pose, effector)
      expect(x).toBeGreaterThan(.35); expect(y).toBeGreaterThan(-.5)
    }
  })
})

describe('独立关节、末端 IK 与记录回放', () => {
  it('一个指间关节平滑到达限位，其他轴与另一机器人不被误改', () => {
    const adapter = new SimulationAdapter(), before = adapter.snapshot()
    const definition = joints.humanoid.find(joint => joint.id === 'right.finger1.1')!, index = joints.humanoid.indexOf(definition)
    adapter.send({ type: 'joint', robot: 'humanoid', joint: definition.id, value: 99 })
    expect(adapter.snapshot().robots.humanoid.joints).toEqual(before.robots.humanoid.joints)
    advance(adapter, 2)
    const after = adapter.snapshot()
    expect(after.robots.humanoid.joints[index]).toBe(definition.max)
    after.robots.humanoid.joints.forEach((value, axis) => { if (axis !== index) expect(value).toBe(before.robots.humanoid.joints[axis]) })
    expect(after.robots.quadruped.joints).toEqual(before.robots.quadruped.joints)
    expect(after.robots.humanoid.controlMode).toBe('joint')
    expect(after.robots.humanoid.position).toEqual(before.robots.humanoid.position)
  })

  it('手臂 IK 保持站立高度，腿部实验才抬高机身留出足端空间', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'ik', robot: 'humanoid', effector: 'right-hand', position: [.32, -.4, .12] }); advance(adapter, 2)
    expect(adapter.snapshot().robots.humanoid.position[1]).toBe(rigs.humanoid.height)
    adapter.send({ type: 'joint', robot: 'humanoid', joint: 'left-leg.knee', value: 1 }); advance(adapter, 2)
    expect(adapter.snapshot().robots.humanoid.position[1]).toBe(rigs.humanoid.height + .25)
    adapter.send({ type: 'stop', robot: 'humanoid' }); advance(adapter, 2)
    expect(adapter.snapshot().robots.humanoid.position[1]).toBe(rigs.humanoid.height)
  })

  for (const id of ['quadruped', 'humanoid'] as const) it(`${id} 全部末端可达目标由 FK 回算吻合，不可达输入不改变状态`, () => {
    const adapter = new SimulationAdapter()
    for (const effector of endEffectors[id]) {
      const target: [number, number, number] = effector.kind === 'foot' ? [.1, id === 'quadruped' ? -.6 : -.8, 0] : [.32, -.4, effector.side * .12]
      adapter.send({ type: 'ik', robot: id, effector: effector.id, position: target }); advance(adapter, 2)
      const state = adapter.snapshot().robots[id], actual = forwardEndEffector(id, state, effector)
      actual.forEach((value, index) => expect(value).toBeCloseTo(target[index]!, 6))
      expect(state.ikTarget?.position).toEqual(target)
    }
    const before = adapter.snapshot()
    expect(() => adapter.send({ type: 'ik', robot: id, effector: endEffectors[id][0]!.id, position: [5, 5, 5] })).toThrow('工作空间')
    expect(adapter.snapshot()).toEqual(before)
  })

  it('快照隔离位置、目标与关节数组，外部无法篡改下一次动作', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'ik', robot: 'humanoid', effector: 'right-hand', position: [.3, -.4, .1] })
    const state = adapter.snapshot()
    state.robots.humanoid.position[0] = 999; state.robots.humanoid.ikTarget!.position[0] = 999; state.robots.humanoid.jointTargets![0] = 999
    const next = adapter.snapshot().robots.humanoid
    expect(next.position[0]).not.toBe(999); expect(next.ikTarget!.position[0]).toBe(.3); expect(next.jointTargets![0]).not.toBe(999)
  })

  it('暂停/急停同样锁定关节、IK、倍率、记录和回放命令', () => {
    const commands: RobotCommand[] = [
      { type: 'joint', robot: 'humanoid', joint: 'right.elbow', value: -.5 },
      { type: 'ik', robot: 'humanoid', effector: 'right-hand', position: [.3, -.4, .1] },
      { type: 'rate', robot: 'humanoid', value: 2 }, { type: 'record', robot: 'humanoid', value: true }, { type: 'replay', robot: 'humanoid' },
    ]
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'pause', value: true })
    for (const command of commands) expect(() => adapter.send(command)).toThrow('继续仿真')
    adapter.send({ type: 'pause', value: false }); adapter.send({ type: 'emergency', robot: 'humanoid' })
    for (const command of commands) expect(() => adapter.send(command)).toThrow('解除急停')
  })

  it('记录实际关节姿态，暂停冻结记录，单次回放终点与原姿态完全一致', () => {
    const adapter = new SimulationAdapter()
    expect(() => adapter.send({ type: 'replay', robot: 'humanoid' })).toThrow('记录一段')
    adapter.send({ type: 'record', robot: 'humanoid', value: true })
    adapter.send({ type: 'joint', robot: 'humanoid', joint: 'right.wrist', value: .8 }); advance(adapter, 1)
    adapter.send({ type: 'pause', value: true })
    const frames = adapter.snapshot().robots.humanoid.recordedFrames
    advance(adapter, 1); expect(adapter.snapshot().robots.humanoid.recordedFrames).toBe(frames)
    adapter.send({ type: 'pause', value: false })
    adapter.send({ type: 'joint', robot: 'humanoid', joint: 'right.finger1.0', value: .9 }); advance(adapter, 1)
    adapter.send({ type: 'record', robot: 'humanoid', value: false })
    const recorded = adapter.snapshot().robots.humanoid
    expect(recorded.recordedDuration).toBeCloseTo(2)
    expect(adapter.snapshot().robots.quadruped.recordedFrames).toBe(0)
    adapter.send({ type: 'action', robot: 'humanoid', action: 'stand' }); advance(adapter, 2)
    adapter.send({ type: 'loop', robot: 'humanoid', value: false }); adapter.send({ type: 'replay', robot: 'humanoid' })
    advance(adapter, 2.2)
    const replayed = adapter.snapshot().robots.humanoid
    expect(replayed.controlMode).toBe('joint')
    expect(replayed.joints).toEqual(recorded.joints); expect(replayed.position).toEqual(recorded.position)
    adapter.send({ type: 'clearRecording', robot: 'humanoid' }); expect(adapter.snapshot().robots.humanoid.recordedFrames).toBe(0)
  })

  it('记录有 20 秒上限，循环回放可停止，重置清除两机记录', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'record', robot: 'quadruped', value: true }); advance(adapter, 22)
    const state = adapter.snapshot().robots.quadruped
    expect(state.recording).toBe(false); expect(state.recordedDuration).toBeLessThanOrEqual(20)
    adapter.send({ type: 'replay', robot: 'quadruped' }); advance(adapter, 25)
    expect(adapter.snapshot().robots.quadruped.controlMode).toBe('replay')
    adapter.send({ type: 'stop', robot: 'quadruped' }); advance(adapter, 2)
    expect(adapter.snapshot().robots.quadruped.joints).toEqual(neutralPose('quadruped').joints)
    adapter.send({ type: 'reset' }); expect(adapter.snapshot().robots.quadruped.recordedFrames).toBe(0)
  })

  it('包含转向的记录在开始与循环边界平滑衔接朝向', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'record', robot: 'quadruped', value: true })
    adapter.send({ type: 'action', robot: 'quadruped', action: 'turnRight' }); advance(adapter, 2)
    adapter.send({ type: 'record', robot: 'quadruped', value: false })
    const previous = adapter.snapshot().robots.quadruped.heading
    adapter.send({ type: 'replay', robot: 'quadruped' }); adapter.tick(.05)
    expect(Math.abs(adapter.snapshot().robots.quadruped.heading - previous)).toBeLessThan(2)
    advance(adapter, 1.9)
    const edge = adapter.snapshot().robots.quadruped.heading
    adapter.tick(.1)
    expect(Math.abs(adapter.snapshot().robots.quadruped.heading - edge)).toBeLessThan(5)
  })
})
