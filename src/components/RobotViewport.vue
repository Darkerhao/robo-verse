<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createScene, type SceneStats } from '@/three/createScene'
import type { RobotPart } from '@/three/RobotParts'
import { useSimulationStore } from '@/stores/simulation'
import { useLabStore } from '@/stores/lab'
import type { CameraView, RobotId } from '@/types/robot'
import { categories, environmentObjects } from '@/config/perception'
import AppIcon from './AppIcon.vue'
const sim = useSimulationStore()
const props = defineProps<{ overview?: boolean; lab?: boolean; perception?: boolean }>()
const vision = computed(() => props.perception && sim.snapshot.perception.mode === 'vision')
const lab = useLabStore()
const emit = defineEmits<{ select: [id?: RobotId] }>()
const router = useRouter()
const host = ref<HTMLDivElement>()
const panel = ref<HTMLElement>()
const loading = ref(true)
const error = ref('')
const progress = ref(0)
const loadStage = ref('准备本地机械模型与三维场景')
const hovered = ref<RobotId>()
const hoveredPart = ref<RobotPart>()
const selected = ref<RobotId>()
const hoveredObject = ref<string>()
const stats = ref<SceneStats>({ fps: 0, calls: 0, geometries: 0, textures: 0 })
const activeView = ref<CameraView>('perspective')
let scene: ReturnType<typeof createScene> | undefined
let mounted = true
const views: { id: CameraView; label: string }[] = [{ id: 'perspective', label: '透视' }, { id: 'front', label: '正视' }, { id: 'side', label: '侧视' }, { id: 'top', label: '顶视' }]
async function init() {
  const selectedPart = props.lab ? lab.state.selectedPartId : null
  scene?.dispose(); scene = undefined; error.value = ''; loading.value = true; progress.value = 0; hovered.value = undefined; hoveredPart.value = undefined; selected.value = undefined
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (!mounted || !host.value) return
  try {
    scene = createScene(host.value, () => ({ robot: sim.selectedId, robots: sim.snapshot.robots, paused: sim.snapshot.paused, grid: sim.grid, quality: sim.quality, lab: props.lab ? lab.state : undefined, perception: props.perception ? sim.snapshot.perception : undefined }), value => { stats.value = value }, message => { error.value = message; loading.value = false }, {
      overview: props.overview,
      lab: props.lab,
      perception: props.perception,
      onProgress: (value, stage) => { progress.value = value; loadStage.value = stage },
      onReady: () => { loading.value = false; if (selectedPart) lab.state.selectedPartId = selectedPart },
      onHover: (id, part) => { hovered.value = id; hoveredPart.value = part },
      onSelect: id => { selected.value = id; if (id) activeView.value = 'perspective'; emit('select', id) },
      onOpen: id => { sim.select(id); void router.push(`/${id}`) },
      onParts: parts => { lab.catalog = parts },
      onPartSelect: part => { if (props.lab) lab.select(part?.id ?? null) },
      onFrame: props.lab ? lab.advance : undefined,
      onObjectHover: id => { hoveredObject.value = id },
      onObjectSelect: id => { if (props.perception) sim.send({ type: 'perception', command: { type: 'select', id } }) },
      onGoal: position => { sim.send({ type: 'perception', command: { type: 'goal', position } }, '已选择地面终点并规划避障路线') },
    })
    activeView.value = 'perspective'
  }
  catch (cause) { error.value = cause instanceof Error ? `无法启动三维场景：${cause.message}` : '无法启动 WebGL，请检查浏览器图形加速设置。' }
  finally { if (error.value) loading.value = false }
}
function changeView(view: CameraView) { activeView.value = view; scene?.view(view) }
watch(() => sim.selectedId, () => { if (!props.overview) changeView('perspective') })
watch(() => lab.state.selectedPartId, id => { if (props.lab) { if (id) scene?.focusPart(id); else scene?.clearSelection() } })
watch(() => sim.snapshot.perception.selectedObject, id => { if (props.perception && id) scene?.focusObject(id) })
watch(() => sim.quality, density => { if (props.perception) sim.send({ type: 'perception', command: { type: 'settings', values: { density } } }) }, { immediate: true })
defineExpose({ fit: () => { activeView.value = 'perspective'; scene?.fit() }, focusPart: () => { if (lab.state.selectedPartId) scene?.focusPart(lab.state.selectedPartId) }, focusRobot: () => { activeView.value = 'perspective'; scene?.focusRobot() }, focusObject: () => { const id = sim.snapshot.perception.selectedObject; if (id) scene?.focusObject(id) } })
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await panel.value?.requestFullscreen() }
  catch { sim.error = '浏览器未允许全屏，请检查浏览器的全屏权限。' }
}
onMounted(init)
onUnmounted(() => { mounted = false; scene?.dispose() })
</script>

