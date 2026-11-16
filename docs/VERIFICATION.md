# 原 RoboVerse 工作台局部验收记录（历史）

> 2026-11-16 用户纠正：本项目必须严格按 ROLE.md / MASTER_PROMPT.md 开发。本报告只证明旧工作台局部功能的历史测试结果，不等同于 NEXT ROBOTICS 原规范阶段一或九阶段完整验收。当前规范对齐结果见 `docs/ROLE-ALIGNMENT.md`。

验收日期：2026-11-16。范围：原始 RoboVerse 初始化任务中的 11 项第一阶段要求。当前版本 0.1.0，采用原创程序化机械模型与本地运动学仿真。

## 结论

旧工作台限定范围的类型检查、生产构建、13 项自动化回归测试和 80 项浏览器检查通过。该结果不覆盖原产品规范中尚未实现的能力。报告中的端口与测试环境为历史记录，不保证当前服务状态。

浏览器环境为 Windows / Ego Lite 内置 Chromium 156。宽度模拟覆盖桌面、平板和手机布局；不等同于真实移动设备或跨浏览器验收。

## 需求对应

| 原始要求 | 实际交付 | 验证 |
| --- | --- | --- |
| 工程初始化 | Vue 3 + TypeScript + Vite，锁文件、脚本和应用入口 | 类型检查、生产构建 |
| 统一目录结构 | 配置、类型、适配器、状态、运动学、场景、组件、页面分工 | 代码调用链检查 |
| 设计规范和主题变量 | Less 全局主题，统一按钮、面板、表单、状态和对话框 | 桌面与窄屏截图 |
| 主布局、导航和路由 | 五个实际功能页面及 404 返回入口 | 导航、生产深链接和直接刷新 |
| 数字孪生工作台 | 3D 场景、控制面板、实时遥测 | 实际 WebGL 渲染和操作 |
| 两种机器人切换 | RV K1 四足 / RV H1 人形，共用工作台且各自保存状态 | 机型切换、技能联动 |
| Three.js 交互场景 | PBR 外壳、机械关节、环境光、网格、实验台 | 材质、模型截图、资源计数 |
| 旋转、缩放、平移、视角切换 | OrbitControls、四种视角、双击聚焦、全屏、视角复位 | 画布变化、按钮、全屏进出 |
| 基础运动 | 两连杆 IK、四足步态、小跑、下蹲、人形摆臂与挥手 | 运动学回算、相位、速度及动作控制 |
| Mock 与仿真状态管理 | 唯一 SimulationAdapter 状态源、暂停、急停、恢复、重置 | 单测与跨页面实操 |
| 动态遥测图表 | ECharts 曲线、腿部关节角度、最近一分钟采样、CSV 导出 | 长时钟回归、实际下载和内容检查 |

## 构建和自动化测试

最终源码执行：

```text
npm test          2 个测试文件 / 13 项通过
npm run build     vue-tsc --noEmit 通过；Vite 生产构建通过
```

用例覆盖两机独立状态、暂停冻结、急停锁定与重置保留、暂停时释放急停恢复完整站姿、非法参数和动作、订阅隔离、定时器释放、后台冻结与恢复、逆运动学回算、对角小跑、零速步态、三分钟后的遥测滚动窗口及重置采样。

运行时依赖版本：Vue 3.5.45、Pinia 4.1.0、Vue Router 5.5.1、Three.js 0.187.0、ECharts 6.1.0、GSAP 3.15.1、Less 4.9.1；构建工具 Vite 8.3.8、TypeScript 5.9.3；测试工具 Vitest 5.1.0。本机使用 Node 24.11.0。

Vite 最终产物中，工作台 JavaScript 块约 692 kB / gzip 186 kB，图表共享块约 495 kB / gzip 168 kB。页面按路由加载。npm 输出的 `python / msvs_version` 旧用户配置提醒来自本机全局配置，不影响本项目构建；本次未调整全局 npm 配置。

## 浏览器检查与证据

所有证据位于项目 `output/verification/`，该目录不进入未来 Git 提交。

| 分组 | 结果 | 原始记录 |
| --- | --- | --- |
| 控制、状态、对话框、设置与视角 | 25 / 25 | `controls-results.json` |
| 页面联动、CSV、日志与资源生命周期 | 22 / 22 | `routes-resources-results.json` |
| 多尺寸布局、窄屏导航、全屏与减少动态效果 | 17 / 17 | `responsive-results.json` |
| 鼠标交互、真实 WebGL 上下文丢失与恢复 | 5 / 5 | `recovery-results.json` |
| 生产构建、深链接、404、离线动作与异常检查 | 11 / 11 | `production-results.json` |
| 合计 | **80 / 80** | 各 JSON 逐项保存结果 |

