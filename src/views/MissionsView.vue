<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSimulationStore } from '@/stores/simulation'
import { missionScenes, missions, sceneMissions } from '@/config/missions'
import { missionStatusLabels, type MissionId, type MissionCommand, type MissionSceneId } from '@/types/mission'
import { actions } from '@/config/robots'
import RobotViewport from '@/components/RobotViewport.vue'
import AppIcon from '@/components/AppIcon.vue'

const sim = useSimulationStore(), viewport = ref<InstanceType<typeof RobotViewport>>()
const mission = computed(() => sim.snapshot.mission), definition = computed(() => missions[mission.value.id])
const busy = computed(() => ['running', 'paused'].includes(mission.value.status))
const needsTravel = computed(() => definition.value.steps.some(step => step.kind === 'move'))
const expanded = ref(true), tab = ref<'steps' | 'events'>('steps')
const feed = ref<HTMLElement>()
watch(() => `${mission.value.id}:${mission.value.status}:${mission.value.step}:${tab.value}:${expanded.value}`, async () => {
  await nextTick()
  if (mission.value.status === 'ready' && feed.value) feed.value.scrollTop = 0
  const current = feed.value?.querySelector<HTMLElement>('.current')
  if (current && feed.value) feed.value.scrollTop += current.getBoundingClientRect().top - feed.value.getBoundingClientRect().top - 12
})
async function select(id: MissionId) {
  if (sim.send({ type: 'mission', command: { type: 'select', id } })) {
    sim.select(missions[id].robot); await nextTick(); viewport.value?.fit()
  }
}
function chooseScene(scene: MissionSceneId) { void select(sceneMissions(scene)[0]!.id) }
function send(type: Exclude<MissionCommand['type'], 'select'>) {
  if (sim.send({ type: 'mission', command: { type } }) && type === 'start') viewport.value?.focusRobot()
}
sim.select(definition.value.robot)
void select(mission.value.id)
onBeforeUnmount(() => send('leave'))
</script>

