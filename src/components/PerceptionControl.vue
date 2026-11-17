<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { categories, destinations, robotClearance } from '@/config/perception'
import type { PerceptionCommand, PerceptionSettings } from '@/config/perception'
import AppIcon from './AppIcon.vue'

const sim = useSimulationStore(), p = computed(() => sim.snapshot.perception)
const emit = defineEmits<{ focus: [] }>()
const tab = ref<'sensors' | 'route'>('sensors'), goalX = ref(4.5), goalZ = ref(0), details = ref<HTMLElement>()
const selected = computed(() => p.value.detections.find(object => object.id === p.value.selectedObject))
const recognized = computed(() => p.value.detections.filter(object => object.status === 'detected').length)
const selectedDestination = computed(() => destinations.findIndex(item => item.position[0] === p.value.route.goal[0] && item.position[2] === p.value.route.goal[2]))
const routeNames = { idle: '等待规划', planned: '路线就绪', running: '正在移动', paused: '路线暂停', arrived: '抵达终点', blocked: '终点不可达', stopped: '路线停止' }
const detectionNames = { detected: '已识别', occluded: '被遮挡', 'out-of-view': '视场外', 'out-of-range': '量程外' }
const progress = computed(() => p.value.route.status === 'arrived' ? 100 : p.value.route.length ? Math.min(100, p.value.route.travelled / p.value.route.length * 100) : 0)
function command(instruction: PerceptionCommand, message?: string) { return sim.send({ type: 'perception', command: instruction }, message) }
function settings(values: Partial<PerceptionSettings>) { command({ type: 'settings', values }) }
function selectDestination(event: Event) { const destination = destinations[Number((event.target as HTMLSelectElement).value)]; if (destination) command({ type: 'goal', position: [...destination.position] }, `规划至${destination.name}`) }
watch(() => p.value.mode, mode => { if (mode === 'path') tab.value = 'route' }, { immediate: true })
watch(() => p.value.route.goal.join(','), () => { goalX.value = p.value.route.goal[0]; goalZ.value = p.value.route.goal[2] }, { immediate: true })
watch(() => p.value.selectedObject, async id => { if (id && tab.value === 'sensors') { await nextTick(); details.value?.scrollIntoView({ block: 'nearest' }) } })
</script>

