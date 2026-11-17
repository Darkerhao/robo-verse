import * as THREE from 'three'
import { mechanicalParts, part } from './RobotParts'
import { armDimensions, joints, rigs } from '@/config/joints'
import { sensorMounts } from '@/config/perception'
import { blendPoses, copyPose } from '@/simulation/kinematics'
import type { RobotId, RobotPose, RobotState } from '@/types/robot'

export interface RobotModel { root: THREE.Group; update: (state: RobotState, dt: number, frozen: boolean) => void }

/** 原创模块化机械模型。所有关节沿局部轴驱动，几何和材质由场景统一释放。 */
export function createRobot(id: RobotId): RobotModel {
  const root = new THREE.Group()
  root.name = id
  root.userData.robotId = id
  const body = part(root, 'body', id === 'quadruped' ? '机器狗承载总成' : '人形骨盆总成', 'frame')
  const { box, cylinder, hull, actuator } = mechanicalParts()

  function leg(x: number, z: number, side: number, human: boolean) {
    const { upper, lower, hipY } = rigs[id]
    const label = `${human ? '' : x > 0 ? '前' : '后'}${side < 0 ? '左' : '右'}腿`
    const key = human ? `${side < 0 ? 'left' : 'right'}-leg` : `${x > 0 ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}`
    const mount = part(body, key, `${label}髋部连接架`, 'frame', [x, hipY, z])
    box(mount, [.17, .1, .15], [0, .025, -side * .055], 'metal', .018)
    const hip = part(mount, 'hip', `${label}髋关节`, 'joint', [0, 0, 0], ['z'])
    actuator(hip, human ? .102 : .117, side)
    const upperLink = part(hip, 'upper-link', `${label}大腿连杆`, 'link')
    box(upperLink, [human ? .11 : .075, upper - .1, .09], [0, -upper / 2, 0], 'dark', .02)
    const upperShell = part(hip, 'upper-shell', `${label}大腿保护壳`, 'shell')
    hull(upperShell, [[-.075, -.06], [.075, -.055], [.049, -upper + .07], [-.04, -upper + .045], [-.073, -upper + .1]], .055, [0, 0, side * .069], 'shell')
    box(upperShell, [.019, upper * .38, .012], [.027, -upper * .38, side * .104], 'accent', .006)
    const knee = part(hip, 'knee', `${label}膝关节`, 'joint', [0, -upper, 0], ['z'])
    actuator(knee, human ? .079 : .082, side)
    const lowerLink = part(knee, 'lower-link', `${label}小腿连杆`, 'link')
    box(lowerLink, [.052, lower - .07, .055], [0, -lower / 2, 0], 'metal', .014)
    const lowerShell = part(knee, 'lower-shell', `${label}小腿保护壳`, 'shell')
    hull(lowerShell, [[-.052, -.075], [.045, -.065], [.029, -lower + .03], [-.025, -lower + .025]], .027, [0, 0, side * .048], human ? 'shell' : 'dark')
    const ankle = part(knee, 'ankle', `${label}${human ? '踝关节' : '足端调平关节'}`, 'joint', [0, -lower, 0], ['z'])
    const foot = part(ankle, 'foot', `${label}${human ? '足部承载结构' : '弹性足端'}`, 'foot')
    if (human) {
      actuator(ankle, .051, side)
      box(foot, [.26, .055, .145], [.035, -.017, 0], 'rubber', .02)
      hull(foot, [[-.075, 0], [.157, 0], [.13, .055], [-.045, .06]], .13, [0, 0, 0], 'shell')
      const pressure = part(foot, 'pressure', `${label}足底压力传感器`, 'sensor')
      for (const px of [-.035, .1]) for (const pz of [-.043, .043]) box(pressure, [.035, .006, .032], [px, -.046, pz], 'accent', .006)
    } else {
      box(foot, [.125, .11, .11], [.008, .002, 0], 'rubber', .042)
      box(foot, [.074, .016, .074], [.008, -.051, 0], 'dark', .012)
    }
  }

  function battery(parent: THREE.Group, position: [number, number, number], size: [number, number, number]) {
    const pack = part(parent, 'battery', '可拆卸电池系统', 'power', position)
    const [w, h, d] = size
    box(pack, [w, .018, d], [0, -h / 2, 0], 'dark', .008)
    for (let n = 0; n < 6; n++) box(pack, [w * .145, h - .015, d * .88], [(n - 2.5) * w / 6, 0, 0], 'metal', .01)
    const cover = part(pack, 'cover', '电池保护盖与快拆把手', 'shell')
    box(cover, [w + .015, .018, d], [0, h / 2, 0], 'dark', .008)
    box(cover, [w * .5, .024, .025], [0, h / 2 + .02, 0], 'accent', .006)
    const bms = part(pack, 'bms', '电池管理板与供电接口', 'controller')
    box(bms, [w * .8, .012, .025], [0, 0, d / 2 + .008], 'circuit', .003)
    for (const x of [-w * .25, w * .25]) cylinder(bms, .008, .012, [x, 0, d / 2 + .027], 'metal')
  }
  function controller(parent: THREE.Group, position: [number, number, number]) {
    const board = part(parent, 'controller', '主控制器与计算板', 'controller', position)
    box(board, [.24, .012, .25], [0, 0, 0], 'circuit', .005)
    for (const x of [-.105, .105]) for (const z of [-.105, .105]) cylinder(board, .007, .052, [x, -.03, z], 'metal', 'y')
    box(board, [.085, .026, .09], [0, .019, 0], 'dark', .004)
    for (let n = 0; n < 5; n++) box(board, [.09, .024, .009], [0, .044, (n - 2) * .018], 'metal', .002)
    for (const x of [-.085, .085]) box(board, [.026, .018, .11], [x, .016, 0], 'dark', .003)
    return board
  }
  function lidar(parent: THREE.Group, position: [number, number, number], scale = 1) {
    const unit = part(parent, 'lidar', '360° 激光雷达', 'sensor', position)
    unit.scale.setScalar(scale)
    cylinder(unit, .10, .025, [0, 0, 0], 'metal', 'y')
    cylinder(unit, .081, .073, [0, .045, 0], 'lens', 'y')
    cylinder(unit, .086, .01, [0, .083, 0], 'light', 'y')
    cylinder(unit, .085, .021, [0, .102, 0], 'dark', 'y')
  }
  function optic(parent: THREE.Group, key: string, name: string, position: [number, number, number], radius: number) {
    const sensor = part(parent, key, name, 'sensor', position)
    cylinder(sensor, radius, .019, [0, 0, 0], 'metal', 'x')
    cylinder(sensor, radius * .76, .024, [.012, 0, 0], 'lens', 'x')
    cylinder(sensor, radius * .24, .025, [.014, 0, 0], 'accent', 'x')
  }

  if (id === 'quadruped') {
    const frame = part(body, 'frame', '纵梁式承载框架', 'frame')
    for (const z of [-.185, .185]) box(frame, [1.32, .07, .042], [0, -.013, z], 'metal', .01)
    for (const x of [-.54, 0, .54]) box(frame, [.048, .075, .41], [x, -.012, 0], 'dark', .01)
    const belly = part(body, 'belly', '下部防护底盘', 'shell')
    hull(belly, [[-.67, -.04], [.65, -.04], [.72, .01], [-.73, .01]], .42, [0, -.05, 0], 'dark')
    battery(body, [-.28, .10, 0], [.43, .14, .3])
    controller(body, [.23, .08, 0])
    const imu = part(body, 'imu', '机身中央 IMU 惯性测量单元', 'sensor', [0, .045, 0])
    box(imu, [.065, .027, .065], [0, 0, 0], 'circuit', .006)
    const roof = part(body, 'roof', '上部保护壳与电池舱盖', 'shell')
    const roofMesh = hull(roof, [[-.7, -.16], [-.58, -.245], [.54, -.245], [.69, -.16], [.69, .16], [.54, .245], [-.58, .245], [-.7, .16]], .023, [0, .255, 0], 'white')
    roofMesh.rotation.x = Math.PI / 2
    box(roof, [.53, .014, .27], [-.23, .275, 0], 'shell', .007)
    box(roof, [.28, .022, .065], [-.23, .293, 0], 'dark', .007)
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? '左' : '右'
      const shell = part(body, `${side < 0 ? 'left' : 'right'}-shell`, `${sideName}侧复合保护壳`, 'shell')
      hull(shell, [[-.68, .025], [.67, .025], [.7, .15], [.54, .245], [-.55, .245], [-.72, .13]], .02, [0, 0, side * .246], 'shell')
      box(shell, [.94, .016, .009], [-.025, .063, side * .264], 'accent', .004)
      const cooling = part(body, `cooling-${side}`, `${sideName}侧散热鳍片`, 'cooling')
      box(cooling, [.30, .15, .065], [-.357, .093, side * .238], 'dark', .008)
      for (let n = 0; n < 7; n++) box(cooling, [.017, .075, .025], [-.48 + n * .041, .16, side * .27], 'dark', .004)
      const plate = part(shell, 'nameplate', `设备铭牌 RV-SIM-001 · ${sideName}`, 'interface')
      box(plate, [.19, .061, .011], [.26, .164, side * .262], 'dark', .006)
      box(plate, [.065, .008, .012], [.24, .172, side * .27], 'metal', .002)
      box(plate, [.023, .008, .012], [.29, .152, side * .27], 'light', .002)
      const sonar = part(body, `ultrasonic-${side}`, `${sideName}侧超声波测距模块`, 'sensor', [.54, .16, side * .266])
      cylinder(sonar, .023, .025, [0, 0, 0], 'metal')
      cylinder(sonar, .016, .03, [0, 0, side * .006], 'dark')
    }
    for (const [x, z] of rigs.quadruped.hips) leg(x!, z!, Math.sign(z!), false)
    const nose = part(body, 'sensor-bridge', '前部传感器安装桥', 'frame', [.723, .12, 0])
    box(nose, [.085, .17, .4], [0, 0, 0], 'dark', .025)
    for (const side of [-1, 1]) optic(nose, `stereo-${side}`, `${side < 0 ? '左' : '右'}目视觉摄像头`, [sensorMounts.quadruped.camera[0] - nose.position.x, sensorMounts.quadruped.camera[1] - nose.position.y, side * .126], .046)
    optic(nose, 'depth', '前向深度摄像头', [.053, -.013, 0], .026)
    const sensorRack = part(body, 'sensor-rack', '雷达承载支架', 'frame')
    for (const z of [-.145, .145]) box(sensorRack, [.034, .24, .027], [.32, .144, z], 'metal', .006)
    box(sensorRack, [.14, .026, .32], [.32, .263, 0], 'dark', .006)
    lidar(body, sensorMounts.quadruped.lidar)
    const wifi = part(body, 'wireless', '无线通信模块与双天线', 'interface')
    box(wifi, [.11, .055, .35], [-.58, .24, 0], 'dark', .008)
    box(wifi, [.035, .21, .3], [-.59, .12, 0], 'metal', .008)
    for (const z of [-.17, .17]) {
      cylinder(wifi, .017, .16, [-.58, .34, z], 'metal', 'y')
      cylinder(wifi, .021, .09, [-.58, .45, z], 'rubber', 'y')
    }
    const ports = part(body, 'ports', '后部供电与数据接口', 'interface', [-.704, .115, 0])
    box(ports, [.03, .15, .32], [0, 0, 0], 'dark', .013)
    for (const z of [-.09, .09]) cylinder(ports, .027, .034, [-.018, 0, z], 'metal', 'x')
  } else {
    // 人形以 +X 为前方，与四足共用相机和足端运动坐标。
    box(body, [.23, .13, .37], [0, 0, 0], 'dark', .045)
    const pelvisShell = part(body, 'pelvis-shell', '骨盆前护板', 'shell')
    hull(pelvisShell, [[-.07, -.08], [.085, -.065], [.11, .06], [-.07, .07]], .27, [.035, 0, 0], 'shell')
    const torso = part(body, 'waist', '腰部旋转与俯仰关节', 'joint', sensorMounts.humanoid.waist, ['y', 'z'])
    cylinder(torso, .116, .10, [0, 0, 0], 'metal', 'y')
    cylinder(torso, .12, .018, [0, .04, 0], 'dark', 'y')
    const spine = part(torso, 'spine', '脊柱与胸部承载框架', 'frame')
    box(spine, [.065, .38, .08], [-.025, .23, 0], 'metal', .012)
    for (const y of [.12, .27, .40]) box(spine, [.20, .028, .32], [0, y, 0], 'dark', .008)
    box(spine, [.16, .065, .54], [0, .335, 0], 'metal', .018)
    battery(torso, [-.104, .235, 0], [.09, .21, .265])
    const board = controller(torso, [.083, .23, 0]); board.rotation.z = Math.PI / 2
    const imu = part(torso, 'imu', '躯干 IMU 惯性测量单元', 'sensor', [0, .068, 0])
    box(imu, [.06, .022, .065], [0, 0, 0], 'circuit', .006)
    for (const side of [-1, 1]) {
      const shell = part(torso, `chest-shell-${side}`, `${side < 0 ? '左' : '右'}胸部复合保护壳`, 'shell')
      hull(shell, [[-.145, .055], [.12, .08], [.18, .35], [.11, .43], [-.155, .41]], .023, [0, 0, side * .178], 'shell')
    }
    const breast = part(torso, 'breastplate', '胸前装甲与状态灯', 'shell')
    box(breast, [.024, .17, .29], [.169, .30, 0], 'white', .015)
    box(breast, [.027, .09, .26], [.185, .31, 0], 'dark', .012)
    box(breast, [.032, .012, .17], [.197, .329, 0], 'light', .005)
    const back = part(torso, 'backplate', '背部电池检修盖', 'shell')
    box(back, [.02, .28, .3], [-.166, .26, 0], 'shell', .009)
    const cooling = part(torso, 'cooling', '背部散热器', 'cooling')
    for (let n = 0; n < 6; n++) box(cooling, [.025, .10, .015], [-.18, .30, -.1 + n * .04], 'dark', .004)
    const ports = part(torso, 'ports', '背部电源与维护接口', 'interface')
    box(ports, [.028, .047, .15], [-.18, .16, 0], 'dark', .005)
    const neck = part(torso, 'neck', '颈部转向关节', 'joint', sensorMounts.humanoid.neck, ['y'])
    cylinder(neck, .063, .12, [0, 0, 0], 'metal', 'y')
    const head = part(neck, 'head', '头部承载骨架', 'frame', sensorMounts.humanoid.head)
    box(head, [.17, .035, .23], [0, -.09, 0], 'metal', .009)
    box(head, [.033, .23, .07], [-.06, 0, 0], 'dark', .01)
    box(head, [.19, .022, .18], [-.01, .12, 0], 'metal', .006)
    const opticalRack = part(head, 'optical-rack', '视觉与雷达安装架', 'frame')
    box(opticalRack, [.025, .18, .224], [.128, .014, 0], 'circuit', .006)
    box(opticalRack, [.21, .02, .21], [.025, -.065, 0], 'metal', .005)
    cylinder(opticalRack, .037, .027, [-.012, .141, 0], 'metal', 'y')
    const skull = part(head, 'shell', '头部复合外壳', 'shell')
    for (const z of [-.123, .123]) hull(skull, [[-.12, -.09], [-.08, -.14], [.1, -.12], [.14, -.035], [.10, .12], [-.075, .14], [-.125, .065]], .018, [0, 0, z], 'shell')
    box(skull, [.19, .028, .245], [-.01, .124, 0], 'white', .012)
    box(skull, [.025, .19, .235], [-.116, .005, 0], 'shell', .012)
    const face = part(head, 'face', '视觉面罩', 'shell')
    box(face, [.032, .115, .237], [.137, .014, 0], 'dark', .014)
    for (const side of [-1, 1]) optic(head, `stereo-${side}`, `${side < 0 ? '左' : '右'}目视觉摄像头`, [sensorMounts.humanoid.camera[0], sensorMounts.humanoid.camera[1], side * .072], .026)
    optic(head, 'depth', '头部深度摄像头', [.16, -.02, 0], .019)
    const voice = part(head, 'voice', '麦克风与语音扬声器', 'sensor')
    for (const z of [-.05, -.025, 0, .025, .05]) box(voice, [.018, .006, .012], [.138, -.076, z], 'dark', .002)
    const indicator = part(head, 'status', '头部状态指示灯', 'interface')
    box(indicator, [.016, .01, .16], [.141, .098, 0], 'light', .004)
    lidar(head, sensorMounts.humanoid.lidar, sensorMounts.humanoid.scale)
    for (const side of [-1, 1]) {
      const [legX, legZ] = rigs.humanoid.hips[side < 0 ? 0 : 1]!
      leg(legX!, legZ!, side, true)
      const label = side < 0 ? '左' : '右'
      const shoulder = part(torso, `${side < 0 ? 'left' : 'right'}-shoulder`, `${label}肩关节`, 'joint', [0, .335, side * .27], ['x', 'z'])
      actuator(shoulder, .1, side)
      const upper = part(shoulder, 'upper-link', `${label}上臂连杆`, 'link')
      box(upper, [.064, .27, .067], [0, -.20, 0], 'metal', .016)
      const shell = part(shoulder, 'upper-shell', `${label}肩部及上臂护甲`, 'shell')
      hull(shell, [[-.084, -.02], [.076, -.02], [.078, -.15], [.05, -.3], [-.048, -.3], [-.083, -.12]], .048, [0, 0, side * .055], 'shell')
      const elbow = part(shoulder, 'elbow', `${label}肘关节`, 'joint', [0, -armDimensions.upper, 0], ['z'])
      actuator(elbow, .064, side)
      const forearm = part(elbow, 'forearm', `${label}前臂框架`, 'link')
      box(forearm, [.065, .205, .07], [0, -.16, 0], 'metal', .015)
      const forearmShell = part(elbow, 'forearm-shell', `${label}前臂保护壳`, 'shell')
      hull(forearmShell, [[-.052, -.07], [.061, -.065], [.047, -.25], [-.038, -.26]], .035, [0, 0, side * .054], 'shell')
      box(forearmShell, [.012, .07, .035], [.065, -.14, side * .045], 'dark', .004)
      const wrist = part(elbow, 'wrist', `${label}腕关节`, 'joint', [0, -armDimensions.forearm, 0], ['y'])
      cylinder(wrist, .042, .045, [0, 0, 0], 'metal', 'y')
      const palm = part(wrist, 'palm', `${label}手掌`, 'hand', [0, -armDimensions.palm, 0])
      box(palm, [.063, .104, .105], [0, 0, 0], 'dark', .015)
      box(palm, [.012, .077, .09], [-.037, 0, 0], 'shell', .006)
      // 各指根/指间关节由统一目录绑定到仿真角度，拇指保留机械安装倾角。
      for (let n = 0; n < 5; n++) {
        const thumb = n === 4
        const finger = part(palm, thumb ? 'thumb' : `finger-${n + 1}`, `${label}手${['食指', '中指', '无名指', '小指', '拇指'][n]}指根`, 'joint', thumb ? [.002, -.008, -side * .068] : [0, -.058, (n - 1.5) * .027], ['z'])
        if (thumb) finger.rotation.x = side * .55
        const lengths = thumb ? [.033, .027] : [.032, .025, n === 3 ? .016 : .022]
        let parent = finger
        lengths.forEach((length, segment) => {
          const hinge = segment ? part(parent, `hinge-${segment}`, `${label}手第 ${n + 1} 指第 ${segment} 指间关节`, 'joint', [0, -lengths[segment - 1]!, 0], ['z']) : parent
          cylinder(hinge, .010, .024, [0, 0, 0], 'metal')
          const link = part(hinge, 'phalanx', `${label}手第 ${n + 1} 指第 ${segment + 1} 指节`, 'hand')
          box(link, [.021, length - .007, .020], [0, -length / 2, 0], segment === 1 ? 'metal' : 'shell', .006)
          parent = hinge
        })
      }
    }
  }

  const bindings = joints[id].map(definition => {
    const node = root.getObjectByName(definition.path)
    if (!node) throw new Error(`缺少机械关节节点：${definition.path}`)
    return { node, axis: definition.axis }
  })
  let displayed: RobotPose | undefined
  return { root, update(state, dt, frozen) {
    const smoothing = displayed && !frozen ? 1 - Math.exp(-dt * 14) : 1
    // 只插值适配器的已确认姿态；不在渲染层生成步态、手臂或手指动作。
    displayed = displayed ? blendPoses(id, displayed, state, smoothing, state.controlMode === 'motion') : copyPose(state)
    body.position.fromArray(displayed.position)
    body.rotation.set(displayed.roll, 0, displayed.pitch)
    const targetYaw = -state.heading * Math.PI / 180
    const difference = Math.atan2(Math.sin(targetYaw - root.rotation.y), Math.cos(targetYaw - root.rotation.y))
    root.rotation.y += difference * smoothing
    bindings.forEach(({ node, axis }, index) => { node.rotation[axis] = displayed!.joints[index]! })
  } }
}