<template>
  <div class="missions" :data-mission-id="mission.id" :data-mission-status="mission.status" :data-mission-step="mission.step" :data-mission-progress="mission.progress" :data-mission-position="JSON.stringify(sim.current.worldPosition)" :data-payload-position="JSON.stringify(mission.payloadPosition)" :data-payload-attached="mission.attached">
    <div class="page-heading"><div><span class="eyebrow">NEXT ROBOTICS / MISSIONS</span><h1>智能任务中心<span>.</span></h1><p>让感知、运动与操作，在真实的三维场景中协同。</p></div><div class="heading-actions"><span class="badge">SIMULATION</span><button class="btn btn-ghost" @click="sim.send({ type: 'pause', value: !sim.snapshot.paused })"><AppIcon :name="sim.snapshot.paused ? 'play' : 'pause'" />{{ sim.snapshot.paused ? '继续仿真' : '暂停仿真' }}</button></div></div>
    <nav class="scene-library" aria-label="任务场景库"><button v-for="scene in missionScenes" :key="scene.id" :data-scene="scene.id" :class="{ active: scene.id === definition.scene }" :aria-pressed="scene.id === definition.scene" :disabled="busy || sim.current.emergency || sim.snapshot.paused" :style="{ '--scene-color': scene.color }" @click="chooseScene(scene.id)"><span>{{ scene.name }}</span><small>{{ scene.caption }}</small></button></nav>
    <div class="mission-workspace" :class="{ collapsed: !expanded }">
      <div class="mission-stage"><RobotViewport ref="viewport" mission /><div class="mission-view-tools"><button class="btn btn-ghost" @click="viewport?.focusRobot()">聚焦机器人</button><button class="btn btn-ghost" @click="viewport?.fit()">全场总览</button><button class="btn btn-ghost" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '折叠任务面板' : '展开任务面板' }}</button><label v-if="needsTravel" class="mission-speed">移动速度<input aria-label="任务移动速度" type="range" min="0" :max="sim.definition.maxSpeed" step="0.1" :value="sim.current.targetSpeed" :disabled="mission.status !== 'ready' || sim.current.emergency || sim.snapshot.paused" @input="sim.send({ type: 'speed', robot: definition.robot, value: Number(($event.target as HTMLInputElement).value) })" /><output class="mono">{{ sim.current.targetSpeed.toFixed(1) }} m/s</output></label></div></div>
      <aside v-show="expanded" class="mission-panel panel" aria-label="任务控制面板">
        <div class="mission-panel-header"><span class="eyebrow">MISSION CONTROL</span><label class="field">选择任务<select aria-label="选择任务" :value="mission.id" :disabled="busy || sim.current.emergency || sim.snapshot.paused" @change="select(($event.target as HTMLSelectElement).value as MissionId)"><option v-for="item in sceneMissions(definition.scene)" :key="item.id" :value="item.id">{{ item.name }} · {{ item.robot === 'quadruped' ? '机器狗' : '人形机器人' }}</option></select></label><p>{{ definition.description }}</p></div>
        <div class="mission-readout"><div><span :class="mission.status" role="status">{{ mission.active ? missionStatusLabels[mission.status] : '尚未就绪' }}</span><strong class="mono">{{ Math.round(mission.progress * 100) }}<small>%</small></strong></div><progress aria-label="任务进度" :value="mission.progress" max="1" /><dl><div><dt>当前动作</dt><dd>{{ actions[sim.current.action].label }}</dd></div><div><dt>执行时间</dt><dd class="mono">{{ mission.elapsed.toFixed(1) }} s</dd></div><div><dt>已完成 / 剩余</dt><dd class="mono">{{ mission.step }} / {{ definition.steps.length - mission.step }}</dd></div><div><dt>位置 X / Z</dt><dd class="mono">{{ sim.current.worldPosition[0].toFixed(2) }} / {{ sim.current.worldPosition[2].toFixed(2) }}</dd></div></dl></div>
        <div class="mission-tabs"><button :class="{ active: tab === 'steps' }" @click="tab = 'steps'">任务步骤</button><button :class="{ active: tab === 'events' }" @click="tab = 'events'">事件记录 <small>{{ mission.events.length }}</small></button></div>
        <div ref="feed" class="mission-feed"><ol v-if="tab === 'steps'" class="mission-steps"><li v-for="(step, index) in definition.steps" :key="index" :class="{ done: index < mission.step, current: index === mission.step && busy }"><b>{{ index < mission.step ? '✓' : String(index + 1).padStart(2, '0') }}</b><span>{{ step.name }}</span><small v-if="index === mission.step && busy">{{ mission.status === 'paused' ? '暂停' : '执行中' }}</small></li></ol><div v-else class="mission-events"><p v-if="!mission.events.length">开始任务后，事件按执行顺序记录。</p><article v-for="event in [...mission.events].reverse()" :key="event.id" :class="event.level"><time class="mono">{{ event.time.toFixed(1) }}s</time><p>{{ event.message }}</p></article></div></div>
        <div class="mission-controls"><div v-if="sim.error" class="mission-error" role="alert"><span>{{ sim.error }}</span><button aria-label="关闭错误提示" @click="sim.error = ''">×</button></div><p v-else-if="!mission.active" class="mission-message">请先解除急停并继续仿真，再点击重置以准备任务。</p><p v-else-if="mission.result" class="mission-result" role="status">{{ mission.result }}</p><p v-else class="mission-message">{{ mission.message }}</p><div class="run-controls"><button class="btn btn-primary" :disabled="!mission.active || mission.status !== 'ready' || sim.current.emergency || sim.snapshot.paused" @click="send('start')"><AppIcon name="play" />开始</button><button class="btn" :disabled="!busy || sim.snapshot.paused || sim.current.emergency" @click="send(mission.status === 'paused' ? 'resume' : 'pause')">{{ mission.status === 'paused' ? '继续' : '暂停' }}</button><button class="btn" :disabled="!busy" @click="send('stop')">停止</button><button class="btn btn-ghost" :disabled="sim.current.emergency || sim.snapshot.paused" @click="send('reset')">重置</button></div><button class="btn btn-danger emergency-control" @click="sim.send({ type: sim.current.emergency ? 'release' : 'emergency', robot: definition.robot })"><AppIcon name="stop" />{{ sim.current.emergency ? '解除急停' : '紧急停止' }}</button></div>
      </aside>
    </div>
    <p class="mission-note">SIMULATION · 场景、异常与人员为预设模拟；识别依据视场和遮挡，抓取为双手运动学约束，地形使用足端 IK。结果不代表真实硬件、物理动力学或 AI 模型能力。退出页面停止当前任务。</p>
  </div>
</template>