<template>
  <aside class="perception-control panel">
    <div class="control-heading"><div><div class="eyebrow">SENSING & NAVIGATION</div><h2>感知控制台</h2></div><span class="badge">SIMULATION</span></div>
    <div class="control-tabs segmented" aria-label="感知控制面板"><button :class="{ active: tab === 'sensors' }" :aria-pressed="tab === 'sensors'" @click="tab = 'sensors'"><AppIcon name="radar" />传感器</button><button :class="{ active: tab === 'route' }" :aria-pressed="tab === 'route'" @click="tab = 'route'"><AppIcon name="route" />路线执行</button></div>
    <div class="control-body">
      <template v-if="tab === 'sensors'">
        <div class="section-heading"><h3>360° 激光雷达</h3><span>{{ p.scanning ? '扫描开启' : '扫描暂停' }}</span></div>
        <div class="scan-actions"><button class="btn btn-primary" :disabled="sim.current.emergency" @click="settings({ scanning: !p.scanning })"><AppIcon :name="p.scanning ? 'pause' : 'play'" />{{ p.scanning ? '暂停扫描' : '继续扫描' }}</button><button class="btn btn-ghost" @click="command({ type: 'clear' }, '已清除点云与扫描历史')"><AppIcon name="reset" />清除点云</button></div>
        <label class="range-field"><span>扫描速度<output class="mono">{{ p.scanSpeed.toFixed(1) }} 圈 / s</output></span><input aria-label="扫描速度" type="range" min="0.1" max="2" step="0.1" :value="p.scanSpeed" @input="settings({ scanSpeed: Number(($event.target as HTMLInputElement).value) })" /><small>慢速观察扫描过程，快速补全环境点云。</small></label>
        <label class="range-field"><span>扫描距离<output class="mono">{{ p.range.toFixed(0) }} m</output></span><input aria-label="扫描距离" type="range" min="3" max="14" step="1" :value="p.range" @input="settings({ range: Number(($event.target as HTMLInputElement).value) })" /></label>
        <div class="check-options"><label><input type="checkbox" :checked="p.showPoints" @change="settings({ showPoints: !p.showPoints })" />显示点云</label><label><input type="checkbox" :checked="p.showBeams" @change="settings({ showBeams: !p.showBeams })" />扫描光束</label><label><input type="checkbox" :checked="p.showContours" @change="settings({ showContours: !p.showContours })" />障碍物轮廓</label></div>
        <div class="color-options"><span>点云颜色</span><div class="segmented" aria-label="点云颜色"><button :class="{ active: p.pointColor === 'class' }" :aria-pressed="p.pointColor === 'class'" @click="settings({ pointColor: 'class' })">类别</button><button :class="{ active: p.pointColor === 'distance' }" :aria-pressed="p.pointColor === 'distance'" @click="settings({ pointColor: 'distance' })">距离热力图</button></div></div>
        <label class="field history-field">扫描历史<select aria-label="扫描历史" :value="p.historyId ?? ''" @change="command({ type: 'history', id: ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value) })"><option value="">实时点云 · {{ p.points.length }} 点</option><option v-for="frame in p.history" :key="frame.id" :value="frame.id">扫描 #{{ frame.id }} · {{ frame.time.toFixed(1) }} s · {{ frame.points.length }} 点</option></select><small>保留最近五圈。回看会暂停扫描和正在执行的路线。</small></label>
        <div class="direction-actions"><span>摄像头朝向 {{ sim.current.heading.toFixed(0) }}°</span><button class="btn btn-ghost" aria-label="向左转向45度" :disabled="sim.snapshot.paused || sim.current.emergency || p.route.status === 'running'" @click="sim.send({ type: 'turn', robot: sim.selectedId, degrees: -45 }, '调整感知朝向：左转 45°')"><AppIcon name="turnLeft" /></button><button class="btn btn-ghost" aria-label="向右转向45度" :disabled="sim.snapshot.paused || sim.current.emergency || p.route.status === 'running'" @click="sim.send({ type: 'turn', robot: sim.selectedId, degrees: 45 }, '调整感知朝向：右转 45°')"><AppIcon name="turnRight" /></button></div>
        <div class="section-heading object-heading"><h3>环境对象</h3><span>{{ recognized }} / {{ p.detections.length }} 已识别</span></div>
        <div class="object-list"><button v-for="object in p.detections" :key="object.id" :data-object="object.id" :class="{ selected: p.selectedObject === object.id }" :aria-pressed="p.selectedObject === object.id" @click="command({ type: 'select', id: object.id })"><i :style="{ background: categories[object.category].color }" /><span><strong>{{ object.name }}</strong><small>{{ categories[object.category].name }} · {{ detectionNames[object.status] }}</small></span><b class="mono">{{ object.distance.toFixed(2) }}<small>m</small></b></button></div>
        <section v-if="selected" ref="details" class="object-details" :data-object-detail="selected.id"><div class="section-heading"><h3>{{ selected.name }}</h3><button class="icon-btn" aria-label="取消目标选择" @click="command({ type: 'select', id: null })"><AppIcon name="close" /></button></div><dl><div><dt>识别状态</dt><dd>{{ detectionNames[selected.status] }}</dd></div><div><dt>置信度</dt><dd>{{ selected.status === 'detected' ? `${(selected.confidence * 100).toFixed(0)}%` : '—' }}</dd></div><div><dt>距离</dt><dd class="mono">{{ selected.distance.toFixed(2) }} m</dd></div><div><dt>相对方位角</dt><dd class="mono">{{ selected.bearing.toFixed(1) }}°</dd></div></dl><button class="btn btn-ghost" @click="emit('focus')"><AppIcon name="target" />局部放大</button></section>
      </template>
      <template v-else>
        <div class="section-heading"><h3>几何避障导航</h3><span :class="{ warning: p.route.status === 'blocked' }">{{ routeNames[p.route.status] }}</span></div>
        <p class="route-hint">在路径视图点击空闲地面选择终点，或输入坐标规划。机器人会沿绿色路线移动。</p>
        <label class="field destination-field">快速终点<select aria-label="快速终点" :value="selectedDestination" @change="selectDestination"><option v-if="selectedDestination < 0" value="-1">自定义地面终点</option><option v-for="(destination, i) in destinations" :key="destination.name" :value="i">{{ destination.name }}</option></select></label>
        <form class="goal-form" @submit.prevent="command({ type: 'goal', position: [Number(goalX), 0, Number(goalZ)] }, '已按输入坐标规划路线')"><label class="field">X / m<input v-model="goalX" aria-label="终点X坐标" type="number" step="any" required /></label><label class="field">Z / m<input v-model="goalZ" aria-label="终点Z坐标" type="number" step="any" required /></label><button class="btn btn-ghost" type="submit"><AppIcon name="route" />规划路线</button></form>
        <div class="route-progress"><div><span>{{ routeNames[p.route.status] }}</span><output class="mono">{{ progress.toFixed(0) }}%</output></div><progress :value="progress" max="100" aria-label="路线进度" /><p role="status" :class="{ warning: p.route.status === 'blocked' }">{{ p.route.message }}</p></div>
        <dl class="route-stats"><div><dt>规划总距离</dt><dd class="mono">{{ p.route.length.toFixed(2) }} m</dd></div><div><dt>已行进距离</dt><dd class="mono">{{ p.route.travelled.toFixed(2) }} m</dd></div><div><dt>当前位置</dt><dd class="mono">{{ p.position[0].toFixed(2) }}, {{ p.position[2].toFixed(2) }}</dd></div><div><dt>占地安全半径</dt><dd class="mono">{{ robotClearance[sim.selectedId].toFixed(2) }} m</dd></div></dl>
        <label class="range-field"><span>移动速度<output class="mono">{{ sim.current.targetSpeed.toFixed(1) }} m / s</output></span><input aria-label="导航移动速度" type="range" min="0" :max="sim.definition.maxSpeed" step="0.1" :value="sim.current.targetSpeed" :disabled="sim.snapshot.paused || sim.current.emergency" @input="sim.send({ type: 'speed', robot: sim.selectedId, value: Number(($event.target as HTMLInputElement).value) })" /></label>
        <div class="route-actions"><button class="btn btn-primary" :disabled="!p.route.path.length || p.route.status === 'running' || sim.snapshot.paused || sim.current.emergency" @click="command({ type: 'route', action: 'start' }, p.route.status === 'paused' ? '继续执行感知路线' : '开始执行感知路线')"><AppIcon name="play" />{{ p.route.status === 'paused' ? '继续路线' : '开始移动' }}</button><button class="btn btn-ghost" :disabled="p.route.status !== 'running'" @click="command({ type: 'route', action: 'pause' }, '感知路线已暂停')"><AppIcon name="pause" />暂停路线</button><button class="btn btn-ghost" :disabled="!['running', 'paused'].includes(p.route.status)" @click="command({ type: 'route', action: 'stop' }, '感知路线已停止')"><AppIcon name="stop" />停止路线</button><button class="btn btn-ghost" :disabled="sim.current.emergency" @click="command({ type: 'route', action: 'reset' }, '感知训练场已回到起点')"><AppIcon name="reset" />重置起点</button></div>
        <button class="btn btn-ghost obstacle-action" :disabled="sim.current.emergency" @click="command({ type: 'obstacle' }, '已移动箱体并重新检查避障路线')"><AppIcon name="cube" />移动箱体至{{ p.obstacleSide === 1 ? '北' : '南' }}侧</button>
        <p class="route-hint">粉红色区域禁止通行。移动箱体会检查当前位置并重新规划，{{ p.route.replans }} 次重规划。</p>
      </template>
    </div>
    <div class="control-footer"><span>{{ sim.definition.name }} · {{ sim.status }}</span><button class="btn btn-danger" @click="sim.send({ type: sim.current.emergency ? 'release' : 'emergency', robot: sim.selectedId }, sim.current.emergency ? '解除感知机器人急停' : '感知机器人紧急停止')"><AppIcon :name="sim.current.emergency ? 'shield' : 'stop'" />{{ sim.current.emergency ? '解除急停' : '紧急停止' }}</button></div>
  </aside>
