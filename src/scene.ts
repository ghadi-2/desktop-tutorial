import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { rooms, pois, type Floor, type Point, type Room } from './data'

type Dimension = '2d' | '3d'
type Mode = 'exterior' | 'interior'
type Callbacks = {
  onEnter: () => void
  onSelect: (id: string, type: 'room' | 'poi') => void
  onError: (message: string) => void
}
type Label = {
  element: HTMLButtonElement
  position: THREE.Vector3
  id: string
  type: 'room' | 'poi' | 'entrance'
  floor?: Floor
  priority: number
}
type CameraMove = {
  start: number
  from: THREE.Vector3
  to: THREE.Vector3
  targetFrom: THREE.Vector3
  targetTo: THREE.Vector3
}

const footprint: Point[] = [
  { x: 9, z: -30 }, { x: 28, z: -30 }, { x: 28, z: 30 },
  { x: -28, z: 30 }, { x: -28, z: 0 }, { x: 9, z: 0 },
]
const roomIcons: Record<string, string> = {
  lab: 'M6 3v6l-3 6a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-3-6V3M5 3h10M5 14h10',
  classroom: 'M3 4h16v11H3zM7 19l4-4 4 4',
  office: 'M4 8h14v11H4zM8 8V4h6v4M4 12h14',
  meeting: 'M5 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 19v-5a3 3 0 0 1 6 0v5m6 0v-5a3 3 0 0 1 6 0v5M8 13h6',
  library: 'M3 4h6l2 2 2-2h6v14h-6l-2 2-2-2H3zM11 6v14',
  service: 'M11 3v16M3 11h16',
  sports: 'M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18M2 11h18M11 2c-5 5-5 13 0 18m0-18c5 5 5 13 0 18',
  theater: 'M3 5l7 2v7a4 4 0 0 1-7 0zM12 5l7-2v11a4 4 0 0 1-7 0zM5 10h2m7-2h2',
  elevator: 'M3 2h16v18H3zM8 14V6m-3 3 3-3 3 3m3-1v8m-3-3 3 3 3-3',
  stairs: 'M2 18h6v-5h5V8h5V3h3M4 5l11 11M4 5v5m0-5h5',
  restroom: 'M7 4h.1m8 0h.1M7 8v8m-3-4 3-4 3 4m5-4v8m-3-4 3-4 3 4M7 16v4m8-4v4',
  exit: 'M10 3H3v17h7m1-9h9m-4-4 4 4-4 4',
  fire: 'M11 2c1 6-5 7-5 12a5 5 0 0 0 10 0c0-2-1-4-3-5 0 3-3 4-3 1 0-2 2-4 1-8z',
  entrance: 'M4 20V3h13v17M2 20h18M12 11h.1',
}

function shapeFrom(points: Point[]): THREE.Shape {
  const shape = new THREE.Shape()
  points.forEach((point, index) => index === 0 ? shape.moveTo(point.x, -point.z) : shape.lineTo(point.x, -point.z))
  shape.closePath()
  return shape
}

function roomContour(room: Room): Point[] {
  const polygon = (room as Room & { polygon?: Point[] }).polygon
  return polygon ?? [
    { x: room.x - room.width / 2, z: room.z - room.depth / 2 },
    { x: room.x + room.width / 2, z: room.z - room.depth / 2 },
    { x: room.x + room.width / 2, z: room.z + room.depth / 2 },
    { x: room.x - room.width / 2, z: room.z + room.depth / 2 },
  ]
}

/** Procedural, map-style viewer: the camera orbits the model; it is never a walking game. */
export class CollegeScene {
  private container: HTMLElement
  private callbacks: Callbacks
  private renderer: THREE.WebGLRenderer | null = null
  private scene = new THREE.Scene()
  private perspective = new THREE.PerspectiveCamera(39, 1, 0.1, 500)
  private orthographic = new THREE.OrthographicCamera(-50, 50, 45, -45, 0.1, 400)
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspective
  private controls: OrbitControls | null = null
  private outside = new THREE.Group()
  private interiors: Record<Floor, THREE.Group> = { 0: new THREE.Group(), 1: new THREE.Group(), 2: new THREE.Group() }
  private routeGroup = new THREE.Group()
  private labelLayer: HTMLDivElement
  private labels: Label[] = []
  private pickables: THREE.Object3D[] = []
  private floorMeshes = new Map<string, THREE.Mesh>()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private pointerStart = { x: 0, y: 0 }
  private observer: ResizeObserver | null = null
  private mode: Mode = 'exterior'
  private floor: Floor = 0
  private dimension: Dimension = '3d'
  private selection: string | null = null
  private route: { floor: Floor, points: Point[] }[] | null = null
  private move: CameraMove | null = null
  private frame = 0
  private lastDraw = 0
  private disposed = false
  private routeDots: { mesh: THREE.Mesh, points: THREE.Vector3[], length: number, offset: number }[] = []
  private routeEnds: THREE.Mesh[] = []
  private materials = new Map<string, THREE.MeshStandardMaterial>()

