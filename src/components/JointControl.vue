<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { joints, endEffectors } from '@/config/joints'
import { forwardEndEffector } from '@/simulation/kinematics'
import { useSimulationStore } from '@/stores/simulation'
import type { Vector3Tuple } from '@/types/robot'
const props = defineProps<{ mode: 'joint' | 'ik'; locked: boolean }>()
const sim = useSimulationStore()
const jointId = ref(''), effectorId = ref('')
const target = ref<Vector3Tuple>([0, -.6, 0])
const catalog = computed(() => joints[sim.selectedId])
const groups = computed(() => [...new Set(catalog.value.map(joint => joint.group))])
const selectedIndex = computed(() => catalog.value.findIndex(joint => joint.id === jointId.value))
const selectedJoint = computed(() => catalog.value[selectedIndex.value])
const effectors = computed(() => endEffectors[sim.selectedId].filter(effector => sim.selectedId === 'quadruped' ? effector.kind === 'foot' : effector.kind === 'hand'))
const effector = computed(() => effectors.value.find(item => item.id === effectorId.value))
const actual = computed(() => effector.value ? forwardEndEffector(sim.selectedId, sim.current, effector.value) : [0, 0, 0])
const degrees = (value: number) => value * 180 / Math.PI
const targetAngle = computed(() => degrees(sim.current.jointTargets?.[selectedIndex.value] ?? sim.current.joints[selectedIndex.value] ?? 0))
watch(() => sim.selectedId, () => { jointId.value = catalog.value[0]!.id; effectorId.value = effectors.value.at(-1)!.id }, { immediate: true })
function initializeTarget() {
  const saved = sim.current.ikTarget
  target.value = saved?.effector === effectorId.value ? [...saved.position] : effector.value?.kind === 'hand' ? [.32, -.4, effector.value.side * .12] : [.0, -.6, 0]
}
watch([effectorId, () => props.mode], initializeTarget, { immediate: true })
function jointInput(event: Event) {
  const definition = selectedJoint.value!
  sim.send({ type: 'joint', robot: sim.selectedId, joint: definition.id, value: Number((event.target as HTMLInputElement).value) * Math.PI / 180 })
}
function applyTarget() {
  sim.send({ type: 'ik', robot: sim.selectedId, effector: effectorId.value, position: [...target.value] }, `末端 IK：${effector.value?.name} → (${target.value.map(value => value.toFixed(2)).join(', ')}) m`)
}
</script>

<template>
  <div class="joint-control">
    <template v-if="mode === 'joint' && selectedJoint">
      <label for="joint-select" class="section-label">选择独立关节<span>{{ catalog.length }} AXES</span></label>
      <select id="joint-select" v-model="jointId" :disabled="locked">
        <optgroup v-for="group in groups" :key="group" :label="group"><option v-for="joint in catalog.filter(item => item.group === group)" :key="joint.id" :value="joint.id">{{ joint.name }}</option></optgroup>
      </select>
      <div class="joint-reading"><label for="joint-slider">目标角度</label><strong class="mono">{{ targetAngle.toFixed(1) }}<small>°</small></strong></div>
      <input id="joint-slider" :value="targetAngle" type="range" :min="degrees(selectedJoint.min)" :max="degrees(selectedJoint.max)" step="0.5" :disabled="locked" @input="jointInput" @change="sim.log(`调节关节：${selectedJoint.name}`)">
      <div class="range-labels mono"><span>{{ degrees(selectedJoint.min).toFixed(0) }}°</span><span>{{ degrees(selectedJoint.max).toFixed(0) }}°</span></div>
      <div class="actual-angle"><span>当前角度</span><output class="mono" data-joint-angle>{{ degrees(sim.current.joints[selectedIndex]!).toFixed(1) }}°</output><span>{{ selectedJoint.axis.toUpperCase() }} 轴</span></div>
      <small class="joint-id mono" :title="selectedJoint.path">{{ selectedJoint.id }}</small>
    </template>
    <form v-else-if="mode === 'ik'" @submit.prevent="applyTarget">
      <label for="effector-select" class="section-label">末端位置控制<span>{{ sim.selectedId === 'quadruped' ? 'FOOT IK' : 'ARM IK' }}</span></label>
      <select id="effector-select" v-model="effectorId" :disabled="locked"><option v-for="item in effectors" :key="item.id" :value="item.id">{{ item.name }}</option></select>
      <div class="ik-fields"><label v-for="(axis, index) in ['X · 前后', 'Y · 高度', 'Z · 左右']" :key="axis" :for="`ik-${index}`">{{ axis }}<input :id="`ik-${index}`" v-model.number="target[index]" :aria-label="`末端目标 ${['X', 'Y', 'Z'][index]}`" type="number" step="0.01" min="-1" max="1" required :disabled="locked || (effector?.kind === 'foot' && index === 2)"></label></div>
      <button class="btn btn-primary ik-apply" type="submit" :disabled="locked">移动至目标</button>
      <div class="ik-actual"><span>当前末端 · m</span><output class="mono" data-ik-position>{{ actual.map(value => value.toFixed(3)).join(' / ') }}</output></div>
      <p class="control-note">以所选{{ effector?.kind === 'foot' ? '髋' : '肩' }}关节为原点，单位 m。{{ effector?.kind === 'foot' ? '足端在 X/Y 平面内运动。' : '三轴定位掌心。' }}超出工作空间的目标会明确提示。</p>
    </form>
    <p class="control-note">腿部与足端实验会抬高机身留出运动空间。点击「恢复站姿」返回支撑姿态。</p>
    <button class="btn btn-ghost restore-pose" :disabled="locked" @click="sim.send({ type: 'stop', robot: sim.selectedId }, '恢复全部默认关节姿态')">恢复站姿</button>
  </div>
</template>

<style scoped lang="less">
.joint-control { color: var(--muted); font-size: 11px; }
.section-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; > span { font-size: 8px; color: var(--cyan); letter-spacing: .5px; } }
select { width: 100%; min-height: 36px; background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 7px; font-size: 11px; }
.joint-reading { display: flex; justify-content: space-between; align-items: center; margin: 17px 0; strong { color: var(--cyan); font-size: 20px; font-weight: 400; small { font-size: 11px; margin-left: 4px; } } }
.range-labels { display: flex; justify-content: space-between; font-size: 9px; margin-top: 10px; }
.actual-angle { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 16px 0 8px; output { color: var(--text); font-size: 14px; } > span:last-child { font-size: 9px; } }
.joint-id { display: block; color: var(--faint); font-size: 9px; }
.control-note { font-size: 10px; line-height: 1.8; color: var(--muted); margin-top: 14px; }
.restore-pose, .ik-apply { width: 100%; margin-top: 14px; min-height: 36px; font-size: 11px; }
.ik-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 15px; label { font-size: 9px; } input { margin-top: 8px; width: 100%; min-height: 35px; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: 5px; padding: 6px; font-size: 11px; &:disabled { opacity: .45; } } }
.ik-actual { display: grid; gap: 8px; margin-top: 15px; font-size: 10px; output { color: var(--success); font-size: 11px; } }
@media(max-width:700px) { select,.restore-pose,.ik-apply,.ik-fields input { min-height: 44px; } }
</style>
