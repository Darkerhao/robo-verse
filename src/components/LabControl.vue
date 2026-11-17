<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useLabStore } from '@/stores/lab'
import { useSimulationStore } from '@/stores/simulation'
import { disassemblySteps, partKinds } from '@/config/lab'
import { joints } from '@/config/joints'
import AppIcon from './AppIcon.vue'
const lab = useLabStore(), sim = useSimulationStore()
const emit = defineEmits<{ fit: []; focus: []; joint: [id: string] }>()
const query = ref('')
const body = ref<HTMLElement>(), detail = ref<HTMLElement>()
const steps = computed(() => disassemblySteps[sim.selectedId])
const filtered = computed(() => lab.parts.filter(item => `${item.name} ${item.englishName} ${item.id}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const locked = computed(() => sim.snapshot.paused || sim.current.emergency)
const paused = computed(() => lab.playback === 'paused' || lab.playback === 'restore-paused')
const playing = computed(() => lab.playback === 'disassembling' || lab.playback === 'restoring')
const playbackLabel = computed(() => locked.value ? '仿真已冻结' : paused.value ? '已暂停' : lab.playback === 'restoring' ? '正在恢复装配' : playing.value ? '正在顺序拆解' : lab.state.progress === 10 ? '拆解完成' : lab.state.progress === 0 ? '完整装配' : '手动进度')
const related = computed(() => lab.selected?.jointIndices.map(index => ({ index, definition: joints[sim.selectedId][index]! })) ?? [])
function seek(value: number) { lab.seek(value); emit('fit') }
function start() { lab.start(); emit('fit'); sim.log('实验室：开始十步顺序拆解') }
function restore() { lab.restore(); emit('fit'); sim.log('实验室：恢复原始装配位置') }
watch(() => lab.state.selectedPartId, async id => {
  await nextTick()
  if (!body.value) return
  if (!id) body.value.scrollTop = 0
  else if (detail.value) body.value.scrollTop += detail.value.getBoundingClientRect().top - body.value.getBoundingClientRect().top - 8
}, { immediate: true })
</script>

<template>
  <aside class="lab-control panel">
    <div class="lab-control-heading"><h2>结构探索</h2><span class="badge mono">{{ lab.parts.length }} PARTS</span></div>
    <div class="disassembly-control">
      <div class="progress-reading"><span role="status">{{ playbackLabel }}</span><output class="mono" data-disassembly-progress>{{ (lab.state.progress * 10).toFixed(0) }}<small>%</small></output></div>
      <input id="disassembly-progress" aria-label="拆解进度" :value="lab.state.progress" type="range" min="0" max="10" step="0.01" :disabled="locked" @input="seek(Number(($event.target as HTMLInputElement).value))">
      <div class="disassembly-buttons"><button class="btn btn-primary" :disabled="locked || playing || paused" @click="start"><AppIcon name="play" />{{ lab.state.progress === 10 ? '重新拆解' : '开始拆解' }}</button><button class="btn" :disabled="locked || (!playing && !paused)" @click="lab.togglePlayback()"><AppIcon :name="paused ? 'play' : 'pause'" />{{ paused ? '继续' : '暂停' }}</button><button class="btn btn-ghost" :disabled="locked || (lab.state.progress === 0 && !lab.state.hidden.length)" @click="restore"><AppIcon name="reset" />恢复原状</button></div>
    </div>
    <div ref="body" class="lab-control-body">
      <section class="display-modes"><h3>全息观察</h3><div class="mode-switches"><label><input v-model="lab.state.transparent" type="checkbox" aria-label="外壳透明">外壳透明</label><label><input v-model="lab.state.skeleton" type="checkbox" aria-label="显示骨骼">机械骨骼</label><label><input v-model="lab.state.axes" type="checkbox" aria-label="显示关节轴">关节轴</label></div><label class="highlight-field" for="highlight-system">系统高亮<select id="highlight-system" v-model="lab.state.highlight"><option value="none">无</option><option value="sensor">感知模块</option><option value="joint">关节机构</option><option value="power">电池系统</option><option value="controller">控制器</option></select></label><p class="lab-note">透明外壳支持点击穿透。骨骼连线和局部坐标轴随真实机械节点更新。</p><p v-if="lab.state.axes" class="axis-legend"><i class="x" />X <i class="y" />Y <i class="z" />Z <span>橙色弧线：关节范围与正向旋转</span></p></section>
      <section class="parts-section"><div class="section-heading"><h3>部件目录</h3><button v-if="lab.state.hidden.length" @click="lab.state.hidden = []">显示全部</button></div><input v-model="query" class="part-search" type="search" placeholder="搜索部件名称或编号" aria-label="搜索部件"><select id="part-select" aria-label="选择部件" :value="lab.state.selectedPartId ?? ''" @change="lab.select(($event.target as HTMLSelectElement).value || null)"><option value="">从模型拾取或选择部件</option><optgroup v-for="(step, index) in steps" :key="step" :label="`${String(index + 1).padStart(2, '0')} · ${step}`"><option v-for="part in filtered.filter(item => item.step === index + 1)" :key="part.id" :value="part.id">{{ lab.visible(part.id) ? '' : '[隐藏] ' }}{{ part.name }}</option></optgroup></select><p v-if="!filtered.length" class="lab-note" role="status">没有匹配的部件。</p></section>
      <section v-if="lab.selected" ref="detail" class="part-detail" :data-selected-part="lab.selected.id">
        <div class="section-heading"><span class="badge">{{ partKinds[lab.selected.kind].name }}</span><button aria-label="取消部件选择" @click="lab.select(null)"><AppIcon name="close" /></button></div><h3>{{ lab.selected.name }}</h3><p class="part-english">{{ lab.selected.englishName }}</p><code class="part-code" :title="lab.selected.id">{{ lab.selected.id }}</code><p class="part-description">{{ lab.selected.description }}</p>
        <dl class="part-facts"><div><dt>装配层级</dt><dd>{{ lab.selected.id.split('/').length - 1 }} 级</dd></div><div><dt>拆解顺序</dt><dd>{{ lab.selected.step }} / 10</dd></div><div><dt>独立自由度</dt><dd>{{ lab.selected.axes?.length ?? 0 }} 轴</dd></div><div><dt>部件状态</dt><dd>{{ lab.visible(lab.selected.id) ? '可见' : '已隐藏' }}</dd></div></dl>
        <div v-if="related.length" class="part-joints"><div v-for="joint in related" :key="joint.definition.id"><span>{{ joint.definition.name }} · {{ joint.definition.axis.toUpperCase() }} 轴</span><strong class="mono">{{ (sim.current.joints[joint.index]! * 180 / Math.PI).toFixed(1) }}°</strong><small>范围 {{ (joint.definition.min * 180 / Math.PI).toFixed(0) }}° ～ {{ (joint.definition.max * 180 / Math.PI).toFixed(0) }}°</small></div><button class="btn btn-ghost" :disabled="locked" @click="lab.state.axes = true; emit('joint', related[0]!.definition.id)">调节此关节</button></div>
        <div class="part-live"><span>系统电机温度 <b class="mono">{{ sim.current.temperature.toFixed(1) }} °C</b></span><span>系统驱动功率 <b class="mono">{{ sim.current.power.toFixed(1) }} W</b></span><small>SIMULATION · 统一系统参数</small></div>
        <div class="part-buttons"><button class="btn" :disabled="!lab.visible(lab.selected.id)" @click="emit('focus')"><AppIcon name="target" />聚焦部件</button><button class="btn" @click="lab.visible(lab.selected.id) ? lab.hide(lab.selected.id) : lab.show(lab.selected.id)">{{ lab.visible(lab.selected.id) ? '隐藏部件' : '显示部件' }}</button></div>
      </section>
      <p v-else class="selection-hint">悬停识别部件，点击锁定并聚焦。选择内部电池、控制器或框架时会开启外壳透明。</p>
      <section class="disassembly-sequence"><h3>十步拆解顺序</h3><ol><li v-for="(step, index) in steps" :key="step" :class="{ complete: lab.state.progress >= index + 1, current: lab.state.progress > index && lab.state.progress < index + 1 }"><button :data-disassembly-step="index + 1" :disabled="locked" @click="seek(index + 1)"><span class="mono">{{ String(index + 1).padStart(2, '0') }}</span>{{ step }}<span v-if="lab.state.progress >= index + 1" class="step-check">✓</span></button></li></ol></section>
    </div>
    <div class="lab-control-footer"><button class="btn btn-ghost" @click="lab.reset(); emit('fit')">重置实验室</button><span>仅重置结构与观察设置</span></div>
  </aside>
</template>

<style scoped lang="less">
.lab-control { height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 18px 18px 0; overflow: hidden; }
.lab-control-heading,.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; h2 { font-size: 13px; }.badge { font-size: 9px; } button { color: var(--cyan); background: transparent; font-size: 10px; padding: 6px; } }
.disassembly-control { padding: 16px 0 18px; border-bottom: 1px solid var(--border); }.progress-reading { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 10px; margin-bottom: 15px; output { color: var(--cyan); font-size: 23px; small { font-size: 10px; margin-left: 4px; } } }#disassembly-progress { height: 12px; }
.disassembly-buttons { display: flex; gap: 5px; margin-top: 12px; .btn { padding: 7px 8px; font-size: 10px; min-height: 34px; flex: 1; gap: 4px; .icon { width: 12px; height: 12px; } } }
.lab-control-body { min-height: 0; flex: 1; overflow-y: auto; padding: 0 5px 18px 0; scrollbar-gutter: stable; section { margin-top: 20px; } h3 { font-size: 11px; font-weight: 500; } }
.mode-switches { display: flex; flex-wrap: wrap; gap: 12px; margin: 15px 0; label { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--muted); } input { accent-color: var(--accent); } }
.highlight-field { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: var(--muted); select { width: 65%; } }
select,.part-search { min-height: 36px; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 7px 8px; font-size: 11px; min-width: 0; }
.lab-note,.selection-hint { font-size: 10px; color: var(--muted); line-height: 1.8; margin-top: 12px; }.selection-hint { padding: 13px 10px; background: var(--accent-dim); border-left: 2px solid var(--accent); }
.axis-legend { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 9px; color: var(--muted); margin-top: 10px; i { width: 5px; height: 5px; border-radius: 50%; }.x { background: #f66; }.y { background: #6f6; }.z { background: #69f; } span { width: 100%; margin-top: 4px; } }
.part-search,#part-select { width: 100%; margin-top: 10px; }.part-detail { border-top: 1px solid var(--border); padding-top: 15px; > h3 { margin-top: 12px; color: var(--text); font-size: 14px; } }.part-english { color: var(--cyan); font-size: 10px; margin-top: 7px; }.part-code { display: block; font-size: 9px; line-height: 1.6; color: var(--faint); overflow-wrap: anywhere; margin-top: 9px; }.part-description { font-size: 11px; color: var(--muted); line-height: 1.8; margin-top: 12px; }
.part-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin: 15px 0; div { display: flex; justify-content: space-between; font-size: 10px; } dt { color: var(--muted); } dd { margin: 0; color: var(--text); } }
.part-joints { display: grid; gap: 12px; div { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 7px; font-size: 10px; color: var(--muted); strong { color: var(--cyan); font-size: 15px; font-weight: 400; } small { grid-column: 1 / -1; color: var(--faint); font-size: 9px; } } .btn { min-height: 34px; font-size: 11px; } }
.part-live { display: grid; gap: 9px; padding: 13px 0; font-size: 10px; color: var(--muted); span { display: flex; justify-content: space-between; } b { font-weight: 400; color: var(--text); } small { color: var(--faint); font-size: 8px; } }.part-buttons { display: flex; gap: 6px; .btn { flex: 1; font-size: 10px; } }
.disassembly-sequence { border-top: 1px solid var(--border); padding-top: 16px; ol { list-style: none; padding: 0; margin: 10px 0 0; } li { border-left: 1px solid var(--border); margin-left: 11px; } button { display: flex; gap: 12px; align-items: center; width: 100%; background: transparent; text-align: left; color: var(--muted); font-size: 10px; padding: 8px 0; > .mono { padding: 4px; margin-left: -12px; background: var(--surface); color: var(--faint); } } .complete button { color: var(--cyan); }.current button { color: var(--warning); }.step-check { margin-left: auto; color: var(--success); } }
.lab-control-footer { border-top: 1px solid var(--border); padding: 12px 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; .btn { min-height: 32px; font-size: 10px; padding: 7px 9px; } > span { color: var(--faint); font-size: 8px; } }
@media(max-width:700px) { select,.part-search,.disassembly-buttons .btn,.part-buttons .btn,.lab-control-footer .btn { min-height: 44px; }.mode-switches label { min-height: 36px; }.disassembly-sequence button { min-height: 44px; } }
</style>
