import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type PartKind = 'frame' | 'shell' | 'joint' | 'link' | 'power' | 'controller' | 'sensor' | 'cooling' | 'interface' | 'foot' | 'hand'
export interface RobotPart { id: string; name: string; kind: PartKind; axes?: ('x' | 'y' | 'z')[] }
type XYZ = [number, number, number]

/** 场景树就是部件目录；稳定路径用于拾取，不另存一套部件状态。 */
export function part(parent: THREE.Object3D, key: string, name: string, kind: PartKind, position: XYZ = [0, 0, 0], axes?: RobotPart['axes']) {
  const group = new THREE.Group()
  group.name = `${parent.name}/${key}`
  group.userData.part = { id: group.name, name, kind, ...(axes ? { axes } : {}) } satisfies RobotPart
  group.position.set(...position)
  parent.add(group)
  return group
}

export function findRobotPart(object: THREE.Object3D): RobotPart | undefined {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.userData.part) return current.userData.part as RobotPart
    current = current.parent
  }
}

export function isObjectVisible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) { if (!current.visible) return false; current = current.parent }
  return true
}

/** 只合并同一部件的静态同材质实体，保留拾取、拆解与关节的原有边界。 */
export function optimizeRobotGeometry(root: THREE.Group) {
  root.traverse(parent => {
    const batches = new Map<THREE.Material, THREE.Mesh[]>()
    for (const node of parent.children) {
      if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh || Array.isArray(node.material)) continue
      const batch = batches.get(node.material) ?? []
      batch.push(node); batches.set(node.material, batch)
    }
    for (const [material, batch] of batches) {
      if (batch.length < 2) continue
      const shapes = batch.map(mesh => {
        mesh.updateMatrix()
        return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix)
      })
      const geometry = mergeGeometries(shapes)
      shapes.forEach(shape => shape.dispose())
      if (!geometry) throw new Error(`机械部件几何合并失败：${parent.name}`)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `${parent.name}/batch-${parent.children.length}`
      mesh.castShadow = true; mesh.receiveShadow = true
      batch.forEach(node => parent.remove(node)); parent.add(mesh)
    }
  })
  // 实体的局部装配不变；关节与部件 Group 仍按实际姿态/拆解实时更新。
  root.traverse(node => { if (node instanceof THREE.Mesh) { node.updateMatrix(); node.matrixAutoUpdate = false } })
}

/** 两机型共用机械造型工具；每个模型内部复用几何/材质，由场景卸载统一释放。 */
export function mechanicalParts() {
  const palette = {
    shell: new THREE.MeshStandardMaterial({ color: '#d8e0de', metalness: .48, roughness: .29 }),
    white: new THREE.MeshStandardMaterial({ color: '#eef2eb', metalness: .28, roughness: .32 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1b2327', metalness: .65, roughness: .33 }),
    metal: new THREE.MeshStandardMaterial({ color: '#6f7e82', metalness: .9, roughness: .25 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#151b1d', metalness: .05, roughness: .8 }),
    accent: new THREE.MeshStandardMaterial({ color: '#00C8FF', metalness: .3, roughness: .36 }),
    circuit: new THREE.MeshStandardMaterial({ color: '#19514c', metalness: .35, roughness: .5 }),
    lens: new THREE.MeshStandardMaterial({ color: '#163b39', metalness: .95, roughness: .06 }),
    light: new THREE.MeshStandardMaterial({ color: '#43E5FF', emissive: '#00C8FF', emissiveIntensity: .8, roughness: .22 }),
  }
  type MaterialKey = keyof typeof palette
  const geometries = new Map<string, THREE.BufferGeometry>()
  function geometry(key: string, create: () => THREE.BufferGeometry) {
    if (!geometries.has(key)) geometries.set(key, create())
    return geometries.get(key)!
  }
  function mesh(parent: THREE.Object3D, shape: THREE.BufferGeometry, material: MaterialKey, position: XYZ, name: string = material) {
    const object = new THREE.Mesh(shape, palette[material])
    object.position.set(...position); object.castShadow = true; object.receiveShadow = true
    object.name = `${parent.name}/${name}-${parent.children.length + 1}`
    parent.add(object)
    return object
  }
  function box(parent: THREE.Object3D, size: XYZ, position: XYZ, material: MaterialKey, radius = .025, name?: string) {
    return mesh(parent, geometry(`box-${size}-${radius}`, () => new RoundedBoxGeometry(...size, Math.min(...size) <= .03 ? 1 : 2, radius)), material, position, name)
  }
  function cylinder(parent: THREE.Object3D, radius: number, height: number, position: XYZ, material: MaterialKey, axis: 'y' | 'z' | 'x' = 'z') {
    const object = mesh(parent, geometry(`cylinder-${radius}-${height}`, () => new THREE.CylinderGeometry(radius, radius, height, 24)), material, position)
    if (axis === 'z') object.rotation.x = Math.PI / 2
    if (axis === 'x') object.rotation.z = Math.PI / 2
    return object
  }
  function hull(parent: THREE.Object3D, points: [number, number][], depth: number, position: XYZ, material: MaterialKey, name?: string) {
    const shape = geometry(`hull-${points}-${depth}`, () => {
      const outline = new THREE.Shape(points.map(p => new THREE.Vector2(...p)))
      const result = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelThickness: Math.min(.008, depth / 3), bevelSize: .008, bevelSegments: 2, steps: 1 })
      result.translate(0, 0, -depth / 2)
      return result
    })
    return mesh(parent, shape, material, position, name)
  }
  function bolts(parent: THREE.Object3D, radius: number, side: number) {
    const shape = geometry('bolt', () => new THREE.CylinderGeometry(.008, .008, .012, 6))
    const instances = new THREE.InstancedMesh(shape, palette.metal, 4)
    const transform = new THREE.Object3D()
    for (let n = 0; n < 4; n++) {
      const angle = (n + .5) * Math.PI / 2
      transform.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, side * .085)
      transform.rotation.x = Math.PI / 2; transform.updateMatrix()
      instances.setMatrixAt(n, transform.matrix)
    }
    instances.instanceMatrix.needsUpdate = true
    instances.name = `${parent.name}/fasteners`; instances.castShadow = true
    parent.add(instances)
  }
  function actuator(parent: THREE.Object3D, radius: number, side: number) {
    const motor = part(parent, 'motor', '关节电机', 'joint')
    cylinder(motor, radius, .1, [0, 0, 0], 'dark')
    const reducer = part(parent, 'reducer', '行星减速器与输出法兰', 'joint')
    cylinder(reducer, radius * .79, .035, [0, 0, side * .057], 'metal')
    cylinder(reducer, radius * .47, .018, [0, 0, side * .079], 'dark')
    cylinder(reducer, radius * .17, .02, [0, 0, side * .089], 'accent')
    bolts(reducer, radius * .61, side)
  }
  return { box, cylinder, hull, actuator }
}
