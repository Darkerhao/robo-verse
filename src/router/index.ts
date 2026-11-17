import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: () => import('@/views/OverviewView.vue'), meta: { title: '沉浸式展示大厅', section: 'OVERVIEW' } },
    { path: '/quadruped', name: 'quadruped', component: () => import('@/views/WorkbenchView.vue'), meta: { title: '四足机器人数字孪生', section: 'QUADRUPED', robot: 'quadruped' } },
    { path: '/humanoid', name: 'humanoid', component: () => import('@/views/WorkbenchView.vue'), meta: { title: '人形机器人数字孪生', section: 'HUMANOID', robot: 'humanoid' } },
    { path: '/lab', name: 'lab', component: () => import('@/views/LabView.vue'), meta: { title: '全息实验室', section: 'LAB' } },
    { path: '/perception', name: 'perception', component: () => import('@/views/PerceptionView.vue'), meta: { title: 'AI 感知中心', section: 'AI PERCEPTION' } },
    { path: '/assistant', name: 'assistant', component: () => import('@/views/AssistantView.vue'), meta: { title: 'AI 智能控制', section: 'AI CONTROL' } },
    { path: '/missions', name: 'missions', component: () => import('@/views/MissionsView.vue'), meta: { title: '智能任务中心', section: 'MISSIONS' } },
    { path: '/performance', name: 'performance', component: () => import('@/views/PerformanceView.vue'), meta: { title: '机器人性能对比', section: 'PERFORMANCE' } },
    { path: '/robots', name: 'robots', component: () => import('@/views/RobotsView.vue'), meta: { title: '机器人管理', section: '设备中心' } },
    { path: '/skills', name: 'skills', component: () => import('@/views/SkillsView.vue'), meta: { title: '动作技能库', section: '应用中心' } },
    { path: '/telemetry', name: 'telemetry', component: () => import('@/views/TelemetryView.vue'), meta: { title: '数字孪生监控', section: 'HUD' } },
    { path: '/events', name: 'events', component: () => import('@/views/EventsView.vue'), meta: { title: '运行日志', section: '数据中心' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { title: '页面不存在', section: '工作空间' } },
  ],
})

router.afterEach((to) => { document.title = `${String(to.meta.title)} · NEXT ROBOTICS` })
