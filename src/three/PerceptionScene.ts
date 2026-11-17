import * as THREE from 'three'
import { createEnvironmentModel } from './EnvironmentModel'
import { categories, cloudCapacity, environmentObjects, objectBounds, restrictedZones, robotClearance } from '@/config/perception'
import type { PerceptionState } from '@/config/perception'
type BoxFrame = THREE.Box3Helper & { material: THREE.LineBasicMaterial }

/** 仅展示统一感知快照；环境几何直接使用射线和规划共用的尺寸。 */
export function createPerceptionScene(host: HTMLElement) {
  const root = new THREE.Group(), environment = new THREE.Group(), contours = new THREE.Group(), recognition = new THREE.Group(), route = new THREE.Group()
  root.name = 'perception-world'; root.add(environment, contours, recognition, route)
  const pickables: THREE.Mesh[] = [], objects = environmentObjects(), entities = new Map<string, THREE.Group>()
  const frames = new Map<string, BoxFrame>(), outlines = new Map<string, BoxFrame>()
  const labels = new Map<string, HTMLDivElement>()
  const leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), connectors = new Map<string, SVGPolylineElement>()
  leaders.classList.add('perception-leaders'); leaders.setAttribute('aria-hidden', 'true'); host.appendChild(leaders)
  const palette = Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, new THREE.Color(value.color)])) as Record<keyof typeof categories, THREE.Color>
  for (const object of objects) {
    const { group, pickables: meshes } = createEnvironmentModel(object)
    environment.add(group); entities.set(object.id, group); pickables.push(...meshes)
    const bounds = objectBounds(object), box = new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
    const outline = new THREE.Box3Helper(box.clone(), palette[object.category]) as BoxFrame; outline.material.transparent = true; outline.material.opacity = .38; contours.add(outline); outlines.set(object.id, outline)
    const frame = new THREE.Box3Helper(box.clone().expandByScalar(.025), palette[object.category]) as BoxFrame; frame.material.depthTest = false; recognition.add(frame); frames.set(object.id, frame)
    const label = document.createElement('div'); label.className = 'perception-object-label'; label.dataset.detectionId = object.id; label.style.display = 'none'; host.appendChild(label); labels.set(object.id, label)
    const connector = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); connector.setAttribute('fill', 'none'); connector.setAttribute('stroke', categories[object.category].color); connector.setAttribute('stroke-opacity', '.45'); connector.setAttribute('stroke-width', '1'); leaders.appendChild(connector); connectors.set(object.id, connector)
  }
  // 箱体封边和设备面板仅作外观细节，主体检测尺寸保持统一。
  const detailMaterial = new THREE.MeshBasicMaterial({ color: '#9db9c8', transparent: true, opacity: .45 })
  for (const id of ['crate', 'movable-crate', 'equipment']) {
    const entity = entities.get(id)!, object = objects.find(item => item.id === id)!, part = object.parts[0]!
    const detail = new THREE.Mesh(new THREE.BoxGeometry(.008, part.size[1] * .55, part.size[2] * .55), detailMaterial)
    detail.position.set(part.center[0] + part.size[0] / 2 + .006, part.center[1], part.center[2]); entity.add(detail)
  }
  for (const zone of restrictedZones) {
    const geometry = new THREE.PlaneGeometry(zone.max[0] - zone.min[0], zone.max[2] - zone.min[2])
    const patch = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#FF788A', transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false }))
    patch.rotation.x = -Math.PI / 2; patch.position.set((zone.min[0] + zone.max[0]) / 2, .012, (zone.min[2] + zone.max[2]) / 2); root.add(patch)
    const boundary = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...zone.min), new THREE.Vector3(...zone.max)), '#FF788A'); root.add(boundary)
  }
  function dynamicGeometry(capacity: number) {
    const geometry = new THREE.BufferGeometry(), position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position); geometry.setDrawRange(0, 0)
    return { geometry, position }
  }
  const cloud = dynamicGeometry(cloudCapacity), color = new THREE.BufferAttribute(new Float32Array(cloudCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage)
  cloud.geometry.setAttribute('color', color)
  const points = new THREE.Points(cloud.geometry, new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, opacity: .92, depthWrite: false, toneMapped: false }))
  points.frustumCulled = false; root.add(points)
  const rays = dynamicGeometry(18), beams = new THREE.LineSegments(rays.geometry, new THREE.LineBasicMaterial({ color: '#43E5FF', transparent: true, opacity: .55, depthWrite: false, toneMapped: false }))
  beams.frustumCulled = false; root.add(beams)
  const scan = new THREE.Group(), ringGeometry = new THREE.RingGeometry(.992, 1, 128)
  const rangeRing = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#00C8FF', transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false }))
  rangeRing.rotation.x = -Math.PI / 2; scan.add(rangeRing)
  const sector = new THREE.Mesh(new THREE.CircleGeometry(1, 28, 0, .22), new THREE.MeshBasicMaterial({ color: '#00C8FF', transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false }))
  sector.rotation.x = -Math.PI / 2; scan.add(sector); root.add(scan)
  const line = dynamicGeometry(256), path = new THREE.Line(line.geometry, new THREE.LineBasicMaterial({ color: '#39F5B5', toneMapped: false }))
  path.frustumCulled = false; route.add(path)
  const markerGeometry = new THREE.TorusGeometry(.22, .017, 6, 40)
  const start = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: '#00C8FF' })), goal = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: '#39F5B5' }))
  start.rotation.x = goal.rotation.x = -Math.PI / 2; route.add(start, goal)
  const current = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 72), new THREE.MeshBasicMaterial({ color: '#43E5FF', transparent: true, opacity: .45, side: THREE.DoubleSide, depthWrite: false }))
  current.rotation.x = -Math.PI / 2; root.add(current)
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), .8, '#39F5B5', .18, .1); route.add(arrow)
  let revision = -1, obstacleSide = 1, labelTime = -1
  const projected = new THREE.Vector3(), heat = new THREE.Color()

  function update(state: PerceptionState, camera: THREE.Camera, width: number, height: number, now: number) {
    root.visible = state.active
    environment.visible = state.mode !== 'cloud'; contours.visible = state.showContours || state.mode === 'cloud'
    recognition.visible = state.mode === 'vision'; scan.visible = state.mode === 'lidar' && state.showBeams
    beams.visible = state.mode === 'lidar' && state.showBeams && state.historyId === null
    points.visible = state.showPoints && ['lidar', 'cloud'].includes(state.mode)
    route.visible = state.mode === 'path' || state.route.status === 'running' || state.route.status === 'paused'
    current.visible = state.mode !== 'normal'; current.scale.setScalar(robotClearance[state.robot]); current.position.set(state.position[0], .025, state.position[2])
    if (obstacleSide !== state.obstacleSide) {
      const offset = 3 * (state.obstacleSide - 1); entities.get('movable-crate')!.position.z = offset
      const bounds = objectBounds(environmentObjects(state.obstacleSide).find(object => object.id === 'movable-crate')!)
      for (const frame of [frames.get('movable-crate')!, outlines.get('movable-crate')!]) frame.box.set(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
      obstacleSide = state.obstacleSide
    }
    scan.position.fromArray(state.sensorOrigin); rangeRing.scale.setScalar(state.range); sector.scale.setScalar(state.range); sector.rotation.z = -state.angle
    if (revision !== state.revision) {
      const frame = state.history.find(item => item.id === state.historyId), data = frame?.points ?? state.points
      for (let i = 0; i < data.length; i++) {
        const point = data[i]!, tint = state.pointColor === 'class' ? palette[point.category] : heat.setHSL(point.distance / state.range * .58, .9, .58)
        cloud.position.setXYZ(i, ...point.position); color.setXYZ(i, tint.r, tint.g, tint.b)
      }
      cloud.geometry.setDrawRange(0, data.length); cloud.position.needsUpdate = true; color.needsUpdate = true
      state.beams.forEach((point, i) => { rays.position.setXYZ(i * 2, ...state.sensorOrigin); rays.position.setXYZ(i * 2 + 1, ...point) })
      rays.geometry.setDrawRange(0, state.beams.length * 2); rays.position.needsUpdate = true; revision = state.revision
    }
    state.route.path.forEach((point, i) => line.position.setXYZ(i, point[0], .035, point[2]))
    line.geometry.setDrawRange(0, state.route.path.length); line.position.needsUpdate = true
    start.position.set(state.route.start[0], .035, state.route.start[2]); goal.position.set(state.route.goal[0], .035, state.route.goal[2])
    arrow.position.set(state.position[0], .07, state.position[2])
    const next = state.route.path[state.route.waypoint] ?? state.route.goal
    const direction = new THREE.Vector3(next[0] - state.position[0], 0, next[2] - state.position[2])
    arrow.visible = direction.lengthSq() > .001; if (arrow.visible) arrow.setDirection(direction.normalize())
    const annotations: { id: string; x: number; y: number }[] = []
    for (const detection of state.detections) {
      const frame = frames.get(detection.id)!, label = labels.get(detection.id)!, outline = outlines.get(detection.id)!
      frame.visible = detection.status === 'detected'; outline.material.opacity = state.selectedObject === detection.id ? .95 : .38
      projected.fromArray(detection.anchor); if (detection.category !== 'ground') projected.y = frame.box.max.y + .15
      projected.project(camera)
      const visible = recognition.visible && frame.visible && projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .9
      label.style.display = visible ? 'block' : 'none'
      connectors.get(detection.id)!.style.display = visible ? 'block' : 'none'
      if (!visible) continue
      annotations.push({ id: detection.id, x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 })
      label.style.borderColor = categories[detection.category].color; label.dataset.selected = String(state.selectedObject === detection.id)
      if (now - labelTime > 200) {
        const title = document.createElement('strong'), details = document.createElement('span')
        title.textContent = `${categories[detection.category].name} · ${detection.name}`
        details.textContent = `${(detection.confidence * 100).toFixed(0)}% · ${detection.distance.toFixed(2)} m · ${detection.bearing.toFixed(0)}° · 已识别`
        label.replaceChildren(title, details)
      }
    }
    // 两列标注避免短屏标签相互遮挡，连接线始终指向真实三维目标投影。
    annotations.sort((a, b) => a.x - b.x)
    const split = Math.ceil(annotations.length / 2), labelWidth = Math.min(160, (width - 82) / 2)
    for (const [column, entries] of [annotations.slice(0, split), annotations.slice(split)].entries()) {
      entries.sort((a, b) => a.y - b.y).forEach((annotation, row) => {
        const label = labels.get(annotation.id)!, x = column === 0 ? 18 : width - 52 - labelWidth, y = 52 + row * 39, edge = column === 0 ? x + labelWidth : x
        label.style.width = `${labelWidth}px`; label.style.left = `${x}px`; label.style.top = `${y}px`
        connectors.get(annotation.id)!.setAttribute('points', `${edge},${y + 17} ${edge + (column === 0 ? 10 : -10)},${y + 17} ${annotation.x},${annotation.y}`)
      })
    }
    if (now - labelTime > 200) labelTime = now
  }
  return { root, pickables, update, bounds(id?: string) {
    const object = environmentObjects(obstacleSide as -1 | 1).find(item => item.id === id)
    const bounds = object ? objectBounds(object) : { min: [-6, 0, -5], max: [6, 2.2, 5] }
    return new THREE.Box3(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
  }, dispose() { labels.forEach(label => label.remove()); leaders.remove() } }
}
