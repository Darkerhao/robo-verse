import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createRobot } from './RobotModel'
import { createRobotLab } from './RobotLab'
import { findRobotPart, isObjectVisible } from './RobotParts'
import { defaultLabState, disassemblySteps } from '@/config/lab'
import { joints } from '@/config/joints'
import { SimulationAdapter } from '@/services/SimulationAdapter'

describe('全息实验室真实机械结构', () => {
  for (const id of ['quadruped', 'humanoid'] as const) {
    it(`${id} 部件目录来自场景树，十个步骤都有实际机械实体`, () => {
      const model = createRobot(id), lab = createRobotLab(id, model.root)
      expect(lab.catalog).toHaveLength(id === 'quadruped' ? 77 : 138)
      expect(disassemblySteps[id]).toHaveLength(10)
      for (let step = 1; step <= 10; step++) expect(lab.catalog.some(item => item.step === step), `step ${step}`).toBe(true)
      for (const item of lab.catalog) {
        const node = model.root.getObjectByName(item.id)!
        expect(node.userData.part.name).toBe(item.name)
        expect(item.description.length).toBeGreaterThan(10)
        expect(item.englishName.length).toBeGreaterThan(2)
        item.jointIndices.forEach(index => expect(item.id.startsWith(joints[id][index]!.path)).toBe(true))
      }
      expect(lab.meshes.every(mesh => lab.catalog.some(item => findRobotPart(mesh)?.id === item.id))).toBe(true)
      lab.dispose()
    })

    it(`${id} 顺序与重复进度确定，任意阶段恢复所有原始位置和父子层级`, () => {
      const model = createRobot(id), adapter = new SimulationAdapter()
      model.update(adapter.snapshot().robots[id], .1, true)
      const lab = createRobotLab(id, model.root), state = defaultLabState()
      const originals = lab.catalog.map(item => { const node = model.root.getObjectByName(item.id)!; return { node, position: node.position.clone(), rotation: node.rotation.clone(), parent: node.parent } })
      const first = model.root.getObjectByName(id === 'quadruped' ? 'quadruped/body/left-shell' : 'humanoid/body/waist/neck/head/shell')!
      const battery = model.root.getObjectByName(id === 'quadruped' ? 'quadruped/body/battery' : 'humanoid/body/waist/battery')!
      const originalBattery = battery.position.clone()
      state.progress = .5; lab.update(state)
      expect(first.position.length()).toBeGreaterThan(.2)
      expect(battery.position.distanceTo(originalBattery)).toBeLessThan(1e-10)
      for (const progress of [3.4, 7.8, 10, 2.1, 9.9]) {
        state.progress = progress; lab.update(state)
        const repeated = originals.map(({ node }) => node.position.clone())
        for (let repeat = 0; repeat < 10; repeat++) lab.update(state)
        originals.forEach(({ node }, index) => expect(node.position.distanceTo(repeated[index]!)).toBeLessThan(1e-10))
        state.progress = 0; lab.update(state)
        for (const original of originals) {
          expect(original.node.position.distanceTo(original.position), original.node.name).toBeLessThan(1e-10)
          expect(original.node.rotation.equals(original.rotation)).toBe(true)
          expect(original.node.parent).toBe(original.parent)
        }
      }
      lab.dispose()
    })

    it(`${id} 外壳透明和选择高亮不污染共用材质，取消后恢复原材质身份`, () => {
      const model = createRobot(id), lab = createRobotLab(id, model.root), state = defaultLabState()
      const originals = lab.meshes.map(mesh => ({ mesh, material: mesh.material as THREE.MeshStandardMaterial, color: (mesh.material as THREE.MeshStandardMaterial).color.getHex() }))
      state.transparent = true; state.selectedPartId = `${id}/body/${id === 'quadruped' ? 'controller' : 'waist/controller'}`
      lab.update(state)
      for (const original of originals) {
        const part = findRobotPart(original.mesh)!, material = original.mesh.material as THREE.MeshStandardMaterial
        expect(original.material.opacity).toBe(1)
        expect(original.material.color.getHex()).toBe(original.color)
        if (part.kind === 'shell') { expect(material.transparent).toBe(true); expect(material.depthWrite).toBe(false); expect(original.mesh.castShadow).toBe(false) }
        else expect(material.transparent).toBe(false)
      }
      lab.update(defaultLabState())
      for (const original of originals) expect(original.mesh.material).toBe(original.material)
      lab.dispose()
    })

    it(`${id} 隐藏父模块后排除全部子实体，聚焦包围盒不包含骨骼与隐藏部件`, () => {
      const model = createRobot(id), adapter = new SimulationAdapter()
      model.update(adapter.snapshot().robots[id], .1, true)
      const lab = createRobotLab(id, model.root), state = defaultLabState()
      const partId = id === 'quadruped' ? 'quadruped/body/roof' : 'humanoid/body/waist/left-shoulder'
      const initialBounds = lab.bounds(partId).clone()
      state.skeleton = true; state.axes = true; lab.update(state)
      expect(lab.bounds(partId).equals(initialBounds)).toBe(true)
      state.hidden = [partId]; lab.update(state)
      const descendants = lab.meshes.filter(mesh => findRobotPart(mesh)!.id.startsWith(partId))
      expect(descendants.length).toBeGreaterThan(0)
      expect(descendants.every(mesh => !isObjectVisible(mesh))).toBe(true)
      expect(lab.bounds(partId).isEmpty()).toBe(true)
      state.hidden = []; lab.update(state)
      expect(lab.bounds(partId).equals(initialBounds)).toBe(true)
      lab.dispose()
    })

    it(`${id} 骨骼节点跟随实际关节与拆解位置，且不改变原动作姿态`, () => {
      const adapter = new SimulationAdapter(), model = createRobot(id), lab = createRobotLab(id, model.root), state = defaultLabState()
      adapter.send({ type: 'action', robot: id, action: id === 'quadruped' ? 'trot' : 'wave' })
      state.skeleton = true; state.axes = true; state.progress = 7.5
      for (let tick = 0; tick < 6; tick++) {
        adapter.tick(.1); const robot = adapter.snapshot().robots[id]
        model.update(robot, .1, true); lab.update(state)
        for (const [index, definition] of joints[id].entries()) expect(model.root.getObjectByName(definition.path)!.rotation[definition.axis]).toBe(robot.joints[index])
        const markers = lab.visuals.children[0]!.children[1] as THREE.InstancedMesh
        const boneNodes = lab.catalog.filter(item => item.axes?.length || item.kind === 'foot' || item.id.endsWith('/palm') || /\/(body|head)$/.test(item.id))
        for (const [index, item] of boneNodes.entries()) {
          const matrix = new THREE.Matrix4(); markers.getMatrixAt(index, matrix)
          const expected = model.root.getObjectByName(item.id)!.getWorldPosition(new THREE.Vector3())
          expect(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(expected)).toBeLessThan(1e-6)
        }
      }
      lab.dispose()
    })
  }

  it('人形俯仰/转向后电池仍沿机器人轴向分离，左右胸壳方向相反', () => {
    const model = createRobot('humanoid'), adapter = new SimulationAdapter(), robot = adapter.snapshot().robots.humanoid
    robot.roll = .2; robot.pitch = .25; robot.heading = 40; robot.joints[7] = -.4
    model.update(robot, .1, true)
    const lab = createRobotLab('humanoid', model.root), state = defaultLabState()
    const battery = model.root.getObjectByName('humanoid/body/waist/battery')!, before = battery.getWorldPosition(new THREE.Vector3())
    state.progress = 10; lab.update(state)
    const expected = new THREE.Vector3(-.8, .56, 0).applyQuaternion(model.root.getWorldQuaternion(new THREE.Quaternion()))
    expect(battery.getWorldPosition(new THREE.Vector3()).sub(before).distanceTo(expected)).toBeLessThan(1e-6)
    const left = model.root.getObjectByName('humanoid/body/waist/chest-shell--1')!, right = model.root.getObjectByName('humanoid/body/waist/chest-shell-1')!
    const separation = right.getWorldPosition(new THREE.Vector3()).sub(left.getWorldPosition(new THREE.Vector3())).applyQuaternion(model.root.getWorldQuaternion(new THREE.Quaternion()).invert())
    expect(separation.z).toBeCloseTo(1.2)
    lab.dispose()
  })

  it('关闭坐标轴并重置选择时立即清除旧末端轨迹', () => {
    const model = createRobot('quadruped'), lab = createRobotLab('quadruped', model.root), adapter = new SimulationAdapter(), state = defaultLabState()
    state.axes = true; state.selectedPartId = 'quadruped/body/front-left/hip/knee'
    adapter.send({ type: 'action', robot: 'quadruped', action: 'walk' })
    for (let tick = 0; tick < 16; tick++) { adapter.tick(.1); model.update(adapter.snapshot().robots.quadruped, .1, true); lab.update(state) }
    const trail = lab.visuals.children[1]!.children.at(-1) as THREE.Line
    expect(trail.geometry.drawRange.count).toBeGreaterThan(1)
    lab.update(defaultLabState())
    expect(trail.geometry.drawRange.count).toBe(0)
    lab.dispose()
  })

  it('实验室释放所有辅助几何、实例缓冲和材质变体，模型材质仍归场景所有', () => {
    const model = createRobot('humanoid'), lab = createRobotLab('humanoid', model.root), state = defaultLabState()
    state.axes = true; state.skeleton = true; state.transparent = true; state.selectedPartId = 'humanoid/body/waist/controller'; lab.update(state)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    lab.visuals.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry)
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material))
      }
    })
    const listeners = [...geometries, ...materials].map(resource => { const listener = vi.fn(); resource.addEventListener('dispose', listener); return listener })
    const selectedMesh = lab.meshes.find(mesh => findRobotPart(mesh)!.id === state.selectedPartId)!
    const variant = selectedMesh.material as THREE.Material, variantListener = vi.fn(); variant.addEventListener('dispose', variantListener)
    lab.dispose()
    expect(listeners.every(listener => listener.mock.calls.length === 1)).toBe(true)
    expect(variantListener).toHaveBeenCalledOnce()
    expect(selectedMesh.material).not.toBe(variant)
    expect(lab.visuals.children).toHaveLength(0)
  })
})
