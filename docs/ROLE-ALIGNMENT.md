# NEXT ROBOTICS 规范对齐与阶段一验收

> 本文保留阶段一结束时的验收范围和数据。2026-11-16 阶段二已完成，最新模型与阶段状态见 [阶段二模型验收](STAGE-2-MODELS.md) 和 [实施计划](../task_plan.md)。

## 规范与范围
2026-11-16 用户明确要求严格按 ROLE.md 开发。MASTER_PROMPT.md 为产品规范。完整交付以九阶段及第 22/23 章验收清单为准，旧工作台报告只作为局部历史证据。

## 1. 本阶段完成内容

验收日期：2026-11-16。阶段一“项目基础与视觉框架”已完成；九阶段整体仍在实施。

- NEXT ROBOTICS 品牌、深色蓝色主题、顶部七模块导航与窄屏菜单。
- 全屏三维展示大厅，同时显示原创四足与人形机器人，配置环境光、金属地面、空间网格、展示台和远景装置。
- 原规范标题、介绍及三个探索入口；机器狗与人形专属路由同步选择当前机型，实验室保留已实现的基础控制并说明后续范围。
- 模型构建进度、首帧完成状态、全屏、视角复位及可操作的 WebGL 恢复界面。
- 保留原有动作库、暂停/急停、遥测、CSV 导出、日志与统一 SimulationAdapter。

