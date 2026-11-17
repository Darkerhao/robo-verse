import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import gsap from 'gsap'
import { createRobot } from './RobotModel'
import { findRobotPart, isObjectVisible, type RobotPart } from './RobotParts'
import { createRobotLab } from './RobotLab'
import { createPerceptionScene } from './PerceptionScene'
import { createMissionScene } from './MissionScene'
import { missionScenes, missions } from '@/config/missions'
import type { MissionState } from '@/types/mission'
import type { LabPart, LabState } from '@/config/lab'
import type { PerceptionState } from '@/config/perception'
import type { CameraView, Quality, RobotId, RobotState, Vector3Tuple } from '@/types/robot'

export interface SceneState { robot: RobotId; robots: Record<RobotId, RobotState>; paused: boolean; grid: boolean; quality: Quality; lab?: LabState; perception?: PerceptionState; mission?: MissionState }
export interface SceneStats { fps: number; calls: number; geometries: number; textures: number }
export interface SceneOptions {
  overview?: boolean
  lab?: boolean
  perception?: boolean
  mission?: boolean
  onProgress?: (progress: number, stage: string) => void
  onReady?: () => void
  onHover?: (id?: RobotId, part?: RobotPart) => void
  onSelect?: (id?: RobotId) => void
  onOpen?: (id: RobotId) => void
  onParts?: (parts: Record<RobotId, LabPart[]>) => void
  onPartSelect?: (part?: LabPart) => void
  onFrame?: (dt: number) => void
  onObjectHover?: (id?: string) => void
  onObjectSelect?: (id: string | null) => void
  onGoal?: (position: Vector3Tuple) => void
}