</template>

<style scoped lang="less">
.perception-control { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.control-heading { display: flex; justify-content: space-between; align-items: center; padding: 19px 18px 16px; .eyebrow { font-size: 8px; letter-spacing: 1.2px; } h2 { margin-top: 8px; } .badge { font-size: 8px; } }
.control-tabs { margin: 0 18px 14px; button { flex: 1; display: flex; justify-content: center; align-items: center; gap: 7px; font-size: 11px; .icon { width: 14px; height: 14px; } } }
.control-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 18px 20px; }
.section-heading { display: flex; gap: 9px; align-items: center; justify-content: space-between; h3 { font-size: 11px; font-weight: 500; } > span { font-size: 9px; color: var(--accent); } }
.scan-actions { display: flex; gap: 8px; margin: 14px 0 19px; .btn { flex: 1; font-size: 10px; padding: 7px; .icon { width: 13px; } } }
.range-field { display: grid; gap: 11px; margin-bottom: 21px; > span { display: flex; justify-content: space-between; color: var(--muted); font-size: 10px; } output { color: var(--text); font-size: 10px; } small { font-size: 9px; color: var(--faint); line-height: 1.6; } }
.check-options { display: flex; gap: 9px; flex-wrap: wrap; margin: 3px 0 17px; label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--muted); } input { accent-color: var(--accent); margin: 0; } }
.color-options { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 20px; > span { color: var(--muted); font-size: 10px; } .segmented button { font-size: 9px; padding: 6px 8px; } }
.history-field,.destination-field { font-size: 10px; margin-bottom: 18px; select { padding: 9px; font-size: 10px; background: var(--surface-raised); } small { font-size: 9px; color: var(--faint); line-height: 1.7; } }
.direction-actions { display: flex; gap: 7px; align-items: center; margin: 14px 0 23px; > span { flex: 1; font-size: 10px; color: var(--muted); } .btn { padding: 6px 9px; min-height: 30px; .icon { width: 13px; height: 13px; } } }
.object-heading { padding-top: 18px; border-top: 1px solid var(--border); }
.object-list { margin-top: 10px; display: grid; gap: 3px; > button { display: flex; align-items: center; gap: 9px; text-align: left; background: transparent; padding: 10px 8px; border: 1px solid transparent; border-radius: 6px; &:hover,&.selected { background: var(--accent-dim); border-color: #1c526d; } > i { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; } > span { flex: 1; min-width: 0; strong { font-weight: 400; font-size: 10px; } small { display: block; margin-top: 5px; color: var(--faint); font-size: 8px; } } > b { font-weight: 400; font-size: 11px; small { font-size: 8px; color: var(--faint); margin-left: 4px; } } } }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; dt { color: var(--faint); font-size: 9px; margin-bottom: 7px; } dd { margin: 0; font-size: 11px; } }
.object-details { margin-top: 16px; padding-top: 17px; border-top: 1px solid var(--border); .icon-btn { width: 25px; height: 25px; .icon { width: 12px; } } > .btn { width: 100%; font-size: 10px; } }
.route-hint { font-size: 10px; color: var(--faint); line-height: 1.8; margin: 12px 0 18px; }
.goal-form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; .field { font-size: 10px; input { padding: 8px; font-size: 11px; background: var(--surface-raised); } } > .btn { grid-column: 1 / -1; font-size: 10px; } }
.route-progress { margin: 21px 0; > div { display: flex; justify-content: space-between; font-size: 11px; } progress { width: 100%; height: 4px; accent-color: var(--success); margin: 12px 0 8px; } > p { font-size: 10px; color: var(--muted); line-height: 1.7; } }
.route-stats { padding: 0 0 20px; border-bottom: 1px solid var(--border); margin-bottom: 21px; }
.route-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; .btn { font-size: 10px; padding: 8px; .icon { width: 13px; } } }
.obstacle-action { width: 100%; margin-top: 16px; font-size: 10px; }
.warning { color: var(--warning) !important; }
.control-footer { border-top: 1px solid var(--border); padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; > span { font-size: 9px; color: var(--faint); } .btn { min-height: 33px; font-size: 10px; padding: 7px 10px; .icon { width: 13px; } } }
@media(max-width:800px) { .perception-control { height: 650px; }.scan-actions .btn,.route-actions .btn,.obstacle-action,.direction-actions .btn,.control-tabs button,.control-footer .btn { min-height: 40px; }.check-options label { min-height: 32px; }.object-list > button { min-height: 48px; } }
</style>