<template>
  <section ref="panel" class="viewport panel" :class="{ 'hall-viewport': overview, 'perception-viewport': perception }" :data-robot="overview ? 'both' : sim.selectedId" :data-render-stats="JSON.stringify(stats)" :data-load-progress="progress">
    <div ref="host" class="canvas-host" />
    <div class="scene-top"><div class="scene-label"><span class="dot" /> {{ props.perception ? 'PERCEPTION FIELD' : props.lab ? 'HOLOGRAPHIC LAB' : 'LIVE SCENE' }} <span class="scene-slash">/</span><span>{{ props.perception ? '感知训练场' : props.lab ? '机械结构探索' : '实验室环境' }}</span></div><div class="scene-tags"><span class="scene-tag">PBR</span><span class="scene-tag">{{ sim.quality.toUpperCase() }}</span><button class="scene-icon" title="切换全屏" aria-label="切换全屏" @click="fullscreen"><AppIcon name="expand" /></button></div></div>
    <div v-if="!overview && !vision" class="model-label"><span class="eyebrow">{{ sim.definition.category }} · DIGITAL TWIN</span><h2>{{ sim.definition.name }}<span>{{ sim.selectedId === 'quadruped' ? 'QUADRUPED' : 'HUMANOID' }}</span></h2><span class="model-id mono">{{ sim.definition.serial }}</span></div>
    <div v-if="overview && (hovered || selected)" class="pick-label">{{ (hovered || selected) === 'quadruped' ? '四足机器人 / QUADRUPED' : '人形机器人 / HUMANOID' }}<small>点击聚焦 · 双击进入数字孪生</small></div>
    <div v-if="!overview && !vision && hoveredPart" class="part-label" :data-part-id="hoveredPart.id"><span>{{ hoveredPart.name }}</span><small class="mono" :title="hoveredPart.id">{{ hoveredPart.id }}</small></div>
    <div v-if="perception && !vision && hoveredObject && hoveredObject !== 'ground'" class="part-label"><span>{{ environmentObjects().find(object => object.id === hoveredObject)?.name }}</span><small>点击选择与局部放大</small></div>
    <div v-if="perception" class="perception-scene-status"><span class="badge">SIMULATION</span><span>{{ sim.snapshot.perception.historyId !== null ? '扫描历史回看' : sim.snapshot.perception.scanning ? '360° 扫描中' : '扫描已暂停' }} · {{ sim.snapshot.perception.range }} m</span><span class="mono">X {{ sim.snapshot.perception.position[0].toFixed(2) }} / Z {{ sim.snapshot.perception.position[2].toFixed(2) }} m</span></div>
    <div v-if="perception && ['lidar', 'cloud'].includes(sim.snapshot.perception.mode)" class="cloud-legend"><template v-if="sim.snapshot.perception.pointColor === 'class'"><span v-for="(category, key) in categories" :key="key"><i :style="{ background: category.color }" />{{ category.name }}</span></template><template v-else><span>近</span><i class="distance-gradient" /><span>远</span></template></div>
    <div v-if="props.lab" class="lab-scene-status"><span class="badge">SIMULATION</span><span>{{ lab.state.progress === 0 ? '完整装配' : lab.state.progress === 10 ? '拆解完成' : `结构拆解 ${(lab.state.progress * 10).toFixed(0)}%` }}</span><span v-if="lab.state.transparent">外壳透明 · 可拾取内部</span><span v-if="lab.state.skeleton">实时骨骼</span><span v-if="lab.state.axes">X / Y / Z 关节轴</span></div>
    <div class="scene-toolbar"><button class="scene-icon" :class="{ active: sim.grid }" title="显示或隐藏网格" aria-label="切换网格" :aria-pressed="sim.grid" @click="sim.grid = !sim.grid"><AppIcon name="grid" /></button><span /><button class="scene-icon" title="放大" aria-label="放大模型" @click="scene?.zoom(.8)"><AppIcon name="plus" /></button><button class="scene-icon" title="缩小" aria-label="缩小模型" @click="scene?.zoom(1.25)"><AppIcon name="minus" /></button><span /><button class="scene-icon" title="恢复默认视角" aria-label="恢复默认视角" @click="changeView('perspective')"><AppIcon name="target" /></button></div>
    <div class="scene-bottom"><div class="axis-gizmo" aria-label="三维坐标轴"><i class="axis-y" /><i class="axis-x" /><i class="axis-z" /><span class="y">Y</span><span class="x">X</span><span class="z">Z</span><b /></div><div v-if="!overview" class="camera-switch" aria-label="相机视角"><button v-for="view in views" :key="view.id" :class="{ active: activeView === view.id }" :aria-pressed="activeView === view.id" @click="changeView(view.id)">{{ view.label }}</button></div><span v-else class="hall-interaction">点击机器人聚焦 · 双击进入</span><div class="scene-performance mono"><span class="dot" /> {{ stats.fps || '—' }} FPS</div></div>
    <div class="scene-help"><span>左键旋转</span><i /> <span>滚轮缩放</span><i /> <span>{{ props.perception ? '路径视图点击地面选终点' : props.lab ? '点击选择部件' : '右键平移' }}</span><span class="gait-note">{{ props.perception ? '环境感知与几何避障' : props.lab ? '结构与关节运动学演示' : '原地步态仿真' }} · 1 单位 = 1 m</span></div>
    <div v-if="loading || error" class="scene-overlay" role="status"><div v-if="loading" class="loading-ring" /><AppIcon v-else name="cube" /><h3>{{ loading ? '正在构建数字孪生场景' : '场景暂不可用' }}</h3><p>{{ loading ? loadStage : error }}</p><template v-if="loading"><progress :value="progress" max="100" aria-label="模型与场景加载进度" /><span class="mono">{{ progress }}%</span></template><button v-if="error" class="btn btn-primary" @click="init"><AppIcon name="reset" />重新加载场景</button></div>
    <span v-if="sim.current.emergency" class="freeze-indicator emergency"><AppIcon name="stop" />急停已锁定</span><span v-else-if="sim.snapshot.paused" class="freeze-indicator"><AppIcon name="pause" />仿真已暂停</span>
  </section>
