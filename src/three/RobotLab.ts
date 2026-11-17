import * as THREE from 'three'
import { joints } from '@/config/joints'
import { defaultLabState, disassemblyBinding, englishPartName, partKinds, type LabPart, type LabState } from '@/config/lab'
import { findRobotPart, isObjectVisible } from './RobotParts'
import type { RobotId } from '@/types/robot'

/** 展示层只偏移静态装配位置；不重挂父子节点，也不覆盖运动学关节旋转。 */
export function createRobotLab(id: RobotId, root: THREE.Group) {
  const entries: { node: THREE.Object3D; item: LabPart; base: THREE.Vector3; offset: THREE.Vector3; step: number }[] = []
  const meshes: { mesh: THREE.Mesh; part: LabPart; original: THREE.Material | THREE.Material[]; shadow: boolean; order: number }[] = []
  root.traverse(node => {
    const part = node.userData.part
    if (!part) return
    const nearest = joints[id].filter(definition => part.id === definition.path || part.id.startsWith(definition.path + '/')).sort((a, b) => b.path.length - a.path.length)[0]?.path
    const jointIndices = joints[id].flatMap((definition, index) => definition.path === nearest ? [index] : [])
    const binding = disassemblyBinding(id, part)
    const item: LabPart = { ...part, englishName: englishPartName(part), description: partKinds[part.kind as LabPart['kind']].description, step: binding.step, jointIndices }
    entries.push({ node, item, base: node.position.clone(), offset: new THREE.Vector3(...binding.offset), step: binding.step })
  })
  const catalog = entries.map(entry => entry.item)
  const byId = new Map(entries.map(entry => [entry.item.id, entry]))
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    const item = byId.get(findRobotPart(node)!.id)!.item
    meshes.push({ mesh: node, part: item, original: node.material, shadow: node.castShadow, order: node.renderOrder })
  })
  const variants = new Map<THREE.Material, Map<string, THREE.Material>>()
  const colors = { selected: '#43E5FF', hover: '#bcefff', sensor: '#39F5B5', joint: '#816CFF', power: '#ffba67', controller: '#00C8FF' }
  function material(original: THREE.Material, mode: keyof typeof colors | 'normal', transparent: boolean) {
    if (mode === 'normal' && !transparent) return original
    let cache = variants.get(original)
    if (!cache) { cache = new Map(); variants.set(original, cache) }
    const key = `${mode}/${transparent}`
    if (!cache.has(key)) {
      const clone = original.clone() as THREE.MeshStandardMaterial
      if (transparent) { clone.transparent = true; clone.opacity = .16; clone.depthWrite = false; clone.color.lerp(new THREE.Color('#43E5FF'), .45) }
      if (mode !== 'normal') { clone.color.lerp(new THREE.Color(colors[mode]), .55); clone.emissive.set(colors[mode]); clone.emissiveIntensity = mode === 'selected' ? .55 : .3 }
      cache.set(key, clone)
    }
    return cache.get(key)!
  }
  const visuals = new THREE.Group()
  visuals.name = `${id}-lab-visuals`
  const boneNodes = entries.filter(entry => entry.item.axes?.length || entry.item.kind === 'foot' || entry.node.name.endsWith('/palm') || /\/(body|head)$/.test(entry.node.name))
  const boneSet = new Set(boneNodes.map(entry => entry.node))
  const edges = boneNodes.flatMap(entry => {
    let parent = entry.node.parent
    while (parent && !boneSet.has(parent)) parent = parent.parent
    return parent ? [{ from: parent, to: entry.node }] : []
  })
  const bonePositions = new THREE.Float32BufferAttribute(new Float32Array(edges.length * 6), 3)
  bonePositions.setUsage(THREE.DynamicDrawUsage)
  const boneGeometry = new THREE.BufferGeometry().setAttribute('position', bonePositions)
  const bones = new THREE.LineSegments(boneGeometry, new THREE.LineBasicMaterial({ color: '#43E5FF', depthTest: false, depthWrite: false, toneMapped: false }))
  const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#39F5B5', depthTest: false, depthWrite: false, toneMapped: false }), boneNodes.length)
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  markers.frustumCulled = false; bones.frustumCulled = false
  const skeleton = new THREE.Group(); skeleton.add(bones, markers); visuals.add(skeleton)
  const axes = new THREE.Group(); visuals.add(axes)
  const prototype = new THREE.AxesHelper(.2)
  const axisMaterial = prototype.material as THREE.LineBasicMaterial
  axisMaterial.depthTest = false; axisMaterial.depthWrite = false
  const axisBindings = boneNodes.filter(entry => entry.item.axes?.length).map(entry => {
    const helper = new THREE.LineSegments(prototype.geometry, prototype.material)
    if (/finger|thumb|hinge/.test(entry.item.id)) helper.scale.setScalar(.35)
    helper.renderOrder = 10; axes.add(helper)
    return { node: entry.node, helper }
  })
  const rangeGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(65 * 3), 3))
  const range = new THREE.Line(rangeGeometry, new THREE.LineBasicMaterial({ color: '#ffba67', depthTest: false, depthWrite: false, toneMapped: false }))
  const rotationArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), .055, '#ffba67', .025, .017)
  for (const object of [rotationArrow.line, rotationArrow.cone]) {
    const mat = object.material as THREE.Material; mat.depthTest = false; mat.depthWrite = false; mat.toneMapped = false
  }
  const rotation = new THREE.Group(); rotation.add(range, rotationArrow); axes.add(rotation)
  const trailGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(80 * 3), 3))
  trailGeometry.setDrawRange(0, 0)
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: '#39F5B5', depthTest: false, depthWrite: false, toneMapped: false }))
  trail.frustumCulled = false; axes.add(trail)
  const points: THREE.Vector3[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), transform = new THREE.Object3D(), inverse = new THREE.Quaternion(), robotRotation = new THREE.Quaternion(), localRotation = new THREE.Euler()
  let lastAppearance = '', lastJoint = '', lastSelection: string | null = null
  function update(state: LabState, hovered?: string) {
    root.getWorldQuaternion(robotRotation)
    for (const entry of entries) {
      entry.node.visible = !state.hidden.includes(entry.item.id)
      if (entry.offset.lengthSq() === 0) continue
      const amount = THREE.MathUtils.smoothstep(state.progress - entry.step + 1, 0, 1)
      // 把机器人坐标轴位移转换回父级坐标，避免关节转动后拆解轴向漂移。
      entry.node.parent!.getWorldQuaternion(inverse).invert().multiply(robotRotation)
      entry.node.position.copy(entry.base).add(a.copy(entry.offset).applyQuaternion(inverse).multiplyScalar(amount))
    }
    root.updateMatrixWorld(true)
    const appearance = `${state.transparent}/${state.highlight}/${state.selectedPartId}/${hovered}`
    if (appearance !== lastAppearance) {
      for (const entry of meshes) {
        const selected = state.selectedPartId && (entry.part.id === state.selectedPartId || entry.part.id.startsWith(state.selectedPartId + '/'))
        const hover = hovered && (entry.part.id === hovered || entry.part.id.startsWith(hovered + '/'))
        const mode = selected ? 'selected' : hover ? 'hover' : state.highlight !== 'none' && entry.part.kind === state.highlight ? state.highlight : 'normal'
        const transparent = state.transparent && entry.part.kind === 'shell'
        entry.mesh.material = Array.isArray(entry.original) ? entry.original.map(original => material(original, mode, transparent)) : material(entry.original, mode, transparent)
        entry.mesh.castShadow = transparent ? false : entry.shadow
        entry.mesh.renderOrder = transparent ? 2 : entry.order
      }
      lastAppearance = appearance
    }
    skeleton.visible = state.skeleton; axes.visible = state.axes
    if (state.skeleton) {
      edges.forEach((edge, index) => {
        edge.from.getWorldPosition(a); edge.to.getWorldPosition(b)
        if (!isObjectVisible(edge.from) || !isObjectVisible(edge.to)) b.copy(a)
        bonePositions.setXYZ(index * 2, a.x, a.y, a.z); bonePositions.setXYZ(index * 2 + 1, b.x, b.y, b.z)
      })
      bonePositions.needsUpdate = true
      boneNodes.forEach((entry, index) => {
        entry.node.getWorldPosition(transform.position)
        transform.scale.setScalar(isObjectVisible(entry.node) ? 1 : 0); transform.updateMatrix(); markers.setMatrixAt(index, transform.matrix)
      })
      markers.instanceMatrix.needsUpdate = true
    }
    if (lastSelection !== state.selectedPartId) { points.length = 0; trailGeometry.setDrawRange(0, 0); lastSelection = state.selectedPartId }
    if (!state.axes) return
    axisBindings.forEach(({ node, helper }) => { helper.visible = isObjectVisible(node); node.getWorldPosition(helper.position); node.getWorldQuaternion(helper.quaternion) })
    const selected = state.selectedPartId ? byId.get(state.selectedPartId) : undefined
    const definition = selected?.item.jointIndices.length ? joints[id][selected.item.jointIndices[0]!] : undefined
    rotation.visible = !!definition && !!selected && isObjectVisible(selected.node)
    if (definition && rotation.visible) {
      const node = root.getObjectByName(definition.path)!
      node.getWorldPosition(rotation.position); node.parent!.getWorldQuaternion(rotation.quaternion)
      localRotation.copy(node.rotation); localRotation[definition.axis] = 0
      rotation.quaternion.multiply(inverse.setFromEuler(localRotation))
      const axisRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(definition.axis === 'y' ? -Math.PI / 2 : 0, definition.axis === 'x' ? Math.PI / 2 : 0, 0))
      rotation.quaternion.multiply(axisRotation)
      const radius = /finger|thumb|hinge/.test(definition.path) ? .045 : .15
      if (definition.id !== lastJoint) {
        const attribute = rangeGeometry.getAttribute('position') as THREE.BufferAttribute
        for (let n = 0; n <= 64; n++) {
          const angle = definition.min + (definition.max - definition.min) * n / 64
          attribute.setXYZ(n, Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        }
        attribute.needsUpdate = true; rangeGeometry.computeBoundingSphere(); lastJoint = definition.id
      }
      const angle = node.rotation[definition.axis]
      rotationArrow.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      rotationArrow.setDirection(a.set(-Math.sin(angle), Math.cos(angle), 0))
    }
    trail.visible = !!selected && isObjectVisible(selected.node)
    if (selected && trail.visible) {
      const path = definition?.path ?? selected.item.id
      const terminal = boneNodes.find(entry => (entry.item.kind === 'foot' || entry.node.name.endsWith('/palm')) && entry.item.id.startsWith(path + '/'))?.node ?? selected.node
      terminal.getWorldPosition(a)
      if (!points.length || points.at(-1)!.distanceToSquared(a) > .000025) {
        points.push(a.clone()); if (points.length > 80) points.shift()
        const attribute = trailGeometry.getAttribute('position') as THREE.BufferAttribute
        points.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z))
        attribute.needsUpdate = true; trailGeometry.setDrawRange(0, points.length)
      }
    }
  }
  function bounds(partId?: string) {
    root.updateMatrixWorld(true)
    const box = new THREE.Box3()
    for (const { mesh, part } of meshes) {
      if (isObjectVisible(mesh) && (!partId || part.id === partId || part.id.startsWith(partId + '/'))) box.expandByObject(mesh)
    }
    return box
  }
  function dispose() {
    update(defaultLabState())
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    visuals.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry)
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item))
      }
      if (object instanceof THREE.InstancedMesh) object.dispose()
    })
    variants.forEach(cache => cache.forEach(item => materials.add(item)))
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); visuals.removeFromParent(); visuals.clear()
  }
  return { catalog, visuals, update, bounds, meshes: meshes.map(entry => entry.mesh), dispose }
}