浏览器验证入口为 `round-09-final-regression.mjs`、`round-07.mjs` 和 `round-10-production.mjs`；它们使用本机 ego-browser。脚本中的空间号和开发端口对应本次会话，复跑需按实际浏览器空间和服务地址调整。核心逻辑回归可直接运行 `npm test`。

截图包括 `workbench-final.png`、`humanoid-wave.png`、`telemetry-desktop.png`、`mobile-final.png` 以及各尺寸初验截图。实际下载文件为 `telemetry-export.csv`，内容包含 simulation 标记、机型序列号和真实采样值。

布局尺寸：1920×1080、1600×900、1366×768、1024×768、768×1024、390×844、360×800。所有目标尺寸均未发现页面横向溢出，窄屏可完成导航、机型切换、动作执行和暂停。

8 轮工作台进出均验证旧 canvas 已脱离 DOM、旧 WebGL 上下文处于 lost 状态。两种模型均显示过后，新场景几何计数稳定为 94、纹理计数为 4。桌面短时采样约 48–60 FPS，首次初始化与截图期间会波动；该结果不能作为所有显卡或长期运行的帧率保证。

错误恢复使用 `WEBGL_lose_context` 实际触发上下文丢失，确认错误面板出现，点击恢复后仅有一个渲染画布且能继续渲染。最终控制、页面联动、恢复及生产检查均未记录应用未捕获异常或控制台告警。

生产网络检查发现一条 Google Fonts 请求，已通过 Network initiator 和浏览器扩展的 `assets/index.css` 定位到已安装扩展。应用源码、CSS 和产物不引用该字体；应用资源本地加载，并通过加载完成后的断网动作检查。没有改动用户浏览器扩展设置。

## 本次续接修复

| 根因 | 最小修复 | 主要文件 |
| --- | --- | --- |
| 场景自动复位相机，组件标签仍保留旧视角 | 组件统一处理机型切换、双击聚焦和视角标签 | `RobotViewport.vue`、`createScene.ts` |
| 暂停时释放急停只更新动作名，旧姿态依赖被暂停的下一帧 | 释放指令立即更新完整站姿及待机输出 | `SimulationAdapter.ts` |
| 浮点时间差累积使 120 条采样实际覆盖约 72 秒 | 按半秒时间区间编号采样，避免累计延迟 | `stores/simulation.ts` |
| 两个原生对话框使用重复标题 ID | 使用当前 Vue 的 useId 生成关联 ID | `AppDialog.vue` |
| 人形配置显示 20 轴，实际仅驱动 12 轴 | 参数改为当前实现的 12 轴 | `config/robots.ts` |
| Three.js 当前版本移除了 PCFSoftShadowMap | 使用当前支持的 PCFShadowMap | `createScene.ts` |
| 上下文已丢失时再调用 forceContextLoss 产生扩展警告 | 已丢失时跳过重复丢失，保留资源释放 | `createScene.ts` |
| 窄视口模型顶部与名称重叠 | 依据画布宽高比扩大视野 | `createScene.ts` |

新增回归位于 `src/simulation/simulation.test.ts`、`src/stores/simulation.test.ts`。新增交付文档为本记录和 README；更新了原有计划、进度和发现文件。

相关 API 核对以已安装版本源码为准，并参考 [Vue useId 文档](https://vuejs.org/api/composition-api-helpers.html#useid)、[Three r187 常量定义](https://github.com/mrdoob/three.js/blob/r187/src/constants.js)、[Three r187 阴影实现](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLShadowMap.js)、[ECharts 实例生命周期](https://echarts.apache.org/handbook/en/concepts/chart-size/) 和 [GSAP 动画取消](https://gsap.com/docs/v3/GSAP/gsap.killTweensOf()/)。

## 边界与未验证事项

- 第一阶段范围内没有已知阻塞问题；真实手机、Safari、Firefox 和长期低端 GPU 压力测试尚未执行。
- 场景是运动学与原地步态展示，不包含真实位移、动力学接触或平衡控制。模拟数据不代表商业设备的性能。
- AI、复杂任务编排、点云、结构拆解、ROS 2 / MQTT 与多机集群属于后续范围，本次未实现或声称验收。
- 当前目录不是 Git 仓库，本次未进行提交、推送或远端部署。
- 4173 为本次启动并保留的本机预览。上次的 5173 开发进程在收尾时已退出，5173 当前由其他项目使用。

下一阶段建议沿现有机械结构补充部件拾取与说明，再增量设计结构检查能力；本次交付止于已验收的第一阶段。
