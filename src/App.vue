<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AppDialog from '@/components/AppDialog.vue'
import { useSimulationStore } from '@/stores/simulation'
const route = useRoute(), sim = useSimulationStore()
const modal = ref<'help' | 'settings' | null>(null)
const mobileMenu = ref(false)
const navigation = [
  { path: '/', label: 'OVERVIEW', title: '沉浸式展示大厅' },
  { path: '/quadruped', label: 'QUADRUPED', title: '四足机器人' },
  { path: '/humanoid', label: 'HUMANOID', title: '人形机器人' },
  { path: '/lab', label: 'LAB', title: '全息实验室 · 部件、顺序拆解、透视与骨骼' },
  { path: '/perception', label: 'AI PERCEPTION', title: 'AI 感知中心 · 雷达、点云、目标识别与避障导航' },
  { label: 'MISSIONS', title: '尚未实现 · 阶段七：智能任务中心' },
  { label: 'PERFORMANCE', title: '尚未实现 · 阶段八：完整性能对比；基础遥测可从工具栏访问' },
]
watch(() => route.path, () => { mobileMenu.value = false })
onMounted(() => { void sim.start() })
onUnmounted(() => sim.stop())
</script>

<template>
  <div class="app-shell" :class="{ immersive: route.name === 'overview' }">
    <header class="global-header">
      <RouterLink to="/" class="brand" aria-label="NEXT ROBOTICS 首页"><AppIcon name="cube" /><span>NEXT <b>ROBOTICS</b><small>下一代智能机器人数字孪生体验中心</small></span></RouterLink>
      <button class="icon-btn menu-toggle" aria-label="切换主导航" :aria-expanded="mobileMenu" @click="mobileMenu = !mobileMenu"><AppIcon name="menu" /></button>
      <nav class="primary-nav" :class="{ open: mobileMenu }" aria-label="主导航">
        <template v-for="item in navigation" :key="item.label">
          <RouterLink v-if="item.path" :to="item.path" :title="item.title" active-class="active" exact-active-class="selected">{{ item.label }}</RouterLink>
          <button v-else disabled :title="item.title" :aria-label="`${item.label} · ${item.title}`">{{ item.label }}<small>待开发</small></button>
        </template>
      </nav>
      <div class="global-tools">
        <button class="icon-btn" aria-label="画质设置" title="画质设置" @click="modal = 'settings'"><AppIcon name="settings" /></button>
        <button class="icon-btn" aria-label="使用帮助" title="使用帮助" @click="modal = 'help'"><AppIcon name="help" /></button>
      </div>
    </header>
    <div v-if="route.name !== 'overview'" class="workspace-tools"><span>{{ route.meta.section }} <i>/</i> {{ route.meta.title }}</span><nav aria-label="实验工具"><RouterLink to="/robots">机器人目录</RouterLink><RouterLink to="/skills">动作库</RouterLink><RouterLink to="/telemetry">实时遥测</RouterLink><RouterLink to="/events">运行日志</RouterLink></nav></div>
    <main class="page-content"><RouterView /></main>
    <footer class="global-footer"><span><i class="dot" :class="{ live: sim.connected }" />{{ sim.connected ? '本地仿真运行中' : '仿真引擎离线' }}<b>SIMULATION</b></span><span>运动学演示 · 原创机械模型 · 无真实设备连接</span><span class="mono">{{ sim.uptime }} / WebGL</span></footer>
    <AppDialog :open="modal !== null" :title="modal === 'help' ? '探索 NEXT ROBOTICS' : '画质与场景设置'" @close="modal = null">
      <div v-if="modal === 'help'" class="help-content"><p>在展示大厅中观察两种机器人，点击模型聚焦，双击进入对应数字孪生页面。</p><div class="help-row"><AppIcon name="target" /><span><strong>三维观察</strong><small>左键拖动旋转视角 · 滚轮缩放 · 右键平移 · 工作台悬停识别部件 · 全屏</small></span></div><div class="help-row"><AppIcon name="play" /><span><strong>机器人控制</strong><small>工作台提供动作、关节与末端 IK 控制，支持循环、倍率与记录回放。暂停冻结动作和遥测；急停锁定单台机器人。</small></span></div><div class="help-row"><AppIcon name="cube" /><span><strong>全息实验室</strong><small>点击部件查看详情与聚焦；十步拆解支持进度、暂停、继续与恢复。外壳透明可拾取内部，骨骼与关节轴随真实节点运动。</small></span></div><div class="help-row"><AppIcon name="radar" /><span><strong>AI 感知中心</strong><small>切换五种视图观察雷达、点云与目标识别；路径视图点击空闲地面选终点，开始移动后机器人沿避障路线行走。支持扫描历史、局部放大、暂停和急停。</small></span></div><p>参数和感知结果均为 SIMULATION，不代表真实设备性能或视觉模型推理。自然语言控制与场景任务按后续阶段增量开发。</p></div>
      <div v-else class="settings-content"><label class="field">渲染质量<select v-model="sim.quality" aria-label="渲染质量"><option value="high">HIGH · 高清阴影 / 最高 2× 像素比</option><option value="medium">MEDIUM · 标准阴影 / 最高 1.5× 像素比</option><option value="low">LOW · 关闭阴影 / 1× 像素比</option></select></label><label class="setting-check"><input v-model="sim.grid" type="checkbox" />显示空间参考网格</label><p>模型和参数由本地程序生成，不需要外部 AI API 或设备连接。</p></div>
    </AppDialog>
  </div>
