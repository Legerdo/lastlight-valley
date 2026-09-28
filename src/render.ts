import * as THREE from 'three';
import { createSheet, glowTexture, makeTile, mistTexture, plantArt, random, treeArt } from './art.ts';
import type { ActorKind, Sheet } from './art.ts';
import { ATTACK_HIT, facingIndex } from './simulation.ts';
import type { Actor, Enemy, Game, GameEvent } from './simulation.ts';
import { ALTAR, LANTERNS, NPC, SEED, SOLIDS, heightAt } from './world.ts';
import type { Solid, V2 } from './world.ts';

const PPU = 28;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const white = new THREE.Color('#fff5cf');
interface ActorView { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>; shadow: THREE.Mesh; texture: THREE.Texture; sheet: Sheet; }
interface Particle { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color; gravity: number; }
interface Lamp { x: number; y: number; z: number; group: THREE.Group; glow: THREE.Sprite; core: THREE.Mesh; active: boolean; quest: number; }
export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene(); camera = new THREE.OrthographicCamera();
  sheets = new Map<ActorKind, Sheet>(); actors = new Map<number, ActorView>();
  materials = new Map<string, THREE.MeshStandardMaterial>(); tiles = new Map<string, THREE.Texture>();
  lamps: Lamp[] = []; lights: THREE.PointLight[] = []; foliage: { mesh: THREE.Mesh; phase: number }[] = [];
  water!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  sun = new THREE.DirectionalLight('#ffdba7', 2.5); hemi = new THREE.HemisphereLight('#c0d0c5', '#293c4b', 1.7);
  glow = glowTexture(); particles: Particle[] = []; particleMesh: THREE.InstancedMesh;
  ambientMesh: THREE.InstancedMesh; ambientSeeds: number[] = [];
  telegraphs = new Map<number, THREE.Group>(); projectiles = new Map<number, THREE.Group>(); pulses = new Map<number, THREE.Mesh>();
  slashEffects: { mesh: THREE.Mesh; life: number; max: number }[] = [];
  ray = new THREE.Raycaster(); plane = new THREE.Plane(); dummy = new THREE.Object3D();
  cameraTarget = new THREE.Vector3(0, 0.8, 28); cameraOffset = new THREE.Vector3(9, 18, 14);
  cameraRight = new THREE.Vector3(); cameraUp = new THREE.Vector3(); cameraNormal = new THREE.Vector3();
  shake = 0; damageFlash = 0; effects = true; frameTimes: number[] = []; lastFrame = 0;
  renderWidth = 960; renderHeight = 540; cssWidth = 1920; cssHeight = 1080; drawCalls = 0; triangles = 0;
  contextLost = false; sky = new THREE.Color(); environmentTime = 0;
  mist: { mesh: THREE.Sprite; x: number; z: number; phase: number }[] = [];
  bossReveal = 1;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(1); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.19;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color('#657b7d'); this.scene.fog = new THREE.Fog('#78918e', 30, 77);
    this.camera.position.copy(this.cameraOffset); this.camera.lookAt(0, 0, 0);
    this.cameraRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.cameraUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.cameraNormal.set(0, 0, 1).applyQuaternion(this.camera.quaternion);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.left = -25; this.sun.shadow.camera.right = 25;
    this.sun.shadow.camera.top = 25; this.sun.shadow.camera.bottom = -25; this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight('#ffc37e', 9, 8, 1.8); this.lights.push(l); this.scene.add(l); }
    for (const k of ['hero', 'guide', 'wolf', 'wraith', 'guardian'] as ActorKind[]) this.sheets.set(k, createSheet(k));
    for (const k of ['grass', 'path', 'stone', 'wall', 'wood', 'roof', 'moss'] as const) this.tiles.set(k, makeTile(k));
    this.particleMesh = new THREE.InstancedMesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false, depthWrite: false }), 400);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particleMesh.frustumCulled = false; this.particleMesh.count = 0; this.scene.add(this.particleMesh);
    this.ambientMesh = new THREE.InstancedMesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ color: '#c1d9b8', transparent: true, opacity: 0.56, depthWrite: false, side: THREE.DoubleSide }), 70);
    this.ambientMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.ambientMesh.frustumCulled = false; this.scene.add(this.ambientMesh);
    const r = random(SEED); this.ambientSeeds = Array.from({ length: 70 * 4 }, r);
    this.buildWorld(); this.resize();
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; for (const s of this.sheets.values()) s.texture.needsUpdate = true; });
  }
  mat(color: string, tile?: string, emissive?: string): THREE.MeshStandardMaterial {
    const key = `${color}:${tile}:${emissive}`;
    let m = this.materials.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, map: tile ? this.tiles.get(tile) : undefined, roughness: 0.94, metalness: 0, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.1 : 0 }); this.materials.set(key, m); }
    return m;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | THREE.Material[], cast = true) {
    const m = new THREE.Mesh(UNIT_BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; this.scene.add(m); return m;
  }
  surface(x: number, z: number, w: number, d: number, y: number, tile: string, color = '#ffffff') {
    const tex = this.tiles.get(tile)!.clone(); tex.repeat.set(w * PPU / 96, d * PPU / 96); tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 1 });
    const m = new THREE.Mesh(UNIT_PLANE, mat); m.rotation.x = -Math.PI / 2; m.scale.set(w, d, 1); m.position.set(x, y, z); m.receiveShadow = true; this.scene.add(m); return m;
  }
  cylinder(radius: number, h: number, x: number, y: number, z: number, material: THREE.Material, top = radius, segments = 8) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, h, segments), material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m;
  }
  buildWorld() {
    this.box(38, 3, 47, 0, -1.55, 18.5, this.mat('#566366', 'wall'));
    this.surface(0, 18.5, 38, 47, 0, 'grass', '#c1bc93');
    this.box(38, 3, 25, 0, -1.55, -27.5, this.mat('#4c666b', 'wall'));
    this.surface(0, -27.5, 38, 25, 0, 'moss', '#b2c5a7');
    this.box(30, 5.4, 25, 0, -0.35, -60.5, this.mat('#607d7f', 'wall'));
    this.surface(0, -60.5, 30, 25, 2.4, 'stone', '#b2c2b6');
    // Flowing river also reveals the floating diorama's cliff edges.
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(120, 180), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uWarmth: { value: 1 } },
      vertexShader: `varying vec3 vWorld; void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `varying vec3 vWorld; uniform float uTime; uniform float uWarmth;
        void main(){vec2 p=floor(vWorld.xz*18.0)/18.0;
        float wave=sin(p.x*2.7+p.y*0.75+uTime*1.1)+sin(p.x*1.3-p.y*2.0-uTime*.65);
        float line=step(.955,sin(p.y*4.4+p.x*.24+uTime*.65))*step(.05,sin(p.x*1.15+p.y*.2-uTime*.28));
        float small=step(.97,sin(p.y*12.0+p.x*.5-uTime*.7))*step(.8,sin(p.x*3.2+p.y*.13));
        vec3 deep=mix(vec3(.018,.055,.076),vec3(.03,.083,.092),uWarmth);
        vec3 c=deep+line*vec3(.03,.07,.07)+small*vec3(.022,.04,.038);gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(0, -1.18, -14); this.scene.add(this.water);
    const fogTexture = mistTexture();
    for (let i = 0; i < 16; i++) {
      const x = (i % 4 - 1.5) * 9, z = -8 - Math.floor(i / 4) * 8;
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTexture, transparent: true, opacity: 0.52, depthWrite: false, color: '#c3e1d8' }));
      m.scale.set(12, 2.4, 1); m.position.set(x, 0.35, z); this.scene.add(m); this.mist.push({ mesh: m, x, z, phase: i * 0.7 });
    }
    this.road([[0, 40], [-1, 31], [0, 23], [-1, 15], [0, 8], [0, -2]], 3.4);
    this.road([[0, -18], [-1, -23], [0, -30], [0, -40]], 3.3);
    this.road([[-1, 31], [-5, 30], [-9, 34]], 2.2);
    this.road([[0, 22], [5, 22], [10, 27.5]], 2.2);
    this.road([[-1, 15], [-5, 16], [-10, 19]], 2);
    this.bridge();
    for (let i = 0; i < 10; i++) {
      const h = (i + 1) * 0.24, z = -40.4 - i * 0.8;
      this.box(9, h + 1, 0.8, 0, (h - 1) / 2, z, this.mat('#a4b3a0', 'stone'));
      this.box(9, 0.055, 0.075, 0, h + 0.01, z + 0.34, this.mat('#d0d0ad'), false);
    }
    SOLIDS.forEach(s => {
      if (s.kind === 'house') this.house(s);
      else if (s.kind === 'tree') this.tree(s);
      else if (s.kind === 'pillar') this.pillar(s);
      else this.rock(s);
    });
    this.temple();
    // Visible lantern pools are backed by the four nearest real point lights.
    for (const [x, z] of [[-4.7, 34], [4.5, 26.3], [-4.7, 18], [4, 9], [-2.8, -3.5], [2.8, -16.4], [-4.5, -38]]) this.lamp(x, z, 2.25, -1);
    LANTERNS.forEach((l, i) => {
      const y = heightAt(l.x, l.z) ?? 0;
      this.cylinder(0.78, 0.3, l.x, y + 0.15, l.z, this.mat('#647a73', 'stone'));
      this.cylinder(0.4, 1.1, l.x, y + 0.75, l.z, this.mat('#8b9d87', 'wall'));
      this.lamp(l.x, l.z, 1.6, i);
    });
    this.lamp(ALTAR.x, ALTAR.z, 2.2, 2);
    const r = random(SEED + 8), grass = plantArt(), flowers = plantArt(true);
    const plantMaterial = new THREE.MeshStandardMaterial({ map: grass, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const flowerMaterial = new THREE.MeshStandardMaterial({ map: flowers, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    for (let i = 0; i < 270; i++) {
      const x = (r() - 0.5) * 35, z = 40 - r() * 78;
      if (Math.abs(x) < 2.7 || (z < -5 && z > -15)) continue;
      if (SOLIDS.some(s => Math.abs(s.x - x) < s.w / 2 + 0.5 && Math.abs(s.z - z) < s.d / 2 + 0.5)) continue;
      const p = new THREE.Mesh(UNIT_PLANE, i % 6 === 0 ? flowerMaterial : plantMaterial);
      p.position.set(x, 0.46, z); p.rotation.y = Math.atan2(9, 14); p.scale.set(0.85, 0.95, 1); p.receiveShadow = true;
      this.scene.add(p); this.foliage.push({ mesh: p, phase: r() * 6.28 });
    }
    // Small authored stone clusters, fallen logs and banks prevent an empty planar lawn.
    for (let i = 0; i < 32; i++) {
      const x = (i % 2 ? 1 : -1) * (5 + r() * 12), z = 40 - r() * 78;
      if (z < -5 && z > -15) continue;
      this.rock({ x, z, w: 0.3 + r() * 0.5, d: 0.5, h: 0.25 + r() * 0.35, kind: 'rock' });
    }
    for (let i = 0; i < 19; i++) {
      const z = 41 - i * 6.5, h = 9 + r() * 10;
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(7 + r() * 7, h, 5), this.mat(s > 0 ? '#3b5964' : '#4a626b', 'wall'));
        m.position.set(s * (30 + r() * 6), h / 2 - 4, z); m.rotation.y = r() * 2; this.scene.add(m);
      }
    }
    // Bank foam is a set of deliberate, spaced glints, not a full-screen pixel/noise filter.
    for (let i = 0; i < 34; i++) {
      const x = -18 + i * 1.1;
      for (const z of [-5.22, -14.78]) if (Math.abs(x) > 2.5) this.box(0.6 + r() * 0.7, 0.018, 0.09, x, -1.12, z + r() * 0.25, this.mat('#9abfba'), false);
    }
  }
  road(nodes: number[][], width: number) {
    const positions: number[] = [], uv: number[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1], d = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / d * width / 2, nz = (bx - ax) / d * width / 2;
      const points = [[ax + nx, az + nz], [ax - nx, az - nz], [bx + nx, bz + nz], [bx - nx, bz - nz]];
      for (const j of [0, 2, 1, 1, 2, 3]) { const [x, z] = points[j]; positions.push(x, 0.035, z); uv.push(x * PPU / 96, z * PPU / 96); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat('#dfcba4', 'path')); m.receiveShadow = true; this.scene.add(m);
  }
  bridge() {
    const wood = this.mat('#b09e7f', 'wood'), dark = this.mat('#65564a', 'wood');
    for (let i = 0; i < 25; i++) this.box(4.2, 0.18, 0.39, 0, 0.81, -5.2 - i * 0.4, wood);
    for (const z of [-5.3, -8, -11, -14.7]) for (const x of [-2.22, 2.22]) {
      this.box(0.2, 3.15, 0.2, x, 0.1, z, dark); this.box(0.32, 0.12, 0.32, x, 1.72, z, wood);
    }
    for (const x of [-2.22, 2.22]) {
      this.box(0.13, 0.13, 9.8, x, 1.55, -10, wood); this.box(0.09, 0.09, 9.8, x, 1.14, -10, dark);
      this.box(0.25, 0.3, 10.2, x * 0.68, 0.54, -10, dark);
    }
    // Continuous top meshes have exactly the slope used by heightAt().
    for (const south of [true, false]) {
      const z0 = south ? -2 : -18, z1 = south ? -5 : -15;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-2.4, 0, z0, 2.4, 0, z0, -2.4, 0.9, z1, 2.4, 0.9, z1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
      g.setIndex(south ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1]); g.computeVertexNormals();
      const mat = wood.clone(); mat.side = THREE.DoubleSide;
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.scene.add(m);
    }
  }
  house(s: Solid) {
    const { x, z, w, d, h } = s, timber = this.mat('#5c493e', 'wood'), plaster = this.mat('#d6bb8c', 'wall');
    this.box(w + 0.6, 0.48, d + 0.6, x, 0.2, z, this.mat('#879487', 'stone'));
    this.box(w, h - 0.4, d, x, h / 2, z, plaster);
    for (const xx of [-w / 2 + 0.14, 0, w / 2 - 0.14]) this.box(0.24, h, d + 0.1, x + xx, h / 2, z, timber);
    for (const yy of [0.5, h * 0.56, h - 0.14]) this.box(w + 0.1, 0.21, d + 0.13, x, yy, z, timber);
    const front = z + d / 2 + 0.06;
    this.box(1.25, 2, 0.1, x, 1.18, front, this.mat('#303b38', 'wood'));
    this.box(0.09, 0.11, 0.06, x + 0.35, 1.1, front + 0.07, this.mat('#ffd790'));
    this.box(1.8, 0.17, 0.9, x, 0.13, front + 0.4, this.mat('#a8ad96', 'stone'));
    for (const xx of [-w * 0.3, w * 0.3]) {
      this.box(1.15, 1.34, 0.11, x + xx, 2.1, front, timber);
      this.box(0.87, 1.02, 0.13, x + xx, 2.1, front + 0.04, this.mat('#ffc67e', undefined, '#d88634'));
      this.box(0.09, 1.1, 0.16, x + xx, 2.1, front + 0.1, timber);
      this.box(0.92, 0.09, 0.16, x + xx, 2.1, front + 0.1, timber);
      this.box(1.4, 0.13, 0.4, x + xx, 1.48, front + 0.12, timber);
    }
    const roofH = 2.2, rw = w / 2 + 0.6, rd = d / 2 + 0.65;
    const positions = [-rw, 0, rd, rw, 0, rd, 0, roofH, rd, -rw, 0, -rd, 0, roofH, -rd, rw, 0, -rd,
      -rw, 0, rd, 0, roofH, rd, -rw, 0, -rd, -rw, 0, -rd, 0, roofH, rd, 0, roofH, -rd,
      0, roofH, rd, rw, 0, rd, rw, 0, -rd, 0, roofH, rd, rw, 0, -rd, 0, roofH, -rd];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const uv: number[] = []; for (let i = 0; i < positions.length; i += 3) uv.push((positions[i + 2] + rd) / 2, (positions[i + 1]) / 2 + (positions[i] < 0 ? 0 : 0.1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const roof = new THREE.Mesh(g, this.mat(s.variant === 1 ? '#8da2a4' : '#d1a894', 'roof')); roof.position.set(x, h - 0.1, z); roof.castShadow = roof.receiveShadow = true; this.scene.add(roof);
    this.box(0.2, 0.18, d + 1.5, x, h + roofH - 0.1, z, timber);
    // Gable braces, chimney, shop awning and a warm hanging sign.
    for (const side of [-1, 1]) {
      const beam = this.box(Math.hypot(rw, roofH), 0.18, 0.18, x + side * rw / 2, h + roofH / 2 - 0.1, front + 0.62, timber);
      beam.rotation.z = -side * Math.atan2(roofH, rw);
    }
    this.box(0.75, 2.3, 0.8, x - w * 0.25, h + 1, z - d * 0.2, this.mat('#968d7a', 'wall'));
    if (s.variant === 1) {
      const awning = this.box(3.2, 0.13, 1.8, x, 2.65, front + 0.8, this.mat('#537e79', 'wood')); awning.rotation.x = 0.14;
      for (const xx of [-1.4, 1.4]) this.box(0.13, 2.6, 0.13, x + xx, 1.3, front + 1.55, timber);
    }
    this.lamp(x - 1.15, front + 0.55, 2.1, -1);
  }
  tree(s: Solid) {
    const tex = s.variant ? (this.tiles.get('tree-warm') ?? treeArt(true)) : (this.tiles.get('tree-cool') ?? treeArt(false));
    this.tiles.set(s.variant ? 'tree-warm' : 'tree-cool', tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, color: s.variant ? '#edc99b' : '#bbd2ac' });
    const m = new THREE.Mesh(UNIT_PLANE, mat); m.position.set(s.x, s.h / 2 - 0.02, s.z); m.scale.set(s.h * 144 / 176, s.h, 1); m.rotation.y = Math.atan2(9, 14);
    m.castShadow = m.receiveShadow = true; this.scene.add(m); this.foliage.push({ mesh: m, phase: s.x + s.z });
    const roots = this.cylinder(0.55, 0.19, s.x, 0.07, s.z, this.mat('#415d4f'), 0.23);
    roots.rotation.y = s.x;
  }
  pillar(s: Solid) {
    const y = 2.4;
    this.box(2.1, 0.38, 2.1, s.x, y + 0.19, s.z, this.mat('#90a79b', 'stone'));
    this.cylinder(0.72, s.h - 0.6, s.x, y + s.h / 2, s.z, this.mat('#bec6af', 'wall'), 0.62, 8);
    for (const yy of [0.6, s.h - 0.28]) this.box(1.75, 0.28, 1.75, s.x, y + yy, s.z, this.mat('#aab79e', 'stone'));
    for (let i = 0; i < 4; i++) {
      const m = this.box(0.07, Math.max(0.4, s.h - 1.5), 0.07, s.x + Math.cos(i * Math.PI / 2) * 0.67, y + s.h / 2, s.z + Math.sin(i * Math.PI / 2) * 0.67, this.mat('#536f6b')); m.rotation.y = i * Math.PI / 2;
    }
  }
  rock(s: Solid) {
    const g = new THREE.DodecahedronGeometry(1, 0), m = new THREE.Mesh(g, this.mat('#8c9f8d', 'stone'));
    m.scale.set(s.w / 1.7, s.h / 1.7, s.d / 1.7); m.position.set(s.x, (heightAt(s.x, s.z) ?? 0) + s.h * 0.3, s.z); m.rotation.set(0.2, s.x, 0.13); m.castShadow = m.receiveShadow = true; this.scene.add(m);
  }
  temple() {
    const stone = this.mat('#9bac9d', 'wall');
    for (const x of [-14.5, 14.5]) this.box(0.8, 1.25, 24, x, 3.025, -61, stone);
    for (const x of [-9.5, 9.5]) this.box(6, 4.3, 1, x, 4.55, -72, stone);
    this.box(19, 0.7, 1.5, 0, 8.1, -70.8, this.mat('#b8bda6', 'stone'));
    // Broken pediment and the carved circular floor motif.
    this.box(7.5, 0.55, 2, -3.5, 8.65, -70.8, this.mat('#839d93', 'stone'));
    this.box(3.8, 0.55, 2, 5.1, 8.65, -70.8, this.mat('#839d93', 'stone'));
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 4.65, 64), new THREE.MeshStandardMaterial({ color: '#8eafaa', roughness: 1, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 2.423, -57.5); this.scene.add(ring);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, x = Math.cos(a) * 4, z = -57.5 + Math.sin(a) * 4;
      const mark = this.box(0.13, 0.02, 0.48, x, 2.43, z, this.mat('#c2c6a5'), false); mark.rotation.y = -a;
    }
    this.box(3, 0.5, 2.3, ALTAR.x, 2.65, ALTAR.z, this.mat('#6c8887', 'stone'));
    this.box(2.5, 0.35, 1.9, ALTAR.x, 3.06, ALTAR.z, this.mat('#a8b9a3', 'stone'));
    this.cylinder(0.8, 1.1, ALTAR.x, 3.75, ALTAR.z, this.mat('#91a99b', 'wall'), 0.55);
    for (const x of [-5.5, 5.5]) this.lamp(x, -67.5, 2.8, 2);
    for (const x of [-6.8, 6.8]) {
      // Torn pennants are actual multi-vertex silhouettes, not plain rectangular placeholders.
      const shape = new THREE.Shape(); shape.moveTo(-0.5, 0); shape.lineTo(0.5, 0); shape.lineTo(0.5, -2.7); shape.lineTo(0.2, -2.45); shape.lineTo(0, -2.9); shape.lineTo(-0.2, -2.45); shape.lineTo(-0.5, -2.8); shape.closePath();
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.mat('#38666a', 'wood')); m.material.side = THREE.DoubleSide;
      m.position.set(x, 7.8, -70); this.scene.add(m); this.foliage.push({ mesh: m, phase: x });
    }
  }
  lamp(x: number, z: number, height: number, quest: number) {
    const y = (heightAt(x, z) ?? 0) + height;
    const group = new THREE.Group(); group.position.set(x, y, z); this.scene.add(group);
    const frameMat = this.mat('#55473b'), emissive = new THREE.MeshStandardMaterial({ color: '#ffdda1', emissive: '#ffb759', emissiveIntensity: 3 });
    const add = (w: number, h: number, d: number, yy: number, material: THREE.Material) => { const m = new THREE.Mesh(UNIT_BOX, material); m.scale.set(w, h, d); m.position.y = yy; group.add(m); return m; };
    if (quest < 0) add(0.09, height, 0.09, -height / 2 - 0.13, this.mat('#675444', 'wood'));
    if (quest === 2 && Math.abs(x) > 2) {
      add(0.22, height - 0.35, 0.22, -height / 2 - 0.15, this.mat('#72887c', 'wall'));
      add(0.65, 0.2, 0.65, -height + 0.1, this.mat('#9aaa91', 'stone'));
    }
    add(0.52, 0.1, 0.48, -0.3, frameMat); add(0.56, 0.1, 0.5, 0.32, frameMat);
    const core = add(0.32, 0.46, 0.3, 0, emissive);
    for (const xx of [-0.2, 0.2]) for (const zz of [-0.18, 0.18]) { const m = add(0.045, 0.6, 0.045, 0, frameMat); m.position.x = xx; m.position.z = zz; }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#ffd091', transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.set(3.4, 3.4, 1); group.add(glow);
    this.lamps.push({ x, y, z, group, glow, core, active: quest < 0, quest });
  }
  createActor(actor: Actor): ActorView {
    const sheet = this.sheets.get(actor.kind)!, texture = sheet.texture.clone(); texture.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0, emissive: '#456561', emissiveIntensity: 0.1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sheet.size / PPU, sheet.size / PPU), mat); mesh.receiveShadow = true;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(actor.kind === 'guardian' ? 0.94 : actor.kind === 'wolf' ? 0.65 : 0.42, 24), new THREE.MeshBasicMaterial({ color: '#172d34', transparent: true, opacity: actor.kind === 'wraith' ? 0.22 : 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.y = 0.72;
    this.scene.add(mesh, shadow); const view = { mesh, shadow, texture, sheet }; this.actors.set(actor.id, view); return view;
  }
  actor(actor: Actor) {
    const v = this.actors.get(actor.id) ?? this.createActor(actor), action = actor.kind === 'guardian' && this.bossReveal < 1 ? 'death' : actor.action, frames = v.sheet.frames[action];
    let f = 0;
    if (action === 'walk') f = Math.floor(actor.anim * (actor.kind === 'hero' ? 13 : 10)) % frames.count;
    else if (action === 'idle') f = Math.floor(actor.anim * 4) % frames.count;
    else if (action === 'death') f = Math.min(frames.count - 1, Math.floor(actor.anim * 8));
    else if (action === 'dodge') f = Math.min(frames.count - 1, Math.floor(actor.anim / 0.32 * frames.count));
    else if (action === 'hurt') f = Math.min(frames.count - 1, Math.floor(actor.anim * 12));
    else if (actor.id === 0) {
      const beats = [0, 0.075, 0.14, ATTACK_HIT, 0.29, 0.39, 0.48];
      for (let i = 0; i < beats.length; i++) if (actor.anim >= beats[i]) f = i;
    }
    else {
      const e = actor as Enemy;
      f = e.ai === 'windup' ? Math.min(2, Math.floor(actor.anim * 4)) : e.ai === 'strike' ? 3 + Math.min(1, Math.floor(actor.anim * 9) % 2) : 5;
    }
    if (actor.kind === 'guardian' && this.bossReveal < 1) f = Math.floor((1 - this.bossReveal) * (frames.count - 1));
    const row = frames.row + facingIndex(actor.facing);
    v.texture.offset.set(f / 8, 1 - (row + 1) / v.sheet.rows); v.texture.repeat.set(1 / 8, 1 / v.sheet.rows);
    const y = heightAt(actor.x, actor.z) ?? 0;
    v.mesh.position.set(actor.x, y + 0.025 + (actor.kind === 'wraith' ? 0.2 : 0), actor.z);
    v.mesh.position.addScaledVector(this.cameraUp, (v.sheet.foot - v.sheet.size / 2) / PPU);
    // Camera and sprites share a projected pixel grid. World collision stays full precision.
    const rx = v.mesh.position.dot(this.cameraRight), uy = v.mesh.position.dot(this.cameraUp);
    v.mesh.position.addScaledVector(this.cameraRight, Math.round(rx * PPU) / PPU - rx);
    v.mesh.position.addScaledVector(this.cameraUp, Math.round(uy * PPU) / PPU - uy);
    v.mesh.quaternion.copy(this.camera.quaternion);
    v.shadow.position.set(actor.x, y + 0.012, actor.z);
    const dead = actor.hp <= 0; v.mesh.visible = !dead || actor.anim < (actor.id === 0 ? 99 : 2.4);
    v.shadow.visible = v.mesh.visible;
    const flash = actor.id === 0 ? actor.action === 'dodge' ? '#397a79' : '#a24945' : '#a08c68';
    v.mesh.material.emissive.set(actor.invulnerable > 0.05 ? flash : '#456561');
    v.mesh.material.emissiveIntensity = actor.invulnerable > 0.05 ? 0.75 : actor.kind === 'guardian' && (actor as Enemy).ai === 'recover' ? 0.45 : 0.13;
  }
  update(game: Game, dt: number, now: number) {
    if (this.contextLost) return;
    if (this.lastFrame > 0 && !document.hidden) { this.frameTimes.push(now - this.lastFrame); if (this.frameTimes.length > 10000) this.frameTimes.shift(); }
    this.lastFrame = now; this.environmentTime += dt;
    const t = this.environmentTime, victory = game.phase === 'victory' ? Math.min(1, game.phaseTime / 2.5) : 0;
    const warmth = THREE.MathUtils.clamp((game.player.z + 38) / 65, 0, 1) * (1 - victory) + victory;
    this.sky.set('#53767d').lerp(new THREE.Color('#9b9b82'), warmth * 0.55);
    (this.scene.background as THREE.Color).copy(this.sky);
    (this.scene.fog as THREE.Fog).color.copy(this.sky); (this.scene.fog as THREE.Fog).near = this.effects ? 29 : 46;
    this.sun.color.set('#add9df').lerp(new THREE.Color('#ffd4a0'), warmth); this.sun.intensity = 2.1 + victory * 1.3;
    this.hemi.color.set('#aacad0').lerp(new THREE.Color('#ded4b4'), warmth); this.hemi.intensity = 1.55 + victory * 0.35;
    this.water.material.uniforms.uTime.value = t; this.water.material.uniforms.uWarmth.value = warmth;
    const follow = game.phase === 'title' ? new THREE.Vector3(-0.8, 0.8, 27) : game.phase === 'boss-intro' ? new THREE.Vector3(game.boss.x, 3.1, game.boss.z + 0.7) : game.phase === 'victory' ? new THREE.Vector3(0, 3.5, -63) : new THREE.Vector3(game.player.x, (heightAt(game.player.x, game.player.z) ?? 0) + 0.65, game.player.z - 1.7);
    this.cameraTarget.lerp(follow, 1 - Math.exp(-dt * (game.phase === 'play' ? 8 : 2.2)));
    const target = this.cameraTarget.clone(), rx = target.dot(this.cameraRight), uy = target.dot(this.cameraUp);
    target.addScaledVector(this.cameraRight, Math.round(rx * PPU) / PPU - rx); target.addScaledVector(this.cameraUp, Math.round(uy * PPU) / PPU - uy);
    this.shake = Math.max(0, this.shake - dt * 1.7);
    if (this.effects && this.shake > 0) { target.addScaledVector(this.cameraRight, Math.round(Math.sin(t * 93) * this.shake * PPU) / PPU); target.addScaledVector(this.cameraUp, Math.round(Math.cos(t * 74) * this.shake * PPU * 0.6) / PPU); }
    this.camera.position.copy(target).add(this.cameraOffset); this.camera.lookAt(target); this.camera.updateMatrixWorld();
    this.sun.position.set(target.x - 13, 27, target.z + 8); this.sun.target.position.copy(target); this.sun.target.updateMatrixWorld();
    this.actor(game.player);
    this.bossReveal = game.phase === 'boss-intro' ? Math.min(1, game.phaseTime / 1.8) : 1;
    this.actor({ id: -1, kind: 'guide', x: NPC.x, z: NPC.z, hp: 1, maxHp: 1, action: 'idle', anim: t, facing: { x: 0.4, z: 1 }, actionTime: 0, cooldown: 0, invulnerable: 0, moving: false });
    for (const e of game.enemies) this.actor(e);
    this.lamps.forEach(l => {
      l.active = l.quest < 0 || l.quest === 2 && game.phase === 'victory' || l.quest >= 0 && l.quest < 2 && game.lit[l.quest];
      l.glow.visible = l.active && this.effects;
      (l.core.material as THREE.MeshStandardMaterial).emissiveIntensity = l.active ? 2.5 + Math.sin(t * 6 + l.x) * 0.3 : 0;
      (l.core.material as THREE.MeshStandardMaterial).color.set(l.active ? '#ffe2a7' : '#476267');
      l.glow.scale.setScalar(3.4 + Math.sin(t * 3 + l.z) * 0.1 + (l.quest === 2 ? victory * 3 : 0));
    });
    const nearest = this.lamps.filter(l => l.active).sort((a, b) => Math.hypot(a.x - game.player.x, a.z - game.player.z) - Math.hypot(b.x - game.player.x, b.z - game.player.z)).slice(0, 4);
    this.lights.forEach((l, i) => { const lamp = nearest[i]; l.intensity = lamp ? 11 + Math.sin(t * 4 + i) : 0; if (lamp) l.position.set(lamp.x, lamp.y, lamp.z); });
    for (const f of this.foliage) f.mesh.rotation.z = this.effects ? Math.sin(t * 1.4 + f.phase) * (f.mesh.scale.y > 3 ? 0.003 : 0.032) : 0;
    for (const f of this.mist) { f.mesh.visible = this.effects; f.mesh.position.x = f.x + Math.sin(t * 0.11 + f.phase) * 2; f.mesh.position.z = f.z + Math.sin(t * .15 + f.phase) * 0.5; }
    for (const event of game.events.splice(0)) this.event(event);
    this.updateCombatViews(game);
    this.updateParticles(dt, game, t);
    this.renderer.render(this.scene, this.camera);
    this.drawCalls = this.renderer.info.render.calls; this.triangles = this.renderer.info.render.triangles;
  }
  updateCombatViews(game: Game) {
    for (const e of game.enemies) {
      let g = this.telegraphs.get(e.id);
      if (!g) {
        g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffba80', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2; g.add(ring);
        const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#e4675a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); fill.rotation.x = -Math.PI / 2; g.add(fill);
        const arrowGeo = new THREE.BufferGeometry(); arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.24,.03,.3,.24,.03,.3,-.24,.03,3,-.24,.03,3,.24,.03,.3,.24,.03,3,-.65,.03,2.8,.65,.03,2.8,0,.03,3.7],3));
        const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffc993', transparent: true, opacity: .34, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); g.add(arrow);
        this.scene.add(g); this.telegraphs.set(e.id, g);
      }
      g.visible = e.ai === 'windup' && e.hp > 0;
      if (g.visible) {
        const boss = e.kind === 'guardian', radius = boss ? e.pattern % 2 === 0 ? 8.5 : 1.6 : e.kind === 'wolf' ? 0.9 : 1.1;
        g.position.set(e.x, (heightAt(e.x, e.z) ?? 0) + 0.07, e.z); g.scale.set(1, 1, 1);
        g.children[0].scale.set(radius, radius, 1); g.children[1].scale.set(radius, radius, 1);
        g.children[2].visible = !boss || e.pattern % 2 !== 0;
        g.children[2].rotation.y = Math.atan2(e.target.x - e.x, e.target.z - e.z);
        g.children[2].scale.set(boss ? 2 : 1, 1, e.kind === 'wolf' ? 1 : 2);
        (g.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.58 + Math.sin(this.environmentTime * 18) * 0.22;
      }
    }
    const active = new Set(game.projectiles.map(p => p.id));
    for (const [id, mesh] of this.projectiles) if (!active.has(id)) { this.scene.remove(mesh); this.projectiles.delete(id); }
    for (const b of game.projectiles) {
      let g = this.projectiles.get(b.id);
      if (!g) {
        g = new THREE.Group();
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(b.radius, 0), new THREE.MeshBasicMaterial({ color: '#ffdfab', toneMapped: false })); g.add(orb);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#ffcaa3', blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })); glow.scale.setScalar(b.radius * 5); g.add(glow);
        this.scene.add(g); this.projectiles.set(b.id, g);
      }
      g.position.set(b.x, (heightAt(b.x, b.z) ?? 0) + 0.7, b.z); g.children[0].rotation.z += 0.14;
    }
    const pulseIds = new Set(game.pulses.map(p => p.id));
    for (const [id, mesh] of this.pulses) if (!pulseIds.has(id)) { this.scene.remove(mesh); this.pulses.delete(id); }
    for (const p of game.pulses) {
      let m = this.pulses.get(p.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffe3ac', transparent: true, opacity: 0.94, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        m.rotation.x = -Math.PI / 2; this.scene.add(m); this.pulses.set(p.id, m);
      }
      m.position.set(p.x, (heightAt(p.x, p.z) ?? 0) + 0.11, p.z); m.scale.set(p.radius, p.radius, 1);
    }
  }
  event(e: GameEvent) {
    const y = (heightAt(e.x, e.z) ?? 0) + 0.7;
    if (e.type === 'swing') {
      const a = Math.atan2(e.dir.z, e.dir.x), m = new THREE.Mesh(new THREE.RingGeometry(1.0, e.strength > 1 ? 2.05 : 1.75, 20, 1, -1.25, 2.5), new THREE.MeshBasicMaterial({ color: e.strength > 1 ? '#ffcd87' : '#dce9ca', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = -a; m.position.set(e.x, y - 0.23, e.z); this.scene.add(m); this.slashEffects.push({ mesh: m, life: 0.13, max: 0.13 });
    }
    if (e.type === 'hit' || e.type === 'hurt' || e.type === 'boss') this.shake = Math.max(this.shake, e.strength * 0.052);
    const count = e.type === 'swing' ? 2 : e.type === 'dodge' ? 12 : e.type === 'win' ? 90 : e.type === 'ignite' ? 40 : 15 * e.strength;
    for (let i = 0; i < count && this.particles.length < 380; i++) {
      const a = i * 2.399 + this.environmentTime, power = e.type === 'hit' ? 2.8 : e.type === 'dodge' ? 0.8 : 1.5;
      const life = e.type === 'win' ? 2 + (i % 10) * 0.15 : 0.25 + (i % 7) * 0.08;
      const color = new THREE.Color(e.type === 'hurt' ? ['#ffe5b6', '#cf6c62', '#ac494b'][i % 3] : e.type === 'death' ? ['#a9d6a0', '#d4e6b5', '#689a86'][i % 3] : ['#fff1b6', '#d7b379', '#f6d391'][i % 3]);
      this.particles.push({ p: new THREE.Vector3(e.x, e.type === 'dodge' ? y - 0.55 : y, e.z), v: new THREE.Vector3(Math.cos(a) * power + e.dir.x * (e.type === 'hit' ? 2 : 0), 1 + i % 5 * 0.4, Math.sin(a) * power + e.dir.z * (e.type === 'hit' ? 2 : 0)), life, max: life, size: (i % 3 + 1) / PPU, color, gravity: e.type === 'win' || e.type === 'ignite' ? -0.3 : 6 });
    }
  }
  updateParticles(dt: number, game: Game, t: number) {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      p.life -= dt; p.v.y -= dt * p.gravity; p.p.addScaledVector(p.v, dt);
      this.dummy.position.copy(p.p); this.dummy.quaternion.copy(this.camera.quaternion); this.dummy.scale.setScalar(p.size * Math.min(1, p.life / p.max * 2)); this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix); this.particleMesh.setColorAt(i, p.color);
    });
    this.particleMesh.instanceMatrix.needsUpdate = true; if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    for (const s of this.slashEffects) { s.life -= dt; (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / s.max) * 0.8; }
    this.slashEffects = this.slashEffects.filter(s => { if (s.life > 0) return true; this.scene.remove(s.mesh); s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); return false; });
    this.ambientMesh.visible = this.effects;
    for (let i = 0; i < 70; i++) {
      const s = this.ambientSeeds.slice(i * 4, i * 4 + 4), x = game.player.x + (s[0] - 0.5) * 35 + Math.sin(t * 0.3 + s[2] * 10), z = game.player.z + (s[1] - 0.5) * 30;
      this.dummy.position.set(x, (heightAt(x, z) ?? 0) + 0.4 + s[2] * 4 + Math.sin(t * 0.6 + i) * 0.2, z);
      this.dummy.quaternion.copy(this.camera.quaternion); this.dummy.rotateZ(t * 0.3 + i); this.dummy.scale.setScalar((s[3] > 0.7 ? 2 : 1) / PPU); this.dummy.updateMatrix(); this.ambientMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.ambientMesh.instanceMatrix.needsUpdate = true;
  }
  resize() {
    this.cssWidth = window.innerWidth; this.cssHeight = window.innerHeight;
    const scale = Math.max(1, Math.floor(this.cssHeight / 480));
    this.renderWidth = Math.round(this.cssWidth / scale); this.renderHeight = Math.round(this.cssHeight / scale);
    this.renderer.setSize(this.renderWidth, this.renderHeight, false);
    const h = this.renderHeight / PPU, w = this.renderWidth / PPU;
    this.camera.left = -w / 2; this.camera.right = w / 2; this.camera.top = h / 2; this.camera.bottom = -h / 2;
    this.camera.near = 0.1; this.camera.far = 170; this.camera.updateProjectionMatrix();
  }
  aim(x: number, y: number, player: V2): V2 {
    this.ray.setFromCamera(new THREE.Vector2(x / this.cssWidth * 2 - 1, -y / this.cssHeight * 2 + 1), this.camera);
    this.plane.set(new THREE.Vector3(0, 1, 0), -(heightAt(player.x, player.z) ?? 0));
    const v = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3()); return v ? { x: v.x, z: v.z } : { x: player.x, z: player.z - 1 };
  }
  project(x: number, z: number, elevation = 0) {
    const v = new THREE.Vector3(x, (heightAt(x, z) ?? 0) + elevation, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.cssWidth, y: (-v.y * 0.5 + 0.5) * this.cssHeight, visible: Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.96 };
  }
  stats() {
    const gl = this.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const frames = this.frameTimes.slice(), sorted = [...frames].sort((a, b) => a - b), mean = frames.reduce((a, b) => a + b, 0) / Math.max(frames.length, 1);
    return { averageFPS: 1000 / mean, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], samples: frames.length, drawCalls: this.drawCalls, triangles: this.triangles,
      drawingBuffer: { width: this.renderWidth, height: this.renderHeight }, viewport: { width: this.cssWidth, height: this.cssHeight }, dpr: devicePixelRatio,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      userAgent: navigator.userAgent, effects: this.effects, shadowMap: '2048 PCFSoft', spriteFilter: 'nearest / nearest', terrainFilter: 'nearest / nearest-mipmap-linear', sourcePixelsPerUnit: PPU,
    };
  }
}