<style scoped lang="less">
.page-heading { margin-bottom: 15px; .eyebrow { font-size: 8px; } h1 { margin-top: 6px; span { color: var(--cyan); } } p { font-size: 11px; } }.heading-actions { display: flex; align-items: center; gap: 14px; }
.scene-library { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); margin-bottom: 16px; border-bottom: 1px solid var(--border); button { background: transparent; text-align: left; padding: 12px 12px 14px; border-bottom: 2px solid transparent; span { display: block; font-size: 12px; } small { display: block; margin-top: 7px; color: var(--faint); font-size: 8px; line-height: 1.6; } &.active { border-color: var(--scene-color); background: #ffffff04; span { color: var(--scene-color); } } } }
.mission-workspace { display: grid; grid-template-columns: minmax(0,1fr) 350px; gap: 17px; height: clamp(410px,calc(100dvh - 350px),850px); &.collapsed { grid-template-columns: minmax(0,1fr); } }.mission-stage { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 9px; > :deep(.viewport) { flex: 1; min-height: 0; } }.mission-view-tools { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; .btn { min-height: 30px; padding: 5px 9px; font-size: 10px; } }
.mission-panel { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }.mission-panel-header { padding: 16px 18px 12px; .eyebrow { font-size: 8px; }.field { margin-top: 10px; font-size: 9px; gap: 6px; } select { padding: 8px; font-size: 12px; background: var(--surface-raised); } > p { margin-top: 9px; color: var(--muted); font-size: 10px; line-height: 1.7; } }
.mission-readout { padding: 0 18px 12px; > div { display: flex; justify-content: space-between; align-items: baseline; > span { font-size: 10px; color: var(--muted); &.running { color: var(--cyan); } &.succeeded { color: var(--success); } &.failed { color: var(--warning); } } strong { font-size: 22px; font-weight: 400; small { font-size: 10px; margin-left: 4px; } } } progress { width: 100%; height: 4px; accent-color: var(--cyan); border: none; margin: 9px 0; } dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; > div { display: flex; justify-content: space-between; gap: 5px; font-size: 9px; } dt { color: var(--faint); } dd { margin: 0; } } }
.mission-tabs { display: flex; gap: 18px; padding: 0 18px; border-block: 1px solid var(--border); button { background: transparent; color: var(--muted); padding: 11px 0; font-size: 10px; border-bottom: 1px solid transparent; &.active { color: var(--cyan); border-color: var(--cyan); } small { font-size: 8px; margin-left: 4px; } } }
.mission-feed { flex: 1; min-height: 55px; overflow-y: auto; padding: 12px 18px; }.mission-steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 11px; li { display: flex; align-items: center; gap: 9px; color: var(--faint); font-size: 10px; b { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border); display: grid; place-items: center; font-size: 9px; font-weight: 400; flex-shrink: 0; } small { margin-left: auto; font-size: 8px; } &.current { color: var(--cyan); b { border-color: var(--cyan); } } &.done { color: var(--success); } } }.mission-events { color: var(--muted); font-size: 10px; line-height: 1.7; article { display: flex; gap: 9px; padding: 7px 0; border-bottom: 1px solid #ffffff06; time { font-size: 8px; min-width: 35px; color: var(--faint); } &.warning p { color: var(--warning); } } }
.mission-controls { border-top: 1px solid var(--border); padding: 11px 16px 13px; }.mission-message,.mission-result { font-size: 10px; line-height: 1.6; color: var(--muted); margin-bottom: 10px; }.mission-result { color: var(--success); }.run-controls { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; .btn { padding: 6px; font-size: 10px; min-height: 32px; gap: 4px; .icon { width: 12px; } } }.emergency-control { width: 100%; margin-top: 8px; min-height: 32px; font-size: 10px; }.mission-note { color: var(--faint); font-size: 9px; line-height: 1.8; margin-top: 13px; }.mission-error { display: flex; align-items: start; gap: 8px; max-height: 36px; overflow-y: auto; margin-bottom: 10px; color: var(--warning); font-size: 10px; line-height: 1.6; > span { flex: 1; } button { background: transparent; color: inherit; flex-shrink: 0; } }
.mission-speed { display: flex; align-items: center; gap: 6px; font-size: 9px; color: var(--muted); input { width: 70px; } output { min-width: 48px; } }
@media(max-height:800px) and (min-width:901px) { .mission-panel-header { padding: 12px 14px 9px; > .eyebrow { display: none; } .field { margin-top: 0; } > p { font-size: 9px; } }.mission-readout { padding: 0 14px 9px; }.mission-controls { padding: 9px 12px; }.mission-workspace { height: clamp(360px,calc(100dvh - 346px),650px); } }
@media(max-height:740px) and (min-width:901px) { .mission-panel-header > p { display: none; }.mission-readout { padding-bottom: 4px; }.mission-feed { min-height: 36px; padding-block: 6px; } }
@media(max-width:1100px) { .mission-workspace { grid-template-columns: minmax(0,1fr) 315px; gap: 12px; }.scene-library button { padding-inline: 8px; small { font-size: 7px; } } }
@media(max-width:900px) { .scene-library { grid-template-columns: repeat(3,minmax(0,1fr)); }.mission-workspace { display: flex; flex-direction: column; height: auto; }.mission-stage { height: 470px; }.mission-panel { height: 620px; }.run-controls .btn,.emergency-control { min-height: 40px; } }
@media(max-width:550px) { .page-heading { gap: 12px; }.heading-actions { width: 100%; justify-content: space-between; }.scene-library button { padding: 10px 6px; span { font-size: 11px; } small { font-size: 7px; } }.mission-stage { height: 430px; }.mission-view-tools { gap: 5px; .btn { font-size: 9px; min-height: 36px; padding-inline: 8px; } }.mission-note { font-size: 8px; } }
</style>