</template>

<style scoped lang="less">
.viewport { height: 100%; min-height: 460px; position: relative; overflow: hidden; background: #1b2225; &:fullscreen { width: 100vw; height: 100vh; border-radius: 0; } }
.perception-viewport { .model-label { top: 57px; .eyebrow,.model-id,h2 > span { display: none; } h2 { font-size: 16px; letter-spacing: 0; color: var(--muted); } }.part-label { top: 98px; font-size: 10px; }.scene-toolbar { top: 32%; } }
.perception-scene-status { position: absolute; bottom: 106px; left: 24px; right: 55px; display: flex; flex-wrap: wrap; gap: 9px; align-items: center; pointer-events: none; font-size: 9px; color: var(--muted); .badge { font-size: 8px; } }
.cloud-legend { position: absolute; left: 24px; bottom: 142px; right: 55px; display: flex; gap: 11px; flex-wrap: wrap; font-size: 8px; color: var(--muted); pointer-events: none; span { display: flex; gap: 4px; align-items: center; } i { width: 5px; height: 5px; border-radius: 50%; }.distance-gradient { width: 100px; height: 5px; border-radius: 3px; background: linear-gradient(90deg,#ff5757,#f5ed55,#39ef87,#43e5ff,#6666ff); } }
:deep(.perception-leaders) { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
:deep(.perception-object-label) { position: absolute; pointer-events: none; padding: 5px 7px; border-left: 2px solid var(--cyan); background: #070b14e8; white-space: nowrap; font-size: 9px; color: var(--text); strong { display: block; font-weight: 500; line-height: 11px; overflow: hidden; text-overflow: ellipsis; } > span { display: block; margin-top: 3px; font-size: 8px; line-height: 10px; color: var(--muted); } &[data-selected=true] { background: #162c40ef; } }
.lab-scene-status { position: absolute; bottom: 115px; left: 24px; right: 55px; display: flex; flex-wrap: wrap; align-items: center; gap: 9px; color: var(--muted); font-size: 9px; pointer-events: none; .badge { font-size: 8px; } }
.part-label { position: absolute; top: 156px; left: 26px; max-width: min(240px, 60%); padding: 8px 10px; border-left: 2px solid var(--cyan); background: #070b14df; pointer-events: none; color: var(--cyan); font-size: 11px; small { display: block; margin-top: 5px; font-size: 8px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.pick-label { position: absolute; right: 8%; top: 72px; color: var(--cyan); font-size: 11px; pointer-events: none; small { display: block; margin-top: 8px; color: var(--muted); font-size: 9px; } }.hall-interaction { color: var(--muted); font-size: 10px; }.hall-viewport { .scene-top { top: 22px; }.scene-toolbar { top: auto; bottom: 160px; right: 24px; }.scene-help { background: #070b14cc; }.pick-label { top: 80px; } }.scene-overlay progress { width: 180px; height: 4px; accent-color: var(--accent); }
.canvas-host { position: absolute; inset: 0 0 30px; :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: none; } }
.scene-top { position: absolute; top: 17px; left: 21px; right: 17px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
.scene-label { display: flex; align-items: center; gap: 8px; font-size: 9px; letter-spacing: 1px; color: #a6b3ac; .dot { color: var(--accent); } > span:last-child { letter-spacing: .2px; font-size: 10px; } }.scene-slash { margin: 0 3px; color: #5d6b62; }
.scene-tags { display: flex; align-items: center; gap: 6px; pointer-events: auto; }.scene-tag { font-size: 8px; letter-spacing: .7px; padding: 4px 6px; border: 1px solid #41504677; border-radius: 4px; color: #a2b1aa; }
.scene-icon { display: grid; place-items: center; width: 30px; height: 31px; border-radius: 5px; background: transparent; color: #a1b0a8; .icon { width: 15px; height: 15px; } &:hover, &.active { color: var(--accent); background: #a0bb7412; } }
.model-label { position: absolute; top: 76px; left: 26px; pointer-events: none; .eyebrow { font-size: 8px; letter-spacing: 1.2px; } h2 { font-size: 31px; font-weight: 500; letter-spacing: -1.1px; margin: 6px 0 6px; display: flex; align-items: center; gap: 12px; span { font-size: 8px; letter-spacing: 1.2px; font-weight: 400; color: #72897f; border-left: 1px solid #536458; padding-left: 12px; } }.model-id { font-size: 8px; letter-spacing: 1px; color: #7d8e87; } }
.scene-toolbar { position: absolute; right: 17px; top: 38%; background: #151b1bba; border: 1px solid #41504688; backdrop-filter: blur(8px); padding: 3px; border-radius: 7px; display: grid; gap: 3px; > span { height: 1px; background: #354237; margin: 2px 5px; } }
.scene-bottom { position: absolute; bottom: 53px; left: 24px; right: 20px; display: flex; align-items: flex-end; justify-content: space-between; pointer-events: none; }
.camera-switch { pointer-events: auto; display: flex; gap: 3px; padding: 4px; border: 1px solid #3d4842; border-radius: 6px; background: #171e1dce; backdrop-filter: blur(10px); button { font-size: 10px; background: transparent; border-radius: 3px; color: #8f9d95; padding: 6px 13px; &.active { background: #39462f; color: #d1eba4; } &:hover { color: var(--accent); } } }
.scene-performance { color: #99b590; font-size: 9px; display: flex; align-items: center; gap: 6px; padding-bottom: 10px; .dot { width: 4px; height: 4px; } }
.axis-gizmo { width: 50px; height: 60px; position: relative; font-size: 8px; i { position: absolute; width: 1px; height: 24px; top: 13px; left: 23px; transform-origin: bottom; } .axis-y { background: #a6b887; }.axis-x { background: #d3867b; transform: rotate(120deg); }.axis-z { background: #81a5cb; transform: rotate(-115deg); } span { position: absolute; }.y { top: 0; left: 20px; color: #a6b887; }.x { top: 43px; left: 43px; color: #d3867b; }.z { top: 42px; left: 0; color: #81a5cb; } b { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: #a5b0a2; top: 34px; left: 21px; } }
.scene-help { position: absolute; bottom: 0; left: 0; right: 0; height: 30px; padding: 0 18px; display: flex; align-items: center; gap: 9px; border-top: 1px solid #35403b; background: #191f21; font-size: 8px; color: #75827b; i { width: 2px; height: 2px; border-radius: 50%; background: #66736b; } .gait-note { margin-left: auto; color: #5e7067; } }
.scene-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 18px; background: #1a2023f5; z-index: 3; padding: 30px; text-align: center; p { color: var(--muted); font-size: 12px; max-width: 360px; line-height: 1.8; } > .icon { width: 40px; height: 40px; color: var(--accent); } }.loading-ring { width: 32px; height: 32px; border: 2px solid #4e5d43; border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }
.freeze-indicator { position: absolute; top: 68px; right: 18px; display: flex; align-items: center; gap: 6px; padding: 7px 9px; color: var(--warning); background: #2c291fce; border: 1px solid #7a6541; font-size: 10px; border-radius: 5px; .icon { width: 12px; height: 12px; } &.emergency { color: var(--danger); border-color: #764c4c; background: #3c2528ce; } }
@media(max-width:550px) { .viewport { min-height: 390px; }.model-label { left: 20px; top: 69px; h2 { font-size: 27px; span { display: none; } } }.scene-top { left: 16px; }.scene-label { font-size: 7px; }.scene-bottom { left: 12px; right: 12px; }.camera-switch button { padding: 7px 9px; }.scene-help .gait-note { display: none; }:deep(.perception-object-label) { font-size: 8px; > span { font-size: 7px; } } }
</style>
