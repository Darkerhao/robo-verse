import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { LocalAIProvider, ProxyAIProvider } from '@/services/AIProvider'
import { useSimulationStore } from './simulation'

export const useAssistantStore = defineStore('assistant', () => {
  const sim = useSimulationStore()
  const config = reactive({ provider: 'local' as 'local' | 'proxy', enabled: false, baseUrl: '', apiKey: '', model: '' })
  const busy = ref<'parsing' | 'testing' | null>(null), feedback = ref(''), rejectedText = ref('')
  const history = computed(() => sim.snapshot.assistant.history)
  const active = computed(() => history.value.find(run => run.status === 'queued' || run.status === 'running'))
  let pending: AbortController | undefined
  const provider = () => config.provider === 'proxy' && config.enabled ? new ProxyAIProvider({ ...config }) : new LocalAIProvider()
  const providerName = computed(() => config.provider === 'proxy' && config.enabled ? '安全代理' : '本地规则 · 离线可用')
  function abort() { pending?.abort(); pending = undefined; busy.value = null }
  function cancel() { abort(); sim.send({ type: 'cancelAssistant' }); feedback.value = '当前请求与执行任务已取消。' }
  async function request(text?: string) {
    if (busy.value) return
    const controller = new AbortController(), robot = sim.selectedId
    pending = controller; busy.value = text === undefined ? 'testing' : 'parsing'; feedback.value = ''; rejectedText.value = ''
    try {
      const ai = provider()
      if (text === undefined) {
        const result = await ai.test(controller.signal)
        if (!controller.signal.aborted) feedback.value = result
      }
      else {
        const commands = await ai.parse(text, robot, controller.signal)
        if (controller.signal.aborted) return
        feedback.value = '指令已解析'
        if (sim.send({ type: 'assistant', robot, text, provider: ai.name, commands }, `AI 已解析 ${commands.length} 个顺序动作`)) feedback.value = ''
        else throw new Error(sim.error)
      }
    } catch (cause) {
      if (!controller.signal.aborted) { feedback.value = cause instanceof Error ? cause.message : String(cause); rejectedText.value = text ?? '' }
    } finally { if (pending === controller) { pending = undefined; busy.value = null } }
  }
  // 只在真实上下文变化时取消待解析请求；不能返回每 tick 都创建的新数组。
  watch(() => `${sim.selectedId}:${sim.snapshot.paused}:${sim.current.emergency}`, () => { if (pending) { abort(); feedback.value = '机器人或运行状态已变化，请重新发送指令。' } }, { flush: 'sync' })
  onScopeDispose(abort)
  return { config, busy, feedback, rejectedText, history, active, providerName, request, cancel }
})