  constructor(container: HTMLElement, callbacks: Callbacks) {
    this.container = container
    this.callbacks = callbacks
    this.labelLayer = document.createElement('div')
    this.labelLayer.className = 'scene-label-layer'
    Object.assign(this.labelLayer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '2' })
    container.append(this.labelLayer)
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.08
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      this.renderer.shadowMap.autoUpdate = false
      this.renderer.domElement.className = 'college-canvas'
      this.renderer.domElement.setAttribute('aria-label', 'مجسم تفاعلي للكلية؛ اسحب للتدوير، واستخدم العجلة للتكبير، واضغط على المدخل أو المرافق')
      this.renderer.domElement.style.display = 'block'
      this.renderer.domElement.style.width = '100%'
      this.renderer.domElement.style.height = '100%'
      this.renderer.domElement.style.touchAction = 'none'
      this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
      container.prepend(this.renderer.domElement)
    } catch {
      queueMicrotask(() => callbacks.onError('تعذر تشغيل العرض ثلاثي الأبعاد على هذا الجهاز. يمكنك استخدام الخريطة الثنائية الأبعاد.'))
      return
    }
    this.scene.background = new THREE.Color('#e8eee7')
    this.scene.fog = new THREE.Fog('#e8eee7', 175, 310)
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#d1d7bf', 2.25))
    const sunlight = new THREE.DirectionalLight('#fff6e7', 3.1)
    sunlight.position.set(-40, 90, 60)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(1536, 1536)
    Object.assign(sunlight.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 230 })
    sunlight.shadow.normalBias = 0.16
    sunlight.shadow.bias = -0.00015
    this.scene.add(sunlight)
    const fill = new THREE.DirectionalLight('#d6efff', 0.85)
    fill.position.set(45, 35, -45)
    this.scene.add(fill)
    this.scene.add(this.outside, ...Object.values(this.interiors), this.routeGroup)
    this.buildOutside()
    this.buildInteriors()
    this.scene.add(this.makeGround())
    this.bindControls()
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.resize()
    this.applyVisibility()
    this.reset(false)
    this.renderer.shadowMap.needsUpdate = true
    this.frame = requestAnimationFrame(this.animate)
  }

  private material(color: string | number, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial {
    const key = `${color}-${roughness}-${metalness}`
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }))
    return this.materials.get(key)!
  }

  private box(parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, color: string | number, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.material(color))
    mesh.position.set(x, y, z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private slab(parent: THREE.Object3D, points: Point[], y: number, depth: number, color: string | number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shapeFrom(points), { depth, bevelEnabled: false }), this.material(color))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = y
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  private makeGround(): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(450, 450), this.material('#e8eee7'))
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = -0.16
    mesh.receiveShadow = true
    return mesh
  }

  private buildOutside(): void {
    // A three-storey L-shaped college, rather than a textured box.
    const bodyHeight = 4.55
    this.slab(this.outside, footprint, -0.05, 0.36, '#dddccb')
    const entranceCutout: Point[] = [
      { x: 9, z: -30 }, { x: 28, z: -30 }, { x: 28, z: -12 },
      { x: 25, z: -12 }, { x: 25, z: -2 }, { x: 28, z: -2 },
      { x: 28, z: 30 }, { x: -28, z: 30 }, { x: -28, z: 0 }, { x: 9, z: 0 },
    ]
    for (let floor = 0; floor < 3; floor++) {
      this.slab(this.outside, floor === 0 ? entranceCutout : footprint, floor * bodyHeight + 0.32, bodyHeight - 0.18, '#f4efdf')
      this.slab(this.outside, footprint, floor * bodyHeight + 0.23, 0.21, '#c9cebc')
      this.facadeWindows(floor * bodyHeight)
    }
    this.slab(this.outside, footprint, 13.82, 0.36, '#faf8eb')
    this.slab(this.outside, footprint, 14.18, 0.10, '#dfe4d5')
    // Roof parapets trace the actual footprint.
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length]
      this.wall(this.outside, a, b, 14.32, 0.42, 0.3, '#f9f5e7')
    }
    // Roof garden, screened equipment and solar shade pergola.
    this.box(this.outside, -11, 14.32, 17, 23, 0.26, 14, '#a8bc95')
    this.box(this.outside, -17, 14.56, 8, 9, 0.5, 1.2, '#748f71')
    this.box(this.outside, -22, 14.56, 19, 1.2, 0.5, 16, '#748f71')
    for (const x of [-18, -4]) for (const z of [12, 24]) this.box(this.outside, x, 15.45, z, 0.24, 2.3, 0.24, '#ad9f79')
    for (let z = 11; z <= 25; z += 1.15) this.box(this.outside, -11, 16.65, z, 15, 0.14, 0.36, '#c7b98e')
    this.box(this.outside, 18, 14.65, 16, 10, 0.75, 9, '#d2d7c9')
    for (let z = 13; z <= 19; z += 2) this.box(this.outside, 18, 15.05, z, 8, 0.06, 0.45, '#aeb8a9')
    // The ground-floor auditorium occupies the confirmed west-side extension.
    const theaterRoom = rooms.find(room => room.floor === 0 && room.kind === 'theater')
    const theater: Point[] = theaterRoom ? roomContour(theaterRoom) : [{ x: 9, z: 0 }, { x: -10, z: 0 }, { x: -10, z: -17 }, { x: 9, z: -17 }]
    this.slab(this.outside, theater, 0.3, 5.2, '#e5ddc7')
    this.slab(this.outside, theater, 5.5, 0.28, '#cbd3bc')
    for (let x = -9; x <= 6; x += 2) this.box(this.outside, x, 2.85, -17.05, 0.3, 4.7, 0.19, '#b7b390')
    // A glazed entrance pavilion projects from the east façade.
    const glass = new THREE.MeshPhysicalMaterial({ color: '#78a69a', roughness: 0.14, metalness: 0.12, transparent: true, opacity: 0.63, side: THREE.DoubleSide })
    const entry = new THREE.Group()
    this.outside.add(entry)
    this.box(entry, 29.7, 0.24, -7, 6, 0.25, 11, '#e7e5d6')
    for (const z of [-12.1, -1.9]) this.box(entry, 30, 2.8, z, 0.3, 5.6, 0.3, '#596d65')
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(4.0, 4.9, 0.10), glass)
    sideGlass.position.set(30.0, 2.75, -12)
    entry.add(sideGlass)
    const sideGlass2 = sideGlass.clone()
    sideGlass2.position.z = -2
    entry.add(sideGlass2)
    for (const z of [-10.8, -3.2]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.9, 2.5), glass)
      panel.position.set(32, 2.75, z)
      entry.add(panel)
    }
    for (const z of [-8.25, -5.75]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.0, 2.35), glass)
      door.position.set(32.06, 2.3, z)
      door.userData.action = 'enter'
      this.pickables.push(door)
      entry.add(door)
      this.box(entry, 32.17, 2.25, z + (z < -7 ? 0.7 : -0.7), 0.13, 0.85, 0.10, '#fafaf1', false)
    }
    for (const z of [-9.5, -7, -4.5]) this.box(entry, 32.13, 2.45, z, 0.15, 4.9, 0.10, '#526b63')
    this.box(entry, 31, 5.75, -7, 8.7, 0.3, 12.4, '#f5f0df')
    this.box(entry, 31, 5.95, -7, 8.7, 0.1, 12.4, '#849b7d')
    this.box(entry, 32.25, 4.85, -7, 0.16, 0.4, 9.7, '#687e72')
    this.box(entry, 34.3, 0.10, -7, 3, 0.20, 10, '#d8d9c8')
    this.box(entry, 35.3, -0.01, -7, 1, 0.10, 11, '#d8d9c8')
    this.addLabel('entrance', 'المدخل الرئيسي', 'entrance', new THREE.Vector3(32.3, 7.8, -7), undefined, 100, '#3178f5')
    // Broad pedestrian paths and a small parking court give the building context.
    this.box(this.outside, 42, -0.04, -7, 17, 0.16, 13, '#f1eee1', false)
    this.box(this.outside, 48, -0.07, 12, 9, 0.12, 46, '#eeeade', false)
    this.box(this.outside, 0, -0.06, 37, 72, 0.12, 8, '#eeebdf', false)
    this.box(this.outside, 63, -0.04, 10, 16, 0.13, 62, '#ced6ce', false)
    for (let z = -19; z <= 38; z += 8) {
      this.box(this.outside, 62, 0.04, z, 13, 0.04, 0.12, '#f6f8ef', false)
      if (z !== -3 && z !== 21) this.car(62.5, z + 3, ['#e8eddf', '#8ca69a', '#acbdc4'][(Math.floor(z + 19) / 8) % 3])
    }
    for (let z = -27; z <= 28; z += 11) this.tree(39, z, z < 0 ? 0.9 : 1)
    for (let x = -33; x <= 30; x += 11) this.tree(x, 41, 0.85)
    this.tree(-36, 11, 1.1)
    this.tree(-36, 27, 0.9)
    this.tree(12, -39, 1.0)
    this.tree(27, -39, 0.9)
    for (const [x, z] of [[36, -19], [36, 7], [-27, 36], [19, 37]]) this.bench(x, z)
    for (let z = -22; z <= 31; z += 16) {
      this.box(this.outside, 52.5, 1.9, z, 0.15, 3.8, 0.15, '#758278')
      this.box(this.outside, 52.5, 3.82, z, 0.8, 0.12, 0.8, '#f5eed9')
    }
  }

  private facadeWindows(base: number): void {
    const glass = this.material('#75958b', 0.28, 0.18)
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length]
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz)
      const count = Math.max(1, Math.floor(length / 5.3))
      const normal = new THREE.Vector3(dz / length, 0, -dx / length)
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count
        const x = a.x + dx * t + normal.x * 0.08
        const z = a.z + dz * t + normal.z * 0.08
        if (i === 1 && base === 0 && z > -13 && z < -1) continue
        const width = Math.min(3.5, length / count - 1.1)
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, 0.12), glass)
        mesh.position.set(x, base + 2.58, z)
        mesh.rotation.y = Math.atan2(-dz, dx)
        this.outside.add(mesh)
        const sill = this.box(this.outside, x, base + 1.28, z, width + 0.30, 0.18, 0.47, '#e7e2ce')
        sill.rotation.y = mesh.rotation.y
        const top = this.box(this.outside, x, base + 3.9, z, width + 0.3, 0.15, 0.37, '#e7e2ce')
        top.rotation.y = mesh.rotation.y
        const mullion = this.box(this.outside, x + normal.x * 0.085, base + 2.55, z + normal.z * 0.085, 0.08, 2.6, 0.16, '#d5dbcb', false)
        mullion.rotation.y = mesh.rotation.y
      }
    }
  }

  private tree(x: number, z: number, scale = 1): void {
    const group = new THREE.Group()
    group.position.set(x, 0, z)
    group.scale.setScalar(scale)
    this.outside.add(group)
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.7, 0.35, 18), this.material('#d8dfcc'))
    planter.position.y = 0.05
    planter.receiveShadow = true
    group.add(planter)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.35, 4.5, 7), this.material('#bba280'))
    trunk.position.y = 2.25
    trunk.castShadow = true
    group.add(trunk)
    for (const [px, py, pz, radius] of [[0, 5.2, 0, 2.3], [-1.1, 4.7, 0.2, 1.7], [0.8, 4.9, 0.7, 1.6], [0.3, 5.0, -1, 1.5]]) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), this.material(py > 5 ? '#83a182' : '#97af8f'))
      crown.position.set(px, py, pz)
      crown.castShadow = true
      group.add(crown)
    }
  }

  private bench(x: number, z: number): void {
    this.box(this.outside, x, 0.65, z, 3.3, 0.15, 1, '#ac9270')
    this.box(this.outside, x, 1.15, z + 0.45, 3.3, 0.9, 0.12, '#c3ac84')
    for (const px of [-1.2, 1.2]) this.box(this.outside, x + px, 0.32, z, 0.22, 0.65, 0.72, '#7a8678')
  }

  private car(x: number, z: number, color: string): void {
    this.box(this.outside, x, 0.65, z, 3.7, 0.85, 1.95, color)
    this.box(this.outside, x - 0.2, 1.15, z, 1.9, 0.65, 1.65, '#667e78')
    this.box(this.outside, x - 0.2, 1.5, z, 1.95, 0.12, 1.68, color)
    for (const px of [-1.2, 1.2]) for (const pz of [-0.92, 0.92]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.18, 10), this.material('#53645c'))
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x + px, 0.35, z + pz)
      this.outside.add(wheel)
    }
  }

  private wall(parent: THREE.Object3D, a: Point, b: Point, base: number, height: number, thickness: number, color: string): THREE.Mesh | null {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < 0.02) return null
    const mesh = this.box(parent, (a.x + b.x) / 2, base + height / 2, (a.z + b.z) / 2, length, height, thickness, color)
    mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x)
    return mesh
  }

  private buildInteriors(): void {
    for (const floor of [0, 1, 2] as Floor[]) {
      const group = this.interiors[floor]
      this.slab(group, footprint, 0, 0.20, '#eeeee2')
      const theater = rooms.find(room => room.floor === floor && room.kind === 'theater')
      if (theater) this.slab(group, roomContour(theater), 0, 0.20, '#eeeee2')
      this.interiorTiles(group)
      // A low border outlines the building while preserving the cutaway view.
      for (let i = 0; i < footprint.length; i++) this.wall(group, footprint[i], footprint[(i + 1) % footprint.length], 0.20, 0.4, 0.22, '#d5d9cd')
      for (const room of rooms.filter(room => room.floor === floor)) this.buildRoom(room, group)
      for (const poi of pois.filter(poi => poi.floor === floor)) {
        const color = poi.kind === 'fire' ? '#e59478' : poi.kind === 'restroom' ? '#8397b8' : poi.kind === 'exit' ? '#548e74' : '#3883df'
        const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 24), this.material(color))
        marker.position.set(poi.x, 0.36, poi.z)
        marker.userData.select = { id: poi.id, type: 'poi' }
        marker.receiveShadow = true
        group.add(marker)
        this.pickables.push(marker)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.10, 6, 24), this.material('#ffffff'))
        ring.rotation.x = Math.PI / 2
        ring.position.copy(marker.position).add(new THREE.Vector3(0, 0.12, 0))
        group.add(ring)
        if (poi.kind === 'elevator') {
          const lift = this.box(group, poi.x, 1.1, poi.z, 2.0, 1.7, 2.0, '#d7e6e6')
          lift.userData.select = { id: poi.id, type: 'poi' }
          this.pickables.push(lift)
          this.box(group, poi.x, 1.15, poi.z + 1.01, 1.6, 1.7, 0.04, '#8caaa7', false)
          this.box(group, poi.x, 1.15, poi.z + 1.05, 0.035, 1.7, 0.03, '#f7fbf4', false)
        } else if (poi.kind === 'stairs') {
          for (let i = 0; i < 7; i++) this.box(group, poi.x, 0.28 + i * 0.12, poi.z - 1.1 + i * 0.35, 1.9, 0.15 + i * 0.24, 0.35, '#bbc9bd')
        }
        this.addLabel(poi.id, poi.kind === 'entrance' ? 'أنت هنا' : poi.name, 'poi', new THREE.Vector3(poi.x, 2.5, poi.z), floor, poi.kind === 'entrance' ? 85 : poi.kind === 'elevator' ? 70 : 45, color, poi.kind)
      }
    }
  }

  private interiorTiles(group: THREE.Group): void {
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#dfe3d7', transparent: true, opacity: 0.42 })
    const vertices: number[] = []
    for (let x = -28; x <= 28; x += 2) {
      vertices.push(x, 0.215, x < 9 ? 0 : -30, x, 0.215, 30)
    }
    for (let z = -30; z <= 30; z += 2) vertices.push(z < 0 ? 9 : -28, 0.215, z, 28, 0.215, z)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    group.add(new THREE.LineSegments(geometry, lineMaterial))
  }

  private buildRoom(room: Room, parent: THREE.Group): void {
    const group = new THREE.Group()
    parent.add(group)
    const contour = roomContour(room)
    const surface = this.slab(group, contour, 0.21, 0.06, room.color)
    surface.material = new THREE.MeshStandardMaterial({ color: room.color, roughness: 0.88 })
    surface.userData.select = { id: room.id, type: 'room' }
    this.floorMeshes.set(room.id, surface)
    this.pickables.push(surface)
    // The closest perimeter segment gets a real opening, including irregular rooms.
    let doorSegment = 0, bestDistance = Infinity, doorT = 0.5
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length]
      const dx = b.x - a.x, dz = b.z - a.z
      const t = THREE.MathUtils.clamp(((room.door.x - a.x) * dx + (room.door.z - a.z) * dz) / (dx * dx + dz * dz), 0, 1)
      const distance = Math.hypot(room.door.x - a.x - dx * t, room.door.z - a.z - dz * t)
      if (distance < bestDistance) { bestDistance = distance; doorSegment = i; doorT = t }
    }
    const wallColor = '#fcfaf0'
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i], b = contour[(i + 1) % contour.length]
      if (i !== doorSegment) this.wall(group, a, b, 0.27, 2.2, 0.17, wallColor)
      else {
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        const gap = Math.min(1.75, length * 0.5)
        const half = gap / (2 * length)
        const t1 = THREE.MathUtils.clamp(doorT - half, 0.02, 0.98)
        const t2 = THREE.MathUtils.clamp(doorT + half, 0.02, 0.98)
        const p1 = { x: a.x + (b.x - a.x) * t1, z: a.z + (b.z - a.z) * t1 }
        const p2 = { x: a.x + (b.x - a.x) * t2, z: a.z + (b.z - a.z) * t2 }
        this.wall(group, a, p1, 0.27, 2.2, 0.17, wallColor)
        this.wall(group, p2, b, 0.27, 2.2, 0.17, wallColor)
        this.wall(group, p1, p2, 2.17, 0.30, 0.20, '#d9dfce')
        this.wall(group, p1, p2, 0.275, 0.035, 0.52, '#c0cbb8')
        // A small swing arc makes the doorway legible on the overhead map.
        const startAngle = Math.atan2(b.z - a.z, b.x - a.x)
        const curve = new THREE.EllipseCurve(p1.x, p1.z, gap * 0.82, gap * 0.82, startAngle, startAngle + Math.PI / 2, false, 0)
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(14).map(point => new THREE.Vector3(point.x, 0.31, point.y))), new THREE.LineBasicMaterial({ color: '#90a38d', transparent: true, opacity: 0.65 }))
        group.add(line)
      }
    }
    this.furnish(room, group)
    // Clicking walls or furniture selects the same room as its floor and label.
    group.traverse(object => {
      if (object instanceof THREE.Mesh && object !== surface) {
        object.userData.select = { id: room.id, type: 'room' }
        this.pickables.push(object)
      }
    })
    this.addLabel(room.id, room.name, 'room', new THREE.Vector3(room.x, 3.0, room.z), room.floor, room.kind === 'service' ? 15 : 30, room.color, room.kind)
  }

  private furnish(room: Room, group: THREE.Group): void {
    if (room.width < 3.5 || room.depth < 3.5) return
    const width = Math.min(room.width - 1.8, 8)
    const depth = Math.min(room.depth - 2.3, 10)
    if (room.kind === 'lab' || room.kind === 'classroom') {
      const rows = Math.max(1, Math.min(3, Math.floor(depth / 2.25)))
      const cols = Math.max(1, Math.min(3, Math.floor(width / 2.2)))
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const x = room.x + (col - (cols - 1) / 2) * 2.25
        const z = room.z + (row - (rows - 1) / 2) * 2.2 + 0.3
        this.box(group, x, 0.88, z, 1.65, 0.13, 0.8, '#f3f2e7', false)
        this.box(group, x, 0.52, z, 0.1, 0.66, 0.60, '#b4bdaa', false)
        this.box(group, x, 0.56, z + 0.7, 0.55, 0.12, 0.55, '#7d9690', false)
        if (room.kind === 'lab') {
          this.box(group, x, 1.12, z - 0.12, 0.65, 0.38, 0.09, '#627c79', false)
          this.box(group, x, 0.99, z + 0.15, 0.65, 0.05, 0.26, '#a8b8ae', false)
        }
      }
      this.box(group, room.x, 1.05, room.z - room.depth / 2 + 0.22, Math.min(3.5, room.width - 1), 1.2, 0.05, '#8caba0', false)
    } else if (room.kind === 'library') {
      for (let x = -width / 2 + 0.5; x < width / 2; x += 2.25) {
        this.box(group, room.x + x, 1.05, room.z, 0.65, 1.5, depth - 0.7, '#c5b895', false)
        for (let y = 0.5; y < 1.7; y += 0.4) this.box(group, room.x + x, y, room.z, 0.73, 0.07, depth - 0.5, '#ebdec1', false)
      }
    } else if (room.kind === 'office' || room.kind === 'meeting') {
      this.box(group, room.x, 0.93, room.z, Math.min(3.8, width * 0.8), 0.18, Math.min(1.8, depth * 0.5), '#dbcaac', false)
      const seats = room.kind === 'meeting' ? 4 : 2
      for (let i = 0; i < seats; i++) this.box(group, room.x + (i % 2 === 0 ? -1 : 1), 0.62, room.z + (i < 2 ? 1.25 : -1.25), 0.65, 0.18, 0.65, '#8faaa1', false)
    } else if (room.kind === 'sports') {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(room.x - width / 2, 0.3, room.z - depth / 2), new THREE.Vector3(room.x + width / 2, 0.3, room.z - depth / 2),
        new THREE.Vector3(room.x + width / 2, 0.3, room.z + depth / 2), new THREE.Vector3(room.x - width / 2, 0.3, room.z + depth / 2),
        new THREE.Vector3(room.x - width / 2, 0.3, room.z - depth / 2),
      ])
      group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 })))
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.07, 40), this.material('#ffffff'))
      ring.rotation.x = -Math.PI / 2
      ring.position.set(room.x, 0.30, room.z)
      group.add(ring)
    } else if (room.kind === 'theater') {
      for (let row = 0; row < 5; row++) {
        const z = room.z + (row - 2) * 1.65
        const seatWidth = Math.min(room.width - 5, 11)
        this.box(group, room.x, 0.33 + row * 0.08, z, seatWidth, 0.10 + row * 0.1, 1.3, '#d5cabc', false)
        for (let x = -seatWidth / 2 + 0.6; x < seatWidth / 2; x += 1.25) {
          this.box(group, room.x + x, 0.72 + row * 0.13, z, 0.8, 0.3, 0.6, '#9584a4', false)
          this.box(group, room.x + x, 0.95 + row * 0.13, z + 0.27, 0.8, 0.6, 0.13, '#a394b0', false)
        }
      }
    }
  }

  private addLabel(id: string, text: string, type: Label['type'], position: THREE.Vector3, floor?: Floor, priority = 20, color = '#3883df', kind: string = type): void {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = `scene-label scene-label--${type}`
    element.dataset.id = id
    element.dataset.kind = kind
    element.setAttribute('aria-label', text)
    element.title = text
    element.dir = 'rtl'
    Object.assign(element.style, {
      position: 'absolute', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
      padding: type === 'entrance' ? '10px 15px' : '6px 9px', borderRadius: type === 'entrance' ? '14px' : '9px',
      border: '1px solid rgba(255,255,255,.92)', background: type === 'entrance' ? '#2c75ee' : 'rgba(255,255,255,.94)',
      color: type === 'entrance' ? '#ffffff' : '#29453b', fontFamily: 'inherit', fontSize: type === 'entrance' ? '13px' : '10px',
      fontWeight: '650', cursor: 'pointer', boxShadow: '0 3px 13px rgba(47,67,51,.12)', whiteSpace: 'nowrap',
      maxWidth: type === 'entrance' ? '210px' : '152px', transform: 'translate(-50%,-50%)', lineHeight: '1.5',
    })
    const icon = document.createElement('span')
    Object.assign(icon.style, { display: 'grid', placeItems: 'center', width: type === 'entrance' ? '25px' : '20px', height: type === 'entrance' ? '25px' : '20px', flexShrink: '0', borderRadius: '7px', background: type === 'entrance' ? 'rgba(255,255,255,.18)' : `${color}33`, color: type === 'entrance' ? '#ffffff' : '#55786b' })
    icon.innerHTML = `<svg width="15" height="15" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${roomIcons[kind] || roomIcons.classroom}"/></svg>`
    const name = document.createElement('span')
    name.textContent = text
    Object.assign(name.style, { overflow: 'hidden', textOverflow: 'ellipsis' })
    element.append(icon, name)
    if (type === 'entrance') {
      const arrow = document.createElement('span')
      arrow.textContent = '←'
      arrow.style.marginInlineStart = '4px'
      element.append(arrow)
    }
    element.addEventListener('click', event => {
      event.stopPropagation()
      if (type === 'entrance') this.callbacks.onEnter()
      else this.callbacks.onSelect(id, type)
    })
    this.labelLayer.append(element)
    this.labels.push({ element, position, id, type, floor, priority })
  }

  private bindControls(): void {
    if (!this.renderer) return
    this.controls?.dispose()
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.renderer.domElement.style.cursor = this.dimension === '3d' ? 'grab' : 'move'
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.enableRotate = this.dimension === '3d'
    this.controls.screenSpacePanning = true
    this.controls.minDistance = 24
    this.controls.maxDistance = 195
    this.controls.minZoom = 0.55
    this.controls.maxZoom = 4.5
    this.controls.minPolarAngle = this.dimension === '2d' ? 0 : 0.22
    this.controls.maxPolarAngle = this.dimension === '2d' ? Math.PI : Math.PI * 0.475
    this.controls.panSpeed = 0.75
    this.controls.rotateSpeed = 0.6
    this.controls.zoomSpeed = 0.7
    this.controls.mouseButtons = { LEFT: this.dimension === '3d' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.touches = { ONE: this.dimension === '3d' ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.controls.addEventListener('start', () => { this.move = null })
  }

  setView(mode: Mode, floor: Floor, dimension: Dimension): void {
    const changed = mode !== this.mode || dimension !== this.dimension
    const routeVisibilityChanged = mode !== this.mode || floor !== this.floor
    this.mode = mode
    this.floor = floor
    if (dimension !== this.dimension) {
      this.dimension = dimension
      this.camera = dimension === '2d' ? this.orthographic : this.perspective
      this.camera.up.set(0, dimension === '2d' ? 0 : 1, dimension === '2d' ? -1 : 0)
      this.bindControls()
      this.resize()
    }
    this.applyVisibility()
    if (routeVisibilityChanged) this.buildRoute()
    if (changed) this.reset(true)
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true
  }

  setSelection(id: string | null): void {
    this.selection = id
    for (const [roomId, mesh] of this.floorMeshes) {
      const material = mesh.material as THREE.MeshStandardMaterial
      material.emissive.set(roomId === id ? '#83b4f4' : '#000000')
      material.emissiveIntensity = roomId === id ? 0.22 : 0
    }
    for (const label of this.labels) {
      const selected = label.id === id
      label.element.dataset.selected = String(selected)
      label.element.style.outline = selected ? '2px solid #347cf1' : 'none'
      label.element.style.boxShadow = selected ? '0 4px 22px rgba(46,119,239,.27)' : '0 3px 13px rgba(47,67,51,.12)'
      label.element.style.zIndex = selected ? '10' : label.type === 'entrance' ? '8' : '1'
    }
  }

  setRoute(segments: { floor: Floor, points: Point[] }[] | null): void {
    if (this.route === segments) return
    this.route = segments
    this.buildRoute()
  }

  private clearRoute(): void {
    this.routeGroup.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) if (!Array.from(this.materials.values()).includes(material)) material.dispose()
      }
    })
    this.routeGroup.clear()
    this.routeDots = []
    this.routeEnds = []
  }

  private buildRoute(): void {
    this.clearRoute()
    if (!this.route || this.mode !== 'interior') return
    const blue = new THREE.MeshBasicMaterial({ color: '#267aff' })
    const halo = new THREE.MeshBasicMaterial({ color: '#66a6ff', transparent: true, opacity: 0.20, depthWrite: false })
    const white = new THREE.MeshBasicMaterial({ color: '#eef7ff' })
    for (const segment of this.route.filter(segment => segment.floor === this.floor)) {
      const points = segment.points.map(point => new THREE.Vector3(point.x, 0.48, point.z))
      if (points.length < 2) continue
      let length = 0
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1]
        const direction = new THREE.Vector3().subVectors(b, a)
        const distance = direction.length()
        length += distance
        if (distance < 0.01) continue
        for (const [radius, material] of [[0.17, blue], [0.34, halo]] as const) {
          const line = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, distance, 9), material)
          line.position.copy(a).add(b).multiplyScalar(0.5)
          line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
          line.renderOrder = 4
          this.routeGroup.add(line)
        }
      }
      const origin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), blue)
      origin.position.copy(points[0]).add(new THREE.Vector3(0, 0.12, 0))
      this.routeGroup.add(origin)
      const originCenter = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), white)
      originCenter.position.copy(origin.position).add(new THREE.Vector3(0, 0.45, 0))
      this.routeGroup.add(originCenter)
      const endpoint = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.22, 24), blue)
      endpoint.position.copy(points[points.length - 1])
      this.routeGroup.add(endpoint)
      const endRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.94, 40), halo)
      endRing.rotation.x = -Math.PI / 2
      endRing.position.copy(endpoint.position).add(new THREE.Vector3(0, 0.01, 0))
      this.routeGroup.add(endRing)
      this.routeEnds.push(endRing)
      const dotCount = Math.min(16, Math.max(2, Math.floor(length / 3.5)))
      for (let i = 0; i < dotCount; i++) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), white)
        dot.renderOrder = 5
        this.routeGroup.add(dot)
        this.routeDots.push({ mesh: dot, points, length, offset: i / dotCount })
      }
    }
  }

  zoom(delta: number): void {
    if (!this.controls) return
    this.move = null
    if (this.dimension === '2d') {
      this.orthographic.zoom = THREE.MathUtils.clamp(this.orthographic.zoom * Math.exp(delta * 0.17), 0.55, 4.5)
      this.orthographic.updateProjectionMatrix()
    } else {
      const vector = new THREE.Vector3().subVectors(this.camera.position, this.controls.target)
      vector.setLength(THREE.MathUtils.clamp(vector.length() * Math.exp(-delta * 0.17), 24, 195))
      this.camera.position.copy(this.controls.target).add(vector)
    }
    this.controls.update()
  }

  rotate(): void {
    if (!this.controls || this.dimension === '2d') return
    const to = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4).add(this.controls.target)
    this.move = { start: performance.now(), from: this.camera.position.clone(), to, targetFrom: this.controls.target.clone(), targetTo: this.controls.target.clone() }
  }

  reset(animate = true): void {
    if (!this.controls) return
    const target = new THREE.Vector3(3, this.mode === 'exterior' ? 5 : 0.5, 7)
    const to = this.dimension === '2d' ? new THREE.Vector3(3, 105, 7.001) : this.mode === 'exterior' ? new THREE.Vector3(91, 77, 98) : new THREE.Vector3(68, 76, 85)
    if (this.dimension === '2d') {
      this.camera.up.set(0, 0, -1)
      this.orthographic.zoom = 1
      this.orthographic.updateProjectionMatrix()
    } else this.camera.up.set(0, 1, 0)
    if (animate && this.dimension === '3d') this.move = { start: performance.now(), from: this.camera.position.clone(), to, targetFrom: this.controls.target.clone(), targetTo: target }
    else {
      this.camera.position.copy(to)
      this.controls.target.copy(target)
      this.camera.lookAt(target)
      this.controls.update()
      this.move = null
    }
  }

  private applyVisibility(): void {
    this.outside.visible = this.mode === 'exterior'
    for (const floor of [0, 1, 2] as Floor[]) this.interiors[floor].visible = this.mode === 'interior' && floor === this.floor
    this.routeGroup.visible = this.mode === 'interior'
  }

  private resize(): void {
    if (!this.renderer) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    const aspect = width / height
    this.renderer.setSize(width, height, false)
    this.perspective.aspect = aspect
    // Preserve enough horizontal field of view on portrait screens.
    this.perspective.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(39 / 2)) * Math.max(1, 1.1 / aspect)))
    this.perspective.setViewOffset(width, height, 0, height * (width < 600 ? 0.035 : 0.10), width, height)
    this.perspective.updateProjectionMatrix()
    const halfHeight = aspect < 0.8 ? 53 : 43
    this.orthographic.left = -halfHeight * aspect
    this.orthographic.right = halfHeight * aspect
    this.orthographic.top = halfHeight
    this.orthographic.bottom = -halfHeight
    this.orthographic.updateProjectionMatrix()
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault()
    this.callbacks.onError('توقف العرض ثلاثي الأبعاد. الخريطة الثنائية الأبعاد متاحة لاستكمال الملاحة.')
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.pointerStart = { x: event.clientX, y: event.clientY }
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 6 || !this.renderer || event.button !== 0) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.pickables, false)
    for (const hit of hits) {
      let visible = true
      let ancestor: THREE.Object3D | null = hit.object
      while (ancestor) { if (!ancestor.visible) visible = false; ancestor = ancestor.parent }
      if (!visible) continue
      if (hit.object.userData.action === 'enter') { this.callbacks.onEnter(); break }
      const selected = hit.object.userData.select
      if (selected) { this.callbacks.onSelect(selected.id, selected.type); break }
    }
  }

  private updateLabels(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight
    const mobile = width < 600
    let visibleRooms = 0, visiblePois = 0
    const occupied: { left: number, right: number, top: number, bottom: number }[] = []
    const ordered = [...this.labels].sort((a, b) => (b.id === this.selection ? 200 : b.priority) - (a.id === this.selection ? 200 : a.priority))
    const vector = new THREE.Vector3()
    for (const label of ordered) {
      const visible = label.type === 'entrance' ? this.mode === 'exterior' : this.mode === 'interior' && label.floor === this.floor
      if (!visible) { label.element.style.visibility = 'hidden'; continue }
      const selected = label.id === this.selection
      if (mobile && !selected && ((label.type === 'room' && visibleRooms >= 4) || (label.type === 'poi' && visiblePois >= 4))) { label.element.style.visibility = 'hidden'; continue }
      label.element.style.fontSize = label.type === 'entrance' ? '13px' : mobile ? '9px' : '10px'
      label.element.style.maxWidth = label.type === 'entrance' ? '210px' : mobile ? '124px' : '152px'
      vector.copy(label.position)
      if (this.dimension === '2d') vector.y = 0.7
      vector.project(this.camera)
      if (vector.z < -1 || vector.z > 1) { label.element.style.visibility = 'hidden'; continue }
      let x = (vector.x + 1) * width / 2
      const y = (-vector.y + 1) * height / 2
      const labelWidth = label.element.offsetWidth || 95, labelHeight = label.element.offsetHeight || 34
      if (label.type === 'entrance' || selected) x = THREE.MathUtils.clamp(x, labelWidth / 2 + 10, width - labelWidth / 2 - 10)
      const rect = { left: x - labelWidth / 2 - 3, right: x + labelWidth / 2 + 3, top: y - labelHeight / 2 - 3, bottom: y + labelHeight / 2 + 3 }
      const outside = rect.right < 0 || rect.left > width || rect.bottom < 0 || rect.top > height
      const collision = label.id !== this.selection && occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)
      if (outside || collision) { label.element.style.visibility = 'hidden'; continue }
      occupied.push(rect)
      if (label.type === 'room') visibleRooms++
      if (label.type === 'poi') visiblePois++
      label.element.style.visibility = 'visible'
      label.element.style.left = `${x.toFixed(1)}px`
      label.element.style.top = `${y.toFixed(1)}px`
    }
  }

  private animate = (timestamp: number): void => {
    if (this.disposed || !this.renderer) return
    this.frame = requestAnimationFrame(this.animate)
    if (timestamp - this.lastDraw < 1000 / 40) return
    this.lastDraw = timestamp
    if (this.move && this.controls) {
      const t = Math.min(1, (timestamp - this.move.start) / 750)
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      this.camera.position.lerpVectors(this.move.from, this.move.to, eased)
      this.controls.target.lerpVectors(this.move.targetFrom, this.move.targetTo, eased)
      if (t === 1) this.move = null
    }
    this.controls?.update()
    for (const dot of this.routeDots) {
      let distance = ((timestamp * 0.000055 + dot.offset) % 1) * dot.length
      for (let i = 0; i < dot.points.length - 1; i++) {
        const length = dot.points[i].distanceTo(dot.points[i + 1])
        if (distance <= length || i === dot.points.length - 2) {
          dot.mesh.position.lerpVectors(dot.points[i], dot.points[i + 1], length > 0 ? distance / length : 0)
          dot.mesh.position.y += 0.15
          break
        }
        distance -= length
      }
    }
    for (const ring of this.routeEnds) ring.scale.setScalar(1 + (Math.sin(timestamp * 0.003) + 1) * 0.35)
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.observer?.disconnect()
    this.controls?.dispose()
    this.renderer?.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer?.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry)
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      }
    })
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    this.renderer?.dispose()
    this.renderer?.domElement.remove()
    this.labelLayer.remove()
  }
}
