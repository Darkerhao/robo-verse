import * as THREE from 'three'
import { categories, type EnvironmentObject } from '@/config/perception'

/** 感知训练场与任务场景共用实体建模，几何尺寸直接来自碰撞/识别配置。 */
export function createEnvironmentModel(object: EnvironmentObject, color?: string) {
  const group = new THREE.Group()
  group.name = object.id; group.userData.environmentId = object.id
  const material = new THREE.MeshStandardMaterial({ color: color ?? (object.category === 'ground' ? '#142333' : new THREE.Color(categories[object.category].color).multiplyScalar(.58)), roughness: .55, metalness: object.category === 'person' ? .05 : .3 })
  const pickables = object.parts.map(part => {
    const geometry = part.sphere ? new THREE.SphereGeometry(part.size[0] / 2, 24, 16) : new THREE.BoxGeometry(...part.size)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.fromArray(part.center); mesh.castShadow = object.category !== 'ground'; mesh.receiveShadow = true; group.add(mesh)
    return mesh
  })
  return { group, pickables }
}
