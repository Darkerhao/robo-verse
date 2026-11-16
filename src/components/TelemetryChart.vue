<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { init, use, type EChartsCoreOption, type ECharts } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { TelemetrySample } from '@/types/robot'
use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])
const props = withDefaults(defineProps<{ samples: TelemetrySample[]; metric: 'speed' | 'temperature' | 'power' | 'cpu' | 'battery'; color?: string; expanded?: boolean }>(), { color: '#baf277', expanded: false })
const host = ref<HTMLElement>()
let chart: ECharts | undefined, observer: ResizeObserver | undefined
const points = computed(() => props.samples.map(s => [s.time, s[props.metric]]))
function render() {
  const option: EChartsCoreOption = {
    animation: false,
    grid: { top: 12, right: props.expanded ? 22 : 4, bottom: props.expanded ? 28 : 3, left: props.expanded ? 46 : 3 },
    tooltip: { trigger: 'axis', backgroundColor: '#222a27', borderColor: '#435039', textStyle: { color: '#dbe5d6', fontSize: 11 }, valueFormatter: (value: unknown) => Number(value).toFixed(2) },
    xAxis: { type: 'value', min: Math.max(0, (props.samples.at(-1)?.time ?? 60) - 60), max: Math.max(60, props.samples.at(-1)?.time ?? 60), show: props.expanded, axisLabel: { color: '#66776d', fontSize: 10, formatter: (value: number) => `${value.toFixed(0)}s` }, splitLine: { show: false }, axisLine: { lineStyle: { color: '#354038' } }, axisTick: { show: false } },
    yAxis: { type: 'value', min: props.metric === 'temperature' ? 25 : 0, max: props.metric === 'cpu' || props.metric === 'battery' ? 100 : props.metric === 'temperature' ? 65 : undefined, scale: true, splitNumber: 3, axisLabel: { show: props.expanded, color: '#74847a', fontSize: 10 }, splitLine: { lineStyle: { color: '#2a3430', type: 'dashed' } } },
    series: [{ name: props.metric, type: 'line', data: points.value, smooth: .24, showSymbol: points.value.length === 1, symbolSize: 4, lineStyle: { color: props.color, width: 1.8 }, itemStyle: { color: props.color }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: props.color + '22' }, { offset: 1, color: props.color + '00' }] } }, emphasis: { disabled: true } }],
  }
  chart?.setOption(option)
}
onMounted(() => { if (host.value) { chart = init(host.value); observer = new ResizeObserver(() => chart?.resize()); observer.observe(host.value); render() } })
watch([points, () => props.color, () => props.metric], render)
onUnmounted(() => { observer?.disconnect(); chart?.dispose() })
</script>
<template><div ref="host" class="chart" :class="{ expanded }" role="img" :aria-label="`${metric} 仿真数据趋势，共 ${samples.length} 个采样点`" /><div v-if="samples.length === 0" class="chart-empty">等待仿真数据采样…</div></template>
<style scoped lang="less">.chart { height: 71px; width: 100%; &.expanded { height: 235px; } }.chart-empty { font-size: 10px; color: var(--muted); margin-top: -40px; height: 40px; text-align: center; }</style>