export function createScene(host: HTMLElement, read: () => SceneState, onStats: (stats: SceneStats) => void, onError: (message: string) => void, options: SceneOptions = {}) {
  const field = options.perception || options.mission
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setClearColor('#070B14')
  options.onProgress?.(20, 'WebGL 渲染器已创建')
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = field ? 1.05 : 1.35
  renderer.domElement.setAttribute('aria-label', '可交互机器人三维场景：左键旋转、滚轮缩放、右键平移')
  renderer.domElement.setAttribute('role', 'img')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2('#070B14', field ? .017 : .06)
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 100)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = .075
  controls.minDistance = options.lab ? .45 : field ? 1.2 : 1.9
  controls.maxDistance = field ? 36 : options.overview ? 14 : options.lab ? 12 : 8
  controls.maxPolarAngle = Math.PI / 2 - .018
  controls.minPolarAngle = .02
  controls.maxTargetRadius = field ? 9 : options.lab ? 4 : 2
  controls.screenSpacePanning = true
  let environment: THREE.WebGLRenderTarget | undefined
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentScene = new RoomEnvironment()
  try {
    environment = pmrem.fromScene(environmentScene, .03)
    scene.environment = environment.texture
    scene.environmentIntensity = field ? .25 : .65
  } finally { pmrem.dispose(); environmentScene.dispose() }
  options.onProgress?.(40, '环境光与材质已准备')

  const ambient = new THREE.HemisphereLight('#d6e8ed', '#353d33', field ? 1.1 : 2)
  scene.add(ambient)
  const key = new THREE.DirectionalLight('#f4f8ed', field ? 2.8 : 4.6)
  key.position.set(2, 5, 3); key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .1, far: 14 })
  if (field) Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, far: 25 })
  key.shadow.bias = -.0005; key.shadow.normalBias = .02
  scene.add(key)
  const rim = new THREE.DirectionalLight('#b4d0df', field ? 1.6 : 3.1); rim.position.set(-3, 2, -2); scene.add(rim)
  const fill = new THREE.DirectionalLight('#43E5FF', field ? .65 : 1); fill.position.set(1, 1, -3); scene.add(fill)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: '#070B14', roughness: .7, metalness: .2 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.09; floor.receiveShadow = true; scene.add(floor)
  const grid = new THREE.GridHelper(40, 80, '#244764', '#122d43'); grid.position.y = -.087
  const gridMaterial = grid.material as THREE.Material; gridMaterial.transparent = true; gridMaterial.opacity = .4; scene.add(grid)
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(options.overview ? 2.9 : 1.75, options.overview ? 3 : 1.82, .075, 96), new THREE.MeshStandardMaterial({ color: '#142638', metalness: .65, roughness: .35 }))
  platform.position.y = -.045; platform.receiveShadow = true; scene.add(platform)
  for (const radius of options.overview ? [2.8, 2.85] : [1.66, 1.71]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .004, 4, 120), new THREE.MeshBasicMaterial({ color: '#00C8FF', transparent: true, opacity: .4 }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = -.002; scene.add(ring)
  }
  const markings = new THREE.Group()
  const lineMaterial = new THREE.MeshBasicMaterial({ color: '#43E5FF', transparent: true, opacity: .45 })
  const lineGeometry = new THREE.BoxGeometry(.045, .002, .012)
  for (let n = 0; n < 64; n++) {
    const angle = n * Math.PI / 32
    const mark = new THREE.Mesh(lineGeometry, lineMaterial); mark.position.set(Math.cos(angle) * 1.64, .001, Math.sin(angle) * 1.64); mark.rotation.y = -angle; markings.add(mark)
  }
  scene.add(markings)
  if (field) { platform.visible = false; markings.visible = false; scene.children.filter(object => object instanceof THREE.Mesh && object.geometry instanceof THREE.TorusGeometry).forEach(object => { object.visible = false }) }
  const quadruped = createRobot('quadruped')
  options.onProgress?.(65, '四足机械模型已构建')
  const humanoid = createRobot('humanoid')
  options.onProgress?.(85, '人形机械模型已构建')
  const models = { quadruped, humanoid }
  scene.add(models.quadruped.root, models.humanoid.root)
  const labs = options.lab ? { quadruped: createRobotLab('quadruped', quadruped.root), humanoid: createRobotLab('humanoid', humanoid.root) } : undefined
  const perception = options.perception ? createPerceptionScene(host) : undefined
  if (perception) scene.add(perception.root)
  const mission = options.mission ? createMissionScene(host) : undefined
  if (mission) scene.add(mission.root)
  const environmentView = perception ?? mission
  if (labs) { scene.add(labs.quadruped.visuals, labs.humanoid.visuals); options.onParts?.({ quadruped: labs.quadruped.catalog, humanoid: labs.humanoid.catalog }) }
  const pickables: THREE.Mesh[] = []
  Object.values(models).forEach(model => model.root.traverse(node => { if (node instanceof THREE.Mesh) pickables.push(node) }))
  if (options.overview) {
    quadruped.root.position.set(-.65, 0, .7)
    humanoid.root.position.set(1.05, 0, -.65)
    // 远景装置形成真实空间纵深，场景装饰不作为感知点云。
    const structureGeometry = new THREE.BoxGeometry(.15, 3.4, .15)
    const structureMaterial = new THREE.MeshStandardMaterial({ color: '#253d57', metalness: .65, roughness: .45 })
    for (const x of [-7, -3.5, 0, 3.5, 7]) {
      const column = new THREE.Mesh(structureGeometry, structureMaterial)
      column.position.set(x, 1.6, -6); scene.add(column)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15, .1, .1), new THREE.MeshBasicMaterial({ color: '#164968' }))
    beam.position.set(0, 3.3, -6); scene.add(beam)
  }
  let quality: Quality | undefined
  let frame = 0, frameCount = 0, sampleTime = performance.now(), previousTime = performance.now()
  let disposed = false, ready = false
  let automaticView = true
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), pointerStart = new THREE.Vector2()
  let pointerPressed = false, parallax = 0, appliedParallax = 0
  let focused: RobotId | undefined, hoveredPart: string | undefined, focusedPart: string | undefined
  let lastFit = -1, cameraTransitionUntil = 0
  let labView: CameraView = 'perspective'
  let perceptionRobot: RobotId | undefined
  const fitTarget = new THREE.Vector3(), fitCamera = new THREE.Vector3()
  const viewDirections: Record<CameraView, THREE.Vector3> = { perspective: new THREE.Vector3(1, .55, 1.4).normalize(), front: new THREE.Vector3(1, .04, .001).normalize(), side: new THREE.Vector3(.001, .04, 1).normalize(), top: new THREE.Vector3(.001, 1, .001).normalize() }

  function resize() {
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    // 窄视口扩大垂直视野，给完整机身与场景标签留出空间。
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36) / 2) * Math.max(1, 1.2 / camera.aspect)))
    camera.updateProjectionMatrix()
    if (options.lab && automaticView) lastFit = -1
    if (options.overview && automaticView) view('perspective', false)
    if (field && automaticView) view(labView, false)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  function killCameraTween() { gsap.killTweensOf(camera.position); gsap.killTweensOf(controls.target) }
  function controlStart() { automaticView = false; focusedPart = undefined; parallax = 0; killCameraTween() }
  controls.addEventListener('start', controlStart)
  function view(preset: CameraView = 'perspective', animate = true) {
    labView = preset
    killCameraTween()
    automaticView = true; parallax = 0; appliedParallax = 0; focused = undefined; focusedPart = undefined; hoveredPart = undefined; lastFit = -1; options.onSelect?.(); options.onPartSelect?.()
    options.onHover?.()
    if (environmentView) {
      const box = environmentView.bounds(), center = box.getCenter(new THREE.Vector3())
      const direction = (preset === 'perspective' ? new THREE.Vector3(.75, .85, 1.1) : viewDirections[preset]).clone().normalize()
      const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(center.clone().add(direction), center, new THREE.Vector3(0, 1, 0)))
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation), up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation)
      const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), horizontal = vertical * camera.aspect
      let distance = 10
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center), depth = corner.dot(direction)
        distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / horizontal, depth + Math.abs(corner.dot(up)) / vertical)
      }
      const destination = center.clone().addScaledVector(direction, Math.min(controls.maxDistance, distance * 1.08))
      const duration = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? .65 : 0
      cameraTransitionUntil = performance.now() + duration * 1000
      gsap.to(camera.position, { x: destination.x, y: destination.y, z: destination.z, duration, overwrite: true })
      gsap.to(controls.target, { x: center.x, y: center.y, z: center.z, duration, overwrite: true })
      if (!duration) controls.update()
      return
    }
    const human = read().robot === 'humanoid'
    const fullscreen = !!document.fullscreenElement
    const compact = host.clientWidth <= 1100 && !fullscreen
    // 人形新增颈部与头部结构后，提高焦点给顶部名称标签留出空间。
    const y = options.overview ? (compact ? 1.7 : .8) : human ? 1.14 : .5
    const distance = human ? 1.14 : 1
    const positions: Record<CameraView, [number, number, number]> = { perspective: [2.65 * distance, 1.95 * distance, 3.15 * distance], front: [4.2 * distance, y + .15, .001], side: [.001, y + .15, 4.3 * distance], top: [.001, 5.5 * distance, .001] }
    const target = options.overview ? new THREE.Vector3(compact || fullscreen ? 0 : -1.6, y, compact || fullscreen ? 0 : .7) : new THREE.Vector3(0, preset === 'top' ? 0 : y, 0)
    const [x, py, z] = options.overview ? [target.x + 4.6, target.y + 2.3, target.z + 6.1] : positions[preset]
    const duration = animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? .75 : 0
    cameraTransitionUntil = performance.now() + duration * 1000
    gsap.to(camera.position, { x, y: py, z, duration, ease: 'power3.inOut', overwrite: true })
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration, ease: 'power3.inOut', overwrite: true })
    if (!duration) controls.update()
  }
  function zoom(factor: number) {
    automaticView = false
    killCameraTween()
    const offset = camera.position.clone().sub(controls.target)
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance))
    camera.position.copy(controls.target).add(offset); controls.update()
  }
  function pick(event: MouseEvent | PointerEvent): { id?: RobotId; part?: RobotPart; objectId?: string; point?: Vector3Tuple } | undefined {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    // r187 Raycaster 不检查 visible；透视外壳也需主动排除，内部模块才可拾取。
    const transparent = read().lab?.transparent
    const hit = raycaster.intersectObjects([...pickables.filter(mesh => isObjectVisible(mesh) && !(transparent && findRobotPart(mesh)?.kind === 'shell')), ...(environmentView?.pickables.filter(isObjectVisible) ?? [])], false)[0]
    let object: THREE.Object3D | null = hit?.object ?? null
    const part = object ? findRobotPart(object) : undefined
    while (object) {
      if (object.userData.robotId) return { id: object.userData.robotId as RobotId, part }
      if (object.userData.environmentId) return { objectId: String(object.userData.environmentId), point: hit!.point.toArray() as Vector3Tuple }
      object = object.parent
    }
  }
  function framingDistance(radius: number, minimum: number, padding = 1.35) {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2)
    const angle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect))
    return THREE.MathUtils.clamp(radius / Math.sin(angle) * padding, minimum, controls.maxDistance)
  }
  function focus(id: RobotId, partId?: string) {
    killCameraTween(); automaticView = false; focused = id
    focusedPart = partId
    // 重置/拖动进度后可能尚未渲染下一帧，聚焦前先应用当前展示状态。
    const state = read()
    if (labs && state.lab) labs[id].update(state.lab, hoveredPart)
    // 以模型包围球和当前视野确定距离，保持侧高位并避免进入模型。
    const box = labs ? labs[id].bounds(partId) : new THREE.Box3().setFromObject(models[id].root)
    if (box.isEmpty()) return
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const distance = framingDistance(sphere.radius, options.lab ? .65 : controls.minDistance)
    const destination = sphere.center.clone().add(new THREE.Vector3(1, .6, 1.4).normalize().multiplyScalar(distance))
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : .65
    cameraTransitionUntil = performance.now() + duration * 1000
    gsap.to(camera.position, { x: destination.x, y: destination.y, z: destination.z, duration, overwrite: true, ease: 'power3.inOut' })
    gsap.to(controls.target, { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, duration, overwrite: true, ease: 'power3.inOut' })
    options.onSelect?.(id)
    if (labs) options.onPartSelect?.(labs[id].catalog.find(part => part.id === partId))
  }
  function focusObject(id: string) {
    if (!environmentView) return
    killCameraTween(); automaticView = false; focused = undefined; focusedPart = undefined
    const sphere = environmentView.bounds(id).getBoundingSphere(new THREE.Sphere()), distance = framingDistance(sphere.radius, 1.8, 1.2)
    const destination = sphere.center.clone().addScaledVector(new THREE.Vector3(1, .75, 1.2).normalize(), distance)
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : .65
    gsap.to(camera.position, { x: destination.x, y: destination.y, z: destination.z, duration, overwrite: true }); gsap.to(controls.target, { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, duration, overwrite: true })
  }
  function pointerDown(event: PointerEvent) { automaticView = false; pointerPressed = event.button === 0; pointerStart.set(event.clientX, event.clientY) }
  function pointerUp(event: PointerEvent) {
    if (pointerPressed && pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 5) {
      const hit = pick(event)
      options.onHover?.(hit?.id, hit?.part)
      hoveredPart = hit?.part?.id
      if (hit?.id) focus(hit.id, options.lab ? hit.part?.id : undefined)
      else if (hit?.objectId && hit.objectId !== 'ground') { if (mission) focusObject(hit.objectId); else options.onObjectSelect?.(hit.objectId) }
      else if (hit?.objectId === 'ground' && read().perception?.mode === 'path') options.onGoal?.(hit.point!)
      else if (options.overview && focused) view()
      else { focused = undefined; focusedPart = undefined; options.onSelect?.(); options.onPartSelect?.(); options.onObjectSelect?.(null) }
    }
    pointerPressed = false
  }
  function pointerMove(event: PointerEvent) {
    const hit = pick(event)
    hoveredPart = hit?.part?.id
    options.onObjectHover?.(hit?.objectId)
    renderer.domElement.style.cursor = hit ? 'pointer' : 'grab'; options.onHover?.(hit?.id, hit?.part)
    if (!event.buttons) parallax = pointer.x * .045
  }
  function pointerLeave() { pointerPressed = false; parallax = 0; hoveredPart = undefined; options.onHover?.(); options.onObjectHover?.() }
  function doubleClick(event: MouseEvent) { const hit = pick(event); if (hit?.id) { focus(hit.id, options.lab ? hit.part?.id : undefined); if (options.overview) options.onOpen?.(hit.id) }; if (hit?.objectId && hit.objectId !== 'ground') focusObject(hit.objectId) }
  const pointerEvents = { pointerdown: pointerDown, pointerup: pointerUp, pointermove: pointerMove, pointerleave: pointerLeave, pointercancel: pointerLeave, dblclick: doubleClick }
  for (const [name, handler] of Object.entries(pointerEvents)) renderer.domElement.addEventListener(name, handler as EventListener)
  function contextLost(event: Event) { event.preventDefault(); cancelAnimationFrame(frame); onError('三维渲染上下文已中断，请重新加载场景。') }
  renderer.domElement.addEventListener('webglcontextlost', contextLost)
  view('perspective', false); resize()
  function render(now: number) {
    if (disposed) return
    frame = requestAnimationFrame(render)
    const dt = Math.min((now - previousTime) / 1000, .1); previousTime = now
    if (document.hidden) { sampleTime = now; frameCount = 0; return }
    options.onFrame?.(dt)
    const state = read()
    if (state.mission) { const lighting = missionScenes[missions[state.mission.id].scene]; rim.color.set(lighting.light); fill.color.set(lighting.color) }
    if (quality !== state.quality) { quality = state.quality; renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1)); renderer.shadowMap.enabled = quality !== 'low'; key.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024); key.shadow.map?.dispose(); key.shadow.map = null; resize() }
    grid.visible = state.grid
    models.quadruped.root.visible = !!options.overview || state.robot === 'quadruped'
    models.humanoid.root.visible = !!options.overview || state.robot === 'humanoid'
    const missionFrozen = !!state.mission && ['paused', 'stopped', 'failed'].includes(state.mission.status)
    for (const id of Object.keys(models) as RobotId[]) {
      if (labs) labs[id].visuals.visible = models[id].root.visible
      if (models[id].root.visible) {
        models[id].update(state.robots[id], dt, state.paused || state.robots[id].emergency || missionFrozen)
        if (state.perception || state.mission) {
          const position = state.robots[id].worldPosition
          if (perceptionRobot !== id) models[id].root.position.fromArray(position)
          else models[id].root.position.lerp(new THREE.Vector3(...position), state.paused || state.robots[id].emergency || missionFrozen ? 1 : 1 - Math.exp(-dt * 14))
          perceptionRobot = id
        }
        if (state.lab && labs) labs[id].update(state.lab, hoveredPart)
      }
    }
    if (labs && state.lab && automaticView && now >= cameraTransitionUntil) {
      if (Math.abs(state.lab.progress - lastFit) > .1 || lastFit === -1) {
        const box = labs[state.robot].bounds()
        if (!box.isEmpty()) {
          const sphere = box.getBoundingSphere(new THREE.Sphere())
          const distance = framingDistance(sphere.radius, 3.5, 1.1)
          fitTarget.copy(sphere.center); fitCamera.copy(sphere.center).addScaledVector(viewDirections[labView], distance); lastFit = state.lab.progress
        }
      }
      const smoothing = 1 - Math.exp(-dt * 5)
      controls.target.lerp(fitTarget, smoothing); camera.position.lerp(fitCamera, smoothing)
    }
    if (labs && focusedPart && now >= cameraTransitionUntil) {
      const box = labs[state.robot].bounds(focusedPart)
      if (!box.isEmpty()) {
        const delta = box.getCenter(new THREE.Vector3()).sub(controls.target)
        controls.target.add(delta); camera.position.add(delta)
      }
    }
    if (environmentView && focused && now >= cameraTransitionUntil) {
      const center = new THREE.Box3().setFromObject(models[focused].root).getCenter(new THREE.Vector3()), delta = center.sub(controls.target)
      controls.target.add(delta); camera.position.add(delta)
    }
    controls.update()
    if (perception && state.perception) perception.update(state.perception, camera, host.clientWidth, host.clientHeight, now)
    if (mission && state.mission) mission.update(state.mission, models[state.robot].root, camera, host.clientWidth, host.clientHeight)
    // 轻微相机视差仅用于首页默认视角，不改变机器人关节或用户操作后的视角。
    if (options.overview && automaticView && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const offset = THREE.MathUtils.lerp(appliedParallax, parallax, Math.min(1, dt * 3))
      camera.position.x += offset - appliedParallax; appliedParallax = offset
    }
    if (import.meta.env.DEV) renderer.domElement.dataset.sceneState = JSON.stringify({ visible: Object.keys(models).filter(id => models[id as RobotId].root.visible), focused, focusedPart, camera: camera.position.toArray(), target: controls.target.toArray(), quality, shadows: renderer.shadowMap.enabled })
    renderer.render(scene, camera)
    if (!ready) { ready = true; options.onProgress?.(100, '首帧已渲染'); options.onReady?.() }
    frameCount++
    if (now - sampleTime > 1000) {
      onStats({ fps: Math.round(frameCount * 1000 / (now - sampleTime)), calls: renderer.info.render.calls, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
      frameCount = 0; sampleTime = now
    }
  }
  frame = requestAnimationFrame(render)
  function fit() { killCameraTween(); automaticView = true; focused = undefined; focusedPart = undefined; lastFit = -1; labView = 'perspective'; cameraTransitionUntil = 0; options.onSelect?.(); options.onPartSelect?.(); if (environmentView) view('perspective') }
  return { view, zoom, fit, focusObject, focusRobot: () => focus(read().robot), focusPart: (id: string) => focus(read().robot, id), clearSelection: () => { focusedPart = undefined; focused = undefined }, dispose() {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); killCameraTween()
    controls.removeEventListener('start', controlStart); controls.dispose()
    for (const [name, handler] of Object.entries(pointerEvents)) renderer.domElement.removeEventListener(name, handler as EventListener)
    renderer.domElement.removeEventListener('webglcontextlost', contextLost)
    if (labs) Object.values(labs).forEach(lab => lab.dispose())
    perception?.dispose(); mission?.dispose()
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry)
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material))
      }
      if (object instanceof THREE.InstancedMesh) object.dispose()
    })
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    key.shadow.dispose(); environment?.dispose(); scene.clear(); renderer.renderLists.dispose(); renderer.dispose()
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
    renderer.domElement.remove()
  } }
}
