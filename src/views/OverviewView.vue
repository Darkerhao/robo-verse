<script setup lang="ts">
import { ref } from 'vue'
import RobotViewport from '@/components/RobotViewport.vue'
import AppIcon from '@/components/AppIcon.vue'
const exploring = ref(false)
</script>

<template>
  <section class="overview" :class="{ 'is-exploring': exploring }">
    <RobotViewport overview @select="exploring = !!$event" />
    <div class="hero-copy" :inert="exploring"><span class="eyebrow">NEXT GENERATION / DIGITAL TWIN EXPERIENCE</span><h1>THE FUTURE <span class="title-line">IS <span>ROBOTIC</span></span></h1><h2>探索下一代智能机器人的无限可能。</h2><p>从四足移动到双足行走，从环境感知到自主决策，<br class="desktop-break">探索机器人智能化发展的全新边界。</p><div class="hero-actions"><RouterLink to="/quadruped" class="btn btn-primary">EXPLORE QUADRUPED<AppIcon name="arrow" /></RouterLink><RouterLink to="/humanoid" class="btn">EXPLORE HUMANOID<AppIcon name="arrow" /></RouterLink></div><RouterLink to="/lab" class="lab-link">ENTER ROBOTICS LAB<AppIcon name="arrow" /></RouterLink></div>
    <div class="hall-caption"><span>01 / QUADRUPED</span><span>02 / HUMANOID</span><small>程序化机械模型 · SIMULATION</small></div>
  </section>
</template>

<style scoped lang="less">
.overview { position: relative; width: 100%; min-height: calc(100dvh - 129px); overflow: hidden; }
.overview :deep(.canvas-host)::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, #070b14c9, transparent 58%); transition: opacity .2s; }
.overview :deep(.viewport) { position: absolute; inset: 0; border: none; border-radius: 0; min-height: 0; height: 100%; }
.hero-copy { position: relative; z-index: 2; pointer-events: none; padding: clamp(76px, 12vh, 150px) 0 0 5.4vw; width: 48%; .eyebrow { color: var(--cyan); font-size: 9px; letter-spacing: 2px; } h1 { margin-top: 25px; font-size: clamp(42px, 4.7vw, 85px); line-height: 1.05; font-weight: 500; letter-spacing: -2.5px; .title-line { display: block; } .title-line > span { color: var(--cyan); } } h2 { font-size: clamp(13px, 1.1vw, 18px); font-weight: 400; margin-top: 28px; letter-spacing: 1px; } p { font-size: 12px; line-height: 2; color: var(--muted); margin-top: 18px; } a { pointer-events: auto; } }
.hero-copy, .hall-caption { transition: opacity .2s, visibility .2s; }
.is-exploring { .hero-copy, .hall-caption { opacity: 0; visibility: hidden; } }
.is-exploring :deep(.canvas-host)::after, .overview :deep(.viewport:fullscreen .canvas-host)::after { opacity: 0; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 32px; .btn { min-height: 44px; font-size: 9px; letter-spacing: .7px; padding-inline: 17px; }.icon { width: 14px; } }
.lab-link { display: inline-flex; gap: 12px; align-items: center; font-size: 9px; letter-spacing: 1px; color: var(--muted); margin-top: 24px; .icon { width: 14px; } &:hover { color: var(--accent); } }
.hall-caption { position: absolute; left: 53%; right: 6%; bottom: 105px; display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; pointer-events: none; font-size: 9px; letter-spacing: 1px; color: #b6cadc; small { width: 100%; text-align: center; font-size: 8px; color: var(--faint); } }
@media(max-height:780px) and (min-width:1101px) { .hero-copy { padding-top: 64px; h1 { font-size: 54px; } h2 { margin-top: 23px; } }.hall-caption { bottom: 92px; } }
@media(max-width:1100px) { .overview { min-height: calc(100dvh - 117px); }.hero-copy { padding: 64px 32px 0; width: 100%; h1 { font-size: 45px; .title-line { display: inline; } } h2 { margin-top: 15px; font-size: 14px; } p { margin-top: 10px; font-size: 11px; }.hero-actions { margin-top: 18px; }.lab-link { margin-top: 14px; } }.hall-caption { left: 18%; right: 18%; bottom: 100px; } }
@media(max-width:600px) { .overview { min-height: 790px; }.hero-copy { padding: 64px 20px 0; .eyebrow { font-size: 7px; } h1 { font-size: 38px; letter-spacing: -1.5px; .title-line { display: block; } } h2 { font-size: 12px; } p { font-size: 10px; }.hero-actions .btn { font-size: 8px; padding-inline: 8px; min-height: 44px; } }.hall-caption { left: 10%; right: 10%; bottom: 112px; font-size: 8px; } }
@media(max-width:1100px) { .overview :deep(.canvas-host)::after { background: linear-gradient(#070b14a6 25%, transparent 58%); } }
</style>