</template>

<style scoped lang="less">
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.global-header { height: 88px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 3.4vw; border-bottom: 1px solid var(--border); background: #070b14ee; z-index: 10; }
.brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; font-size: 19px; letter-spacing: 1.1px; .icon { width: 31px; height: 34px; color: var(--accent); } b { font-weight: 400; color: var(--muted); } small { display: block; font-size: 8px; letter-spacing: 1.5px; margin-top: 7px; color: var(--faint); } }
.primary-nav { display: flex; align-items: center; gap: 22px; a, button { position: relative; font-size: 9px; letter-spacing: .8px; color: var(--muted); padding: 13px 0; background: transparent; white-space: nowrap; } a:hover, .selected { color: var(--accent); } .selected::after { content: ''; position: absolute; height: 2px; background: var(--accent); bottom: 0; left: 0; right: 0; } button { opacity: .5; } small { display: block; text-align: center; font-size: 7px; letter-spacing: 0; margin-top: 4px; color: var(--faint); } }
.global-tools { display: flex; gap: 8px; }.menu-toggle { display: none; }
.workspace-tools { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 3.4vw; color: var(--faint); font-size: 10px; border-bottom: 1px solid var(--border); i { font-style: normal; padding: 0 8px; } nav { display: flex; gap: 22px; } a:hover, .router-link-exact-active { color: var(--accent); } }
.page-content { padding: 28px 3.4vw; flex: 1; min-width: 0; width: 100%; max-width: 1920px; margin: 0 auto; }
.global-footer { padding: 13px 3.4vw; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 9px; color: var(--faint); span:first-child { display: flex; align-items: center; gap: 8px; } b { font-size: 8px; font-weight: 400; letter-spacing: .7px; color: var(--accent); } .live { color: var(--success); } }
.immersive .page-content { padding: 0; max-width: none; display: flex; }
.help-content p, .settings-content p { color: var(--muted); font-size: 12px; line-height: 1.9; }.help-row { display: flex; gap: 14px; margin: 24px 0; .icon { color: var(--accent); } strong { font-weight: 500; } small { display: block; color: var(--muted); line-height: 1.8; margin-top: 8px; } }.settings-content { display: grid; gap: 24px; }.setting-check { display: flex; gap: 9px; input { accent-color: var(--accent); } }
@media(max-width:1400px) { .global-header { padding-inline: 24px; gap: 18px; }.brand { font-size: 16px; gap: 8px; small { font-size: 7px; } }.primary-nav { gap: 16px; a, button { font-size: 8px; } } }
@media(max-width:1100px) { .global-header { height: 76px; flex-wrap: wrap; position: relative; }.brand { margin-right: auto; }.menu-toggle { display: flex; }.primary-nav { display: none; &.open { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; padding: 16px 24px; position: absolute; top: 75px; left: 0; right: 0; border-bottom: 1px solid var(--border); background: #0b1220fa; z-index: 20; } a, button { font-size: 10px; text-align: center; } }.workspace-tools { flex-wrap: wrap; gap: 12px; }.global-footer > span:nth-child(2) { display: none; } }
@media(max-width:600px) { .global-header { padding-inline: 16px; gap: 10px; }.brand { font-size: 13px; .icon { width: 24px; } small { font-size: 6px; letter-spacing: .5px; } }.global-tools { gap: 4px; }.global-tools .icon-btn { width: 32px; height: 36px; }.menu-toggle { width: 34px; }.primary-nav.open { grid-template-columns: repeat(2,1fr); }.workspace-tools { padding: 14px 16px; nav { gap: 18px; font-size: 10px; } }.page-content { padding: 22px 16px; }.global-footer { padding-inline: 16px; font-size: 8px; } }
</style>
