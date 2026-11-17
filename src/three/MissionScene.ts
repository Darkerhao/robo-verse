import * as THREE from 'three'
import { missionScenes, missions } from '@/config/missions'
import { objectBounds } from '@/config/perception'
import type { MissionState } from '@/types/mission'
import { createEnvironmentModel } from './EnvironmentModel'

/** 任务对象、路径、识别和抓握均消费同一任务快照；场景不推进任务。 */
export function createMissionScene(host: HTMLElement) {
  const root = new THREE.Group(), world = new THREE.Group()
  root.name = 'mission-world'; root.add(world)
  const entities = new Map<string, THREE.Group>(), frames = new Map<string, THREE.Box3Helper>(), labels = new Map<string, HTMLDivElement>()
  const pickables: THREE.Mesh[] = []
  const routeGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(256 * 3), 3))
  const route = new THREE.Line(routeGeometry, new THREE.LineBasicMaterial({ color: '#39f5b5', depthTest: false }))
  route.frustumCulled = false; root.add(route)
  const raysGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(120), 3))
  const rays = new THREE.LineSegments(raysGeometry, new THREE.LineBasicMaterial({ color: '#43e5ff', transparent: true, opacity: .65 }))
  rays.frustumCulled = false; root.add(rays)
  const goal = new THREE.Mesh(new THREE.RingGeometry(.18, .22, 40), new THREE.MeshBasicMaterial({ color: '#39f5b5', side: THREE.DoubleSide }))
  goal.rotation.x = -Math.PI / 2; root.add(goal)
  let currentId = '', revision = -1
  function clearWorld() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    world.traverse(node => { if (node instanceof THREE.Mesh || node instanceof THREE.Line) { geometries.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material)) } })
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    world.clear(); entities.clear(); frames.clear(); labels.forEach(label => label.remove()); labels.clear(); pickables.length = 0
  }
  function rebuild(state: MissionState) {
    clearWorld(); currentId = state.id
    const definition = missionScenes[missions[state.id].scene]
    for (const object of state.objects) {
      const model = createEnvironmentModel(object, object.color)
      world.add(model.group); entities.set(object.id, model.group); pickables.push(...model.pickables)
      if (object.category === 'ground') continue
      const bounds = objectBounds(object), frame = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max)), definition.color)
      frame.visible = false; world.add(frame); frames.set(object.id, frame)
      const label = document.createElement('div'); label.className = 'mission-object-label'; label.style.display = 'none'; label.dataset.missionObject = object.id; host.appendChild(label); labels.set(object.id, label)
      if (object.category === 'equipment' && !object.support) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(.01, .16, .28), new THREE.MeshStandardMaterial({ color: definition.color, emissive: definition.color, emissiveIntensity: .25 }))
        panel.position.set(bounds.max[0] + .006, Math.min(1.3, bounds.max[1] * .75), (bounds.min[2] + bounds.max[2]) / 2); model.group.add(panel)
      }
    }
    for (const zone of definition.zones) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(zone.max[0] - zone.min[0], .012, zone.max[2] - zone.min[2]), new THREE.MeshBasicMaterial({ color: '#ff788a', transparent: true, opacity: .24 }))
      mesh.position.set((zone.min[0] + zone.max[0]) / 2, .015, (zone.min[2] + zone.max[2]) / 2); world.add(mesh)
    }
    const edge = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(-5.8, .01, -4.8), new THREE.Vector3(5.8, .015, 4.8)), definition.color); world.add(edge)
  }
  function update(state: MissionState, model: THREE.Group, camera: THREE.Camera, width: number, height: number) {
    if (currentId !== state.id) rebuild(state)
    if (state.revision !== revision) {
      for (const object of state.objects) {
        const entity = entities.get(object.id)!
        object.parts.forEach((part, i) => entity.children[i]!.position.fromArray(part.center))
        const bounds = objectBounds(object)
        frames.get(object.id)?.box.set(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
      }
      revision = state.revision
    }
    const payload = entities.get('payload')?.children[0]
    if (payload && state.payloadPosition) {
      payload.position.fromArray(state.payloadPosition); payload.rotation.y = -state.payloadHeading * Math.PI / 180
      if (state.attached) {
        model.updateWorldMatrix(true, true)
        const palms = ['left', 'right'].map(side => model.getObjectByName(`humanoid/body/waist/${side}-shoulder/elbow/wrist/palm`)!.getWorldPosition(new THREE.Vector3()))
        payload.position.copy(palms[0]!).add(palms[1]!).multiplyScalar(.5).add(new THREE.Vector3(.11, 0, 0).applyQuaternion(model.quaternion))
        payload.rotation.y = model.rotation.y
      }
    }
    const positions = routeGeometry.getAttribute('position')
    state.route.path.forEach((point, index) => positions.setXYZ(index, point[0], .03, point[2]))
    positions.needsUpdate = true; routeGeometry.setDrawRange(0, state.route.path.length)
    route.visible = state.route.path.length > 0; goal.visible = route.visible; goal.position.set(state.route.goal[0], .03, state.route.goal[2])
    const detections = state.detections.filter(detection => detection.status === 'detected'), raysPosition = raysGeometry.getAttribute('position')
    detections.slice(0, 20).forEach((detection, index) => { raysPosition.setXYZ(index * 2, ...(state.scanOrigin ?? detection.anchor)); raysPosition.setXYZ(index * 2 + 1, ...detection.anchor) })
    raysPosition.needsUpdate = true; raysGeometry.setDrawRange(0, Math.min(20, detections.length) * 2); rays.visible = !!state.scanOrigin
    let row = 0
    for (const [id, frame] of frames) {
      const detection = detections.find(item => item.id === id), marked = state.marked.includes(id)
      frame.visible = (!!state.scanOrigin && !!detection || marked) && id !== 'payload'
      const label = labels.get(id)!
      label.style.display = frame.visible ? 'block' : 'none'
      if (!frame.visible) continue
      const object = state.objects.find(item => item.id === id)!
      label.textContent = `${object.name} · ${object.anomaly ? '预设异常' : marked ? '已标记' : '已识别'}${detection ? ` · ${detection.distance.toFixed(1)} m` : ''}`
      const anchor = frame.box.getCenter(new THREE.Vector3()); anchor.y = frame.box.max.y + .12; anchor.project(camera)
      label.style.left = `${Math.max(12, Math.min(width - 210, (anchor.x + 1) * width / 2))}px`
      label.style.top = `${Math.max(105 + row++ * 25, Math.min(height - 150, (1 - anchor.y) * height / 2))}px`
    }
  }
  return { root, pickables, update, bounds(id?: string) {
    const entity = id ? entities.get(id) : undefined
    return entity ? new THREE.Box3().setFromObject(entity) : new THREE.Box3(new THREE.Vector3(-6, 0, -5), new THREE.Vector3(6, 2.4, 5))
  }, dispose() { labels.forEach(label => label.remove()); labels.clear() } }
}
