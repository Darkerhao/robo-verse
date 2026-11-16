import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createRobot } from './RobotModel'
import { findRobotPart } from './RobotParts'
import { SimulationAdapter } from '@/services/SimulationAdapter'
import { endEffectors, joints } from '@/config/joints'
import { actions, robots } from '@/config/robots'
import { motionPose } from '@/simulation/kinematics'

function nodes(root: THREE.Object3D) {
  const all: THREE.Object3D[] = []
  root.traverse(node => all.push(node))
  return all
}
function named(root: THREE.Object3D, suffix: string) {
  const node = nodes(root).find(item => item.name.endsWith(suffix))
  expect(node, suffix).toBeDefined()
  return node!
}
function position(node: THREE.Object3D) { return node.getWorldPosition(new THREE.Vector3()) }

describe('程序化机械模型', () => {
  for (const id of ['quadruped', 'humanoid'] as const) {
    it(`${id} 所有实体可追溯到稳定部件，隐藏外壳后保留真实内部结构`, () => {
      const { root } = createRobot(id)
      const all = nodes(root)
      expect(new Set(all.map(node => node.name)).size).toBe(all.length)
      for (const node of all) {
        if (!(node instanceof THREE.Mesh)) continue
        expect(findRobotPart(node)?.id).toBeTruthy()
        expect(node.geometry.attributes.position!.count).toBeGreaterThan(0)
        expect(Array.from(node.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true)
      }
      for (const kind of ['shell', 'frame', 'power', 'controller', 'sensor', 'cooling', 'interface']) {
        const parts = all.filter(node => node.userData.part?.kind === kind)
        expect(parts.length, kind).toBeGreaterThan(0)
        for (const item of parts) expect(nodes(item).some(node => node instanceof THREE.Mesh), item.name).toBe(true)
      }
      all.filter(node => node.userData.part?.kind === 'shell').forEach(node => { node.visible = false })
      for (const suffix of ['/battery', '/controller', '/imu']) {
        const module = named(root, suffix)
        let current: THREE.Object3D | null = module
        while (current) { expect(current.visible, module.name).toBe(true); current = current.parent }
      }
      const sensors = all.filter(node => node.userData.part?.kind === 'sensor').map(node => node.name)
      expect(sensors.some(name => name.endsWith('/lidar'))).toBe(true)
      expect(sensors.filter(name => name.includes('/stereo-'))).toHaveLength(2)
      expect(sensors.some(name => name.endsWith('/depth'))).toBe(true)
    })

    it(`${id} 既有步态驱动真实关节链，足端高度与运动学求解一致`, () => {
      const model = createRobot(id)
      const adapter = new SimulationAdapter()
      adapter.send({ type: 'action', robot: id, action: 'walk' })
      for (let i = 0; i < 25; i++) adapter.tick(.1)
      const state = adapter.snapshot().robots[id]
      model.update(state, .1, true)
      model.root.updateMatrixWorld(true)
      const hips = nodes(model.root).filter(node => node.name.endsWith('/hip'))
      expect(hips).toHaveLength(id === 'quadruped' ? 4 : 2)
      hips.forEach((hip, i) => {
        const knee = named(hip, '/knee'), ankle = named(knee, '/ankle')
        expect(knee.parent).toBe(hip); expect(ankle.parent).toBe(knee)
        expect(hip.rotation.z).toBeCloseTo(state.joints[i * 3]!)
        expect(knee.rotation.z).toBeCloseTo(state.joints[i * 3 + 1]!)
        const upper = id === 'quadruped' ? .37 : .48, lower = id === 'quadruped' ? .39 : .47
        expect(position(hip).distanceTo(position(knee))).toBeCloseTo(upper)
        expect(position(knee).distanceTo(position(ankle))).toBeCloseTo(lower)
        const expectedY = position(hip).y - upper * Math.cos(hip.rotation.z) - lower * Math.cos(hip.rotation.z + knee.rotation.z)
        expect(position(ankle).y).toBeCloseTo(expectedY)
        expect(new THREE.Box3().setFromObject(ankle).min.y).toBeGreaterThan(-.002)
      })
      const first = hips[0]!, other = hips[1]!, before = position(named(other, '/foot'))
      first.rotation.z += .2
      model.root.updateMatrixWorld(true)
      expect(position(named(other, '/foot')).distanceTo(before)).toBeLessThan(1e-10)
    })
  }

  it('腰部带动胸部、头部与手臂，骨盆和双腿保持不动', () => {
    const { root } = createRobot('humanoid')
    const waist = named(root, '/waist'), head = named(root, '/head')
    const hand = named(root, '/right-shoulder/elbow/wrist/palm'), foot = named(root, '/right-leg/hip/knee/ankle/foot')
    const before = { head: position(head), hand: position(hand), foot: position(foot) }
    waist.rotation.y = .5
    root.updateMatrixWorld(true)
    expect(position(head).distanceTo(before.head)).toBeGreaterThan(.005)
    expect(position(hand).distanceTo(before.hand)).toBeGreaterThan(.1)
    expect(position(foot).distanceTo(before.foot)).toBeLessThan(1e-10)
  })

  it('双手各有五条独立指链，腕部与单指旋转只影响对应后代', () => {
    const { root } = createRobot('humanoid')
    for (const side of ['left', 'right']) {
      const wrist = named(root, `/${side}-shoulder/elbow/wrist`), palm = named(wrist, '/palm')
      const fingers = palm.children.filter(node => node.userData.part?.kind === 'joint')
      expect(fingers).toHaveLength(5)
      expect(fingers.map(node => nodes(node).filter(item => item.userData.part?.axes).length)).toEqual([3, 3, 3, 3, 2])
      const firstTip = named(fingers[0]!, '/hinge-2/phalanx'), otherTip = named(fingers[1]!, '/hinge-2/phalanx')
      const before = { first: position(firstTip), other: position(otherTip), elbow: position(wrist.parent!) }
      fingers[0]!.rotation.z = .6
      root.updateMatrixWorld(true)
      expect(position(firstTip).distanceTo(before.first)).toBeGreaterThan(.02)
      expect(position(otherTip).distanceTo(before.other)).toBeLessThan(1e-10)
      wrist.rotation.y = .6
      root.updateMatrixWorld(true)
      expect(position(otherTip).distanceTo(before.other)).toBeGreaterThan(.005)
      expect(position(wrist.parent!).distanceTo(before.elbow)).toBeLessThan(1e-10)
    }
  })

  it('全部受控关节绑定真实机械节点，手臂与手指从快照驱动', () => {
    const adapter = new SimulationAdapter()
    adapter.send({ type: 'action', robot: 'humanoid', action: 'point' })
    for (let i = 0; i < 30; i++) adapter.tick(.1)
    const model = createRobot('humanoid'), state = adapter.snapshot().robots.humanoid
    model.update(state, .1, true)
    for (const [index, definition] of joints.humanoid.entries()) {
      const joint = model.root.getObjectByName(definition.path)!
      expect(joint).toBeDefined()
      expect(joint.rotation[definition.axis]).toBe(state.joints[index])
    }
    const indexFinger = named(model.root, '/right-shoulder/elbow/wrist/palm/finger-1')
    const middleFinger = named(model.root, '/right-shoulder/elbow/wrist/palm/finger-2')
    expect(indexFinger.rotation.z).toBe(0)
    expect(middleFinger.rotation.z).toBeGreaterThan(.8)
  })

  it('双臂三维 IK 与实际掌心世界位置吻合，连杆长度不改变', () => {
    const adapter = new SimulationAdapter(), model = createRobot('humanoid')
    for (const effector of endEffectors.humanoid.filter(item => item.kind === 'hand')) {
      const target: [number, number, number] = [.32, -.4, effector.side * .12]
      adapter.send({ type: 'ik', robot: 'humanoid', effector: effector.id, position: target })
      for (let i = 0; i < 25; i++) adapter.tick(.1)
      model.update(adapter.snapshot().robots.humanoid, .1, true); model.root.updateMatrixWorld(true)
      const shoulder = model.root.getObjectByName(joints.humanoid[effector.indices[0]!]!.path)!
      const elbow = named(shoulder, '/elbow'), wrist = named(elbow, '/wrist'), palm = named(wrist, '/palm')
      expect(position(shoulder).distanceTo(position(elbow))).toBeCloseTo(.37, 6)
      expect(position(elbow).distanceTo(position(wrist))).toBeCloseTo(.29, 6)
      const actual = shoulder.parent!.worldToLocal(position(palm)).sub(shoulder.position)
      actual.toArray().forEach((value, index) => expect(value).toBeCloseTo(target[index]!, 6))
    }
  })

  for (const id of ['quadruped', 'humanoid'] as const) it(`${id} 全动作足部实体和连续渲染过渡不穿入地面`, () => {
    const adapter = new SimulationAdapter(), model = createRobot(id), initial = adapter.snapshot().robots[id]
    const feet = nodes(model.root).filter(node => node.name.endsWith('/ankle/foot'))
    for (const action of robots[id].actions) for (let i = 0; i < 24; i++) {
      const state = { ...initial, action, phase: i / 24 * Math.PI * 2, actionTime: i / 24 * (actions[action].duration || 3), speed: robots[id].maxSpeed }
      const pose = motionPose(state)
      model.update({ ...state, ...pose }, .1, true); model.root.updateMatrixWorld(true)
      for (const foot of feet) expect(new THREE.Box3().setFromObject(foot).min.y, `${action}/${i}/${foot.name}`).toBeGreaterThan(-.004)
    }
    model.update(initial, .1, true)
    for (const action of ['crouch', 'walk', 'run', 'stand'] as const) {
      adapter.send({ type: 'action', robot: id, action })
      for (let tick = 0; tick < 20; tick++) {
        adapter.tick(.1)
        for (let frame = 0; frame < 6; frame++) {
          model.update(adapter.snapshot().robots[id], 1 / 60, false); model.root.updateMatrixWorld(true)
          for (const foot of feet) expect(new THREE.Box3().setFromObject(foot).min.y, `${action}/${tick}/${frame}`).toBeGreaterThan(-.004)
        }
      }
    }
  })
})