当前生产预览：[http://127.0.0.1:4173/](http://127.0.0.1:4173/)。开发服务：[http://127.0.0.1:5174/](http://127.0.0.1:5174/)。两者为本机服务，本次未远端部署；当前目录没有 Git 元数据。

## 2. 修改的文件

阶段一累计涉及的主要文件：

| 文件 | 责任 |
| --- | --- |
| `src/App.vue`、`src/router/index.ts`、`src/styles/theme.less`、`index.html` | 品牌、导航、路由、主题与页面框架 |
| `src/views/OverviewView.vue` | 双机大厅文案与入口、响应式构图、聚焦时让出文案区域 |
| `src/components/RobotViewport.vue` | 加载、选中反馈、全屏、画质标签与视角状态 |
| `src/three/createScene.ts` | 双机展示、真实拾取、相机、环境与资源释放 |
| `src/three/RobotModel.ts` | 沿用原创机械模型，更新蓝色材质配色 |
| `src/views/WorkbenchView.vue`、`src/components/RobotControl.vue` | 专属路由与当前机型同步、实验室能力说明 |
| `src/views/RobotsView.vue`、`src/views/SkillsView.vue`、`src/views/EventsView.vue`、`src/views/NotFoundView.vue` | 探索/返回链接与品牌文案 |
| `README.md`、本报告、`task_plan.md`、`progress.md`、`findings.md` | 当前规范、架构说明、验收结果与阶段状态 |
| `output/role-alignment/` | 本机验收脚本、JSON、截图与 CSV；不属于生产资源 |

没有新增运行时依赖。场景继续使用同一个创建函数和同一个仿真状态源；移除了场景参数中未使用的单机状态副本，生产产物不包含每帧相机诊断序列化。

## 3. 新增功能与续接修复

- 鼠标视差、拖动旋转、滚轮缩放、真实 Raycaster 悬停/点击聚焦、双击进入对应机器人。
- 根据模型包围球计算聚焦距离；聚焦时隐藏首页文案，点击空白或视角复位恢复大厅构图；全屏居中展示双机。
- HIGH / MEDIUM / LOW 三档画质标签准确，低画质关闭阴影。滚轮或拖动退出自动相机，调整画质不会复位用户的缩放视角。
- 处理平板标题空格、手机状态栏与文案重叠、360px 视口滚动条导致的横向溢出及探索按钮换行。
- 修复工作台“侧视”点击模型后实际透视聚焦、标签仍显示“侧视”的不一致。
- 修复动作库和日志仍返回旧 `/` 工作台地址的问题，改为当前机型页面；暂停或急停后能沿入口回到控制面板。
- 调整地面材质和文案区背景，提高文字对比度，场景操作提示不受文案渐变遮罩影响。

相关行为以当前安装的 Three.js r187 实现为依据，并核对 [OrbitControls 文档](https://threejs.org/docs/pages/OrbitControls.html) 和 [PerspectiveCamera 文档](https://threejs.org/docs/pages/PerspectiveCamera.html)。

## 4. 实际测试结果

最终源码执行 `npm test`：2 个文件、13 项通过；`npm run build`：Vue/TypeScript 类型检查与 Vite 生产构建通过。npm 的 `python / msvs_version` 提醒来自本机已有用户配置，未改动全局配置。

实际浏览器为 Windows / Ego Lite Chromium。以下均为本轮实际执行的结果，未沿用旧工作台 80 项测试作为本轮结论。

| 分组 | 结果 | 证据（`output/role-alignment/`） |
| --- | --- | --- |
| 首页拾取、相机、画质及探索入口 | 17 / 17 | `home-interactions-results.json` / `home-final.mjs` |
| 原有动作、状态、页面、CSV 和资源回归 | 18 / 18 | `routes-regression-results.json` / `routes-final.mjs` |
| 七种布局、全屏、减少动态效果、WebGL 恢复 | 18 / 18 | `layout-recovery-results.json` / `layout-final.mjs` |
| 窄屏、机器狗双击、暂停恢复及日志入口 | 6 / 6 | `final-fixes-results.json` / `final-fixes-check.mjs` |
| 工作台聚焦相机标签回归 | 1 / 1 | `camera-label-results.json` / `camera-label-final.mjs` |
| 生产深链接、实际断网动作与 404 | 11 / 11 | `production-results.json` / `production-final.mjs` |
| 合计 | **71 / 71** | 全部最终记录无失败项 |

布局覆盖 1920×1080、1600×900、1366×768、1024×768、768×1024、390×844、360×800。截图已检查模型完整性、入口位置、文字和控制栏遮挡。手机尺寸使用浏览器视口模拟。

生产双机大厅 1600×900、HIGH 短时采样为 **55 / 60 / 60 / 60 / 60 FPS**；draw calls 590、几何 96、纹理 4。四轮大厅与工作台往返资源计数保持一致，旧 canvas 脱离 DOM，旧 WebGL 上下文全部释放。

使用 `WEBGL_lose_context` 实际触发中断，恢复后只有一个画布并继续渲染。生产断网检查在资源加载后执行挥手，观察到动作及模拟负载更新；检查后已恢复网络。所有最终分组均无应用控制台告警、未捕获异常或 Promise 拒绝。

主要截图：`production-overview.png`、`overview-1366-final.png`、`overview-1024-final.png`、`overview-360-final.png`、`overview-fullscreen.png`、`focus-quadruped.png`、`focus-humanoid.png`、`humanoid-wave-current.png`。实际导出：`telemetry-current.csv`。

脚本共用 `harness.mjs`，其浏览器空间 ID 6 为本轮本机状态，复跑时需使用当前有效的任务空间。初验脚本与失败过程保留，最终结果以上表对应文件为准；等待路由完成、使用正确默认速度和等待 100ms 仿真采样后的测试修正记录在 `findings.md`。

## 5. 未解决的问题与边界

- 本阶段没有已知阻塞问题。真实手机、Safari/Firefox、低端 GPU 与长期压力测试未执行，短时帧率不代表所有设备表现。
- 真实功能：WebGL 三维交互、拾取、相机、机械关节显示、控制流程和 CSV 导出。
- 程序化模拟：两台原创机械模型、原地运动学步态、电量/温度/功率等参数；无外部模型或贴图下载，无真实设备连接。
- 当前模型只是后续阶段的基础。完整内部机械结构、完整动作集、独立手指、爆炸拆解、关节实验、感知点云、自然语言、任务、完整 HUD/性能对比及九阶段最终回归尚未完成。
- AI PERCEPTION、MISSIONS、PERFORMANCE 明确禁用。当前 LAB 的真实能力是基础机器人控制，未将其当作完整全息实验室交付。

## 6. 下一阶段计划

按 ROLE.md 继续阶段二“机器人模型”：在已有模型上补齐承载框架、电池、控制器、散热、传感器与机械连接，建立清晰的部件名称/编号和独立关节层级；完善工业机械比例、材质和灵巧手结构，为阶段三动作及阶段四拆解提供基础。完成后分别在浏览器检查两机多视角、关节连接、材质、遮挡与资源释放，再更新阶段记录。
