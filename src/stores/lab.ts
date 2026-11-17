import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { defaultLabState, partHidden, type LabPart } from '@/config/lab'
import { useSimulationStore } from './simulation'
import type { RobotId } from '@/types/robot'

export const useLabStore = defineStore('lab', () => {
  const sim = useSimulationStore()
  const state = ref(defaultLabState())
  const playback = ref<'idle' | 'disassembling' | 'paused' | 'restoring' | 'restore-paused'>('idle')
  const catalog = shallowRef<Record<RobotId, LabPart[]>>({ quadruped: [], humanoid: [] })
  const parts = computed(() => catalog.value[sim.selectedId])
  const selected = computed(() => parts.value.find(item => item.id === state.value.selectedPartId))
  function reset() { state.value = defaultLabState(); playback.value = 'idle' }
  function seek(progress: number) { state.value.progress = Math.max(0, Math.min(10, progress)); playback.value = 'idle' }
  function start() { if (state.value.progress === 10) state.value.progress = 0; playback.value = 'disassembling' }
  function restore() { state.value.hidden = []; playback.value = state.value.progress > 0 ? 'restoring' : 'idle' }
  function togglePlayback() {
    if (playback.value === 'restoring') playback.value = 'restore-paused'
    else if (playback.value === 'restore-paused') playback.value = 'restoring'
    else playback.value = playback.value === 'paused' ? 'disassembling' : 'paused'
  }
  function advance(dt: number) {
    if (sim.snapshot.paused || sim.current.emergency) return
    const direction = playback.value === 'disassembling' ? 1 : playback.value === 'restoring' ? -1 : 0
    if (!direction) return
    state.value.progress = Math.max(0, Math.min(10, state.value.progress + direction * dt * .9))
    if (state.value.progress === 0 || state.value.progress === 10) playback.value = 'idle'
  }
  function show(id: string) { state.value.hidden = state.value.hidden.filter(parent => id !== parent && !id.startsWith(parent + '/')) }
  function hide(id: string) { if (!state.value.hidden.includes(id)) state.value.hidden.push(id) }
  function select(id: string | null) {
    state.value.selectedPartId = id
    if (!id) return
    show(id)
    const item = parts.value.find(part => part.id === id)
    if (item && ['power', 'controller', 'frame'].includes(item.kind)) state.value.transparent = true
  }
  function visible(id: string) { return !partHidden(id, state.value.hidden) }
  return { state, playback, catalog, parts, selected, reset, seek, start, restore, togglePlayback, advance, show, hide, select, visible }
})
