# 阶段八：数字孪生 HUD 验收

日期：2026-11-17。依据 `MASTER_PROMPT.md` 第12、13章、阶段八及 HUD 验收清单，按 `ROLE.md` 六项交付。

后续评审已完成：3项P2修复，最终157项测试及25项针对性浏览器检查通过，详见 [阶段八评审报告](STAGE-8-REVIEW.md)。下文152项/73项为原阶段验收记录，单独保留。

## 1. 本阶段完成内容

完成统一基础/运动/能源/硬件/感知/任务监控、可折叠场景 HUD、数据趋势和机器人性能对比。数据全部由现有 `SimulationAdapter` 的同一时钟与快照提供，UI不产生随机参数。既有动作、IK、记录、实验室、感知与任务流程保留。

可体验入口：数字孪生监控 <http://127.0.0.1:4173/telemetry>，性能对比 <http://127.0.0.1:4173/performance>。这是本地生产预览，不代表外部部署。

## 2. 修改的文件

| 范围 | 文件与作用 |
| --- | --- |
| 统一数据 | `src/types/robot.ts`、`src/config/robots.ts`：明确遥测类型、演示电池/电压/负载/参考工况与对比参数 |
| 计算与快照 | `src/simulation/telemetry.ts`、`src/services/SimulationAdapter.ts`：派生状态、角速度/位移速度、能源积分、传感器和任务关联 |
| 任务批次 | `src/types/mission.ts`、`src/simulation/MissionEngine.ts`：每次选择/重置分配运行编号，曲线不混接 |
| 采样与导出 | `src/stores/simulation.ts`：双机2Hz有限历史、关节/任务/能源/硬件采样与CSV |
| HUD与图表 | `src/components/RobotHud.vue`、`RobotViewport.vue`、`TelemetryChart.vue`：共享折叠监控、按需任务曲线、真实渲染统计与资源释放 |
| 页面 | `src/views/TelemetryView.vue`、`PerformanceView.vue`、`WorkbenchView.vue`：完整监控、双机对比、工作台状态提示一致性 |
| 场景与入口 | `src/three/createScene.ts`、`src/router/index.ts`、`src/App.vue`：复用双机模型、居中比较视角、启用PERFORMANCE并移除废弃占位导航 |
| 回归 | `src/services/SimulationAdapter.telemetry.test.ts`、`src/stores/simulation.test.ts`：新增11项核心回归 |
| 文档 | `README.md`、`task_plan.md`、`findings.md`、`progress.md`、本报告 |

没有新增依赖、模型资源、外部服务或另一套状态/动画时钟。

## 3. 新增的功能

- HUD显示名称、编号、本地在线状态、运行模式/动作/时间、步态与实际位移速度、姿态/运动方向、受限关节/负载、稳定度、电池/电压/电流/功率/估算续航、CPU/内存/温度/延迟、摄像头/雷达/IMU/环境感知和识别目标数。
- 传感器状态跟随当前场景、扫描、历史、暂停和急停；任务目标数读取任务的真实几何检测结果。暂停与历史保留最近结果，未伪造硬件在线。
- 功率由实际运动、关节角速度和感知工作状态决定；电流为功率除以电压，电量用演示电池Wh容量积分。移除旧的正弦波动和无容量依据的固定放电除数。持物对手臂模拟负载产生影响。
- 全局暂停冻结仿真与采样，急停立即归零驱动/电流与关节速率。任务暂停/停止保留整机冻结语义，控制边界先更新为静态负载。
- 七类趋势：速度、电池、温度、可选关节角度、CPU、任务进度、功率；保留最近约60秒、每机最多120条。关节支持负角度，无任务为空值，任务批次变化断线。AI终态以“最近AI指令”保留成功/失败/取消及步骤进度，成功为100%，清空历史同步清除。
- CSV包含设备、时间、能源、硬件、位移、任务批次及12/45轴角度。已实测人形导出120行、60列。
- 双机性能页复用原有模型、关节层级和动作入口：同时行走/站立、独立动作/速度/急停；比较机械结构、自由度、运动、感知、负载设定、电池/参考续航、应用和任务。
- 悬浮HUD支持折叠和滚动，任务曲线仅展开时加载/创建；关闭即释放。窄屏移至左上以留出机器人头部和相机工具。监控页提供完整阅读空间。

