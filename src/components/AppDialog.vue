<script setup lang="ts">
import { ref, watch, nextTick, useId } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
watch(() => props.open, async value => { await nextTick(); if (value) dialog.value?.showModal(); else dialog.value?.close() }, { immediate: true })
</script>
<template>
  <dialog ref="dialog" :aria-labelledby="titleId" @close="emit('close')" @click="event => { if (event.target === dialog) dialog?.close() }">
    <div class="dialog-content"><header><h2 :id="titleId">{{ title }}</h2><button class="icon-btn" aria-label="关闭弹窗" @click="dialog?.close()"><AppIcon name="close" /></button></header><slot /></div>
  </dialog>
</template>
<style scoped lang="less">
dialog { width: min(490px, calc(100% - 32px)); border: 1px solid #414b40; border-radius: 14px; padding: 0; background: var(--surface); color: var(--text); box-shadow: 0 30px 100px #0008; &::backdrop { background: #070a0cb8; backdrop-filter: blur(6px); } }
.dialog-content { padding: 24px; } header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; }
</style>
