import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { findRobotPart, optimizeRobotGeometry, part } from './RobotParts'

describe('机械部件绘制合并', () => {
  it('合并保留局部变换、实体边界、射线拾取与父关节驱动', () => {
    const root = new THREE.Group(), arm = part(root, 'arm', '机械臂', 'link')
    const material = new THREE.MeshStandardMaterial(), geometry = new THREE.BoxGeometry(.2, .3, .4)
    for (const x of [0, .5]) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, .1, 0); mesh.rotation.y = .3; arm.add(mesh)
    }
    const before = new THREE.Box3().setFromObject(arm)
    const ray = new THREE.Raycaster(new THREE.Vector3(0, .1, 2), new THREE.Vector3(0, 0, -1))
    const point = ray.intersectObject(arm, true)[0]!.point.clone()
    optimizeRobotGeometry(root)
    expect(arm.children).toHaveLength(1)
    const after = new THREE.Box3().setFromObject(arm)
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-7)
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-7)
    const hit = ray.intersectObject(arm, true)[0]!
    expect(hit.point.distanceTo(point)).toBeLessThan(1e-7)
    expect(findRobotPart(hit.object)?.id).toBe(arm.name)
    arm.position.x = 1; arm.rotation.z = .6; root.updateMatrixWorld(true)
    const mesh = arm.children[0]!
    expect(mesh.matrixAutoUpdate).toBe(false)
    expect(mesh.matrixWorld.equals(arm.matrixWorld)).toBe(true)
  })

  it('不同部件、不同材质和实例缓冲保留独立所有权', () => {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial(), other = material.clone()
    const left = part(root, 'left', '左部件', 'shell'), right = part(root, 'right', '右部件', 'shell')
    const geometry = new THREE.BoxGeometry(.2, .3, .4), instance = new THREE.InstancedMesh(geometry, material, 4)
    left.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, other), instance)
    right.add(new THREE.Mesh(geometry, material))
    optimizeRobotGeometry(root)
    expect(left.children).toHaveLength(3); expect(right.children).toHaveLength(1)
    expect(instance.parent).toBe(left)
    left.visible = false
    expect(right.visible).toBe(true)
    expect((right.children[0] as THREE.Mesh).material).toBe(material)
  })
})