所有能源、硬件、稳定度、负载和参考规格均为 **SIMULATION演示估算**，不代表真实设备性能。FPS、draw calls、几何/纹理数是当前浏览器的实际渲染统计，不能与机器人控制器模拟CPU混淆。

## 4. 实际测试结果

环境：Windows、Node v24.11.0、项目锁定的 Vue/Three.js 0.187.0/ECharts 6.1.0、Ego Lite Chromium、Intel Iris Xe。

- `npm test`：15个测试文件，**152/152通过**；原141项保留，新增11项。
- `npm run build`：内含 `vue-tsc --noEmit`，类型检查和生产构建通过。最终浏览器确认入口为 `index-DaiOb1zH.js`。
- `git diff --check`通过。npm提示用户全局配置中的python/msvs_version将被弃用，未修改用户环境配置。
- **73项有效浏览器检查通过**：双机联动和单机隔离、暂停/急停、曲线/切机/选关节、CSV、传感器扫描/停止、巡检、搬运、AI顺序执行终态、全息实验室HUD、离线动作、WebGL恢复和资源释放。
- 四页面（性能、监控、人形、任务）×八尺寸：1920×1080、1600×900、1366×768、1280×720、1024×768、768×1024、390×844、360×780。窄屏问题修复后有针对性复验；最终移动HUD额外复核390/360px。无横向溢出，相机控件可操作，图表尺寸有效。
- 三轮性能页/监控页切换：3个旧WebGL上下文全部释放、21张旧图表全部销毁；同场景稳定为165个几何/4个纹理。收起HUD释放任务图表，WebGL中断可重新加载且只有一个三维画布。
- 最终监听的应用console.warn/error、未捕获异常和Promise拒绝均为空。
- 本机 **HIGH / 1600×900 / 双机比较 / 连续rAF 4.02秒：24.62 FPS**，846 draw calls，165几何/4纹理。自动操作与尺寸切换间也观察到2–9 FPS短样本，保留原记录；不把单次24.62 FPS当作稳定帧率或60 FPS达标证据。

证据入口：`output/stage-8-hud/summary.json`。分组包括 `controls.json`、`mission-checks.json`、`perception-checks.json`、`layouts.json`、`layout-fixes.json`、`resources.json`、`final-layout.json`、`ai-transport.json`、`final-regression.json`、`final-mission-layout.json` 和 `performance-sample.json`。CSV、浏览器脚本和截图同目录保留；`output/`按既有规则不进入Git。

发现与修复：

1. 展开HUD覆盖相机工具，窄屏还遮挡人形头部：桌面让出工具列，窄屏移到左上、限制高度并滚动，最终截图确认完整头部。
2. AI结束后任务数据直接消失，曲线缺100%：新增回归先失败，改为从同一执行历史派生最近终态；不创建第二份任务状态。
3. 原测试要求任务暂停/停止能源冻结：能源积分保持dt=0，避免改变已有语义；速度/角速度和静态负载在控制边界更新。
4. 验收脚本问题单独记录：CDP尺寸不跨CLI轮次保留；静态张手完成应保持openHand而非站立；range按非整数min和0.5°步长吸附到44.7577°，验证改为实际控件目标；生产构建未结束时访问到旧产物，最终明确核对入口hash后复验。上述失败不算通过，也未通过修改正常产品行为来迎合脚本。

`summary.json`明确列出首轮4项布局失败和1项错误AI断言的替代证据。官方资料核对：[ECharts折线与空数据](https://github.com/apache/echarts-handbook/blob/master/contents/en/how-to/chart-types/line/basic-line.md)、[Three.js r187 Object3D](https://github.com/mrdoob/three.js/blob/r187/docs/pages/Object3D.html)，同时阅读安装版本的实际源码/API；没有升级依赖。

## 5. 未解决的问题

本阶段范围内没有已知阻塞项。**60 FPS目标尚未达到**；跨浏览器、真实平板/手机、低端GPU、长时间运行和全产品最终回归未在本阶段完成。全部机器人遥测与规格仍为模拟，不包含硬件、动力学或真实AI视觉验证。未提交、推送或部署。

## 6. 下一阶段计划

阶段九：依据当前实测数据定位渲染瓶颈，优化模型/阴影/动画与资源管理，复验画质、布局、异常恢复和全部主要场景，逐项核对产品第22/23章并完成最终功能验收报告。阶段九仍为pending。
