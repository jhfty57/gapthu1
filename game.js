import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';

/* =========================================================================
   NOVA RUSH — a 3D neon endless runner  (REMASTERED)
   Visual upgrade: cinematic grade pass, parallax depth, light-streak speed,
   refined ship/obstacles/gates, juicier effects. Gameplay unchanged.
   ========================================================================= */

const LANES = [-3.4, 0, 3.4];
const LANE_W = 1.35;            // collision half-width
const PLAYER_Z = 0;             // world z of the ship
const SPAWN_Z = -220;           // far spawn distance
const KILL_Z = 14;              // passed the camera -> recycle
const BASE_SPEED = 42;
const MAX_SPEED = 150;

// ---------------------------------------------------------------- utilities
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // (final grade pass does the ACES work)
renderer.toneMappingExposure = 1.0;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0222, 0.0095);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 6.2, 11.5);
camera.lookAt(0, 1.4, -20);

// ---------------------------------------------------------------- composer
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  /*strength*/ 0.8, /*radius*/ 0.5, /*threshold*/ 0.28  // higher threshold keeps non-neon detail crisp
);
composer.addPass(bloom);

// Final cinematic grade: ACES tonemap + sRGB (r160 composer buffers are linear),
// vignette, saturation lift and a subtle chromatic aberration that spikes on crash.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCA:  { value: 0.0011 },
    uVig: { value: 0.34 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uCA;
    uniform float uVig;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      vec2 off = d * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, uv - off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + off).b;
      col = aces(col * 1.14);                       // exposure
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, 1.16);              // saturation
      float vig = 1.0 - uVig * smoothstep(0.12, 0.62, dot(d, d));
      col *= vig;
      col = pow(max(col, 0.0), vec3(0.4545));       // linear -> sRGB
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
let caSpike = 0;    // extra chromatic aberration on crash, decays each frame

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0x3a2458, 1.5));
const key = new THREE.DirectionalLight(0xffd9ff, 1.0);
key.position.set(8, 14, 6);
scene.add(key);
const rim = new THREE.PointLight(0x22ffee, 1.6, 110);
rim.position.set(-12, 6, -30);
scene.add(rim);
const rim2 = new THREE.PointLight(0xff2df0, 1.8, 110);
rim2.position.set(12, 5, -40);
scene.add(rim2);

// ---------------------------------------------------------------- textures
function gridTexture() {
  // 1024 x 256: the FULL 90-unit track width in one tile (no x repetition),
  // 120 tiles along the 560-unit length (4.667 world units each).
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#07001d');
  bg.addColorStop(1, '#050014');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  const X = (wx) => ((wx + 45) / 90) * 1024;   // world x -> pixel x
  const vline = (x, color, w, blur) => {
    g.strokeStyle = color; g.lineWidth = w;
    g.shadowColor = color; g.shadowBlur = blur;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke();
    g.shadowBlur = 0;
  };
  const hline = (y, color, w, blur) => {
    g.strokeStyle = color; g.lineWidth = w;
    g.shadowColor = color; g.shadowBlur = blur;
    g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke();
    g.shadowBlur = 0;
  };
  // minor horizontal grid (2.33 world units apart)
  hline(64, 'rgba(110,50,215,0.30)', 2, 0);
  hline(192, 'rgba(110,50,215,0.30)', 2, 0);
  // major glowing speed lines
  hline(128, 'rgba(255,45,240,0.9)', 3, 9);
  // center lane line
  vline(X(0), 'rgba(0,229,255,0.95)', 4, 12);
  // lane dividers
  vline(X(-1.7), 'rgba(0,229,255,0.5)', 2, 6);
  vline(X(1.7), 'rgba(0,229,255,0.5)', 2, 6);
  // outer lane edges
  vline(X(-5.1), 'rgba(168,90,255,0.55)', 2, 6);
  vline(X(5.1), 'rgba(168,90,255,0.55)', 2, 6);
  // faint far field
  vline(X(-12), 'rgba(90,40,160,0.30)', 1.5, 0);
  vline(X(12), 'rgba(90,40,160,0.30)', 1.5, 0);
  vline(X(-22), 'rgba(70,30,130,0.22)', 1.5, 0);
  vline(X(22), 'rgba(70,30,130,0.22)', 1.5, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 120);
  t.anisotropy = MAX_ANISO;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  // canvas y=0 (top) maps to the sky zenith (flipY); the horizon sits around y=0.5
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.00, '#03000d');
  grd.addColorStop(0.28, '#0e0234');
  grd.addColorStop(0.46, '#34106e');
  grd.addColorStop(0.55, '#6b1580');
  grd.addColorStop(0.68, '#b0259e');
  grd.addColorStop(1.00, '#ff4fc3');   // horizon glow band
  g.fillStyle = grd; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 6, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,250,190,1)');
  grd.addColorStop(0.35, 'rgba(255,150,90,1)');
  grd.addColorStop(0.62, 'rgba(255,60,160,0.85)');
  grd.addColorStop(1, 'rgba(255,45,240,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // retro-sun scanline notches (lower half only, classic look)
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) { g.fillRect(0, 148 + i * 14, 256, 4 + i); }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(200,220,255,0.7)');
  grd.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft white radial glow — tinted per-sprite (halos, nebulae, bulbs, ground glow)
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.65, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.62)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 16;
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 22;
  g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = 5;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glowTex = glowTexture();
const shadowTex = shadowTexture();
const ringTex = ringTexture();
const starTex = starTexture();

// ---------------------------------------------------------------- sky + sun + stars
const skyGeo = new THREE.SphereGeometry(700, 32, 24);
const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
scene.add(new THREE.Mesh(skyGeo, skyMat));

// nebula clouds for a richer sky
const nebulas = [];
[[0x7a2bff, -260, 190, -560, 420, 0.16], [0x00c8ff, 240, 240, -620, 380, 0.12],
 [0xff2df0, 40, 130, -660, 460, 0.10]].forEach(([col, x, y, z, s, op]) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: col, transparent: true, opacity: op,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sp.scale.set(s, s * 0.62, 1);
  sp.position.set(x, y, z);
  scene.add(sp);
  nebulas.push(sp);
});

const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false }));
sun.scale.set(170, 170, 1);
sun.position.set(0, 30, -560);
scene.add(sun);
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4fa8, fog: false, depthWrite: false, opacity: 0.4, blending: THREE.AdditiveBlending }));
sunGlow.scale.set(320, 320, 1);
sunGlow.position.copy(sun.position);
scene.add(sunGlow);
const sunRefl = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false, opacity: 0.35 }));
sunRefl.scale.set(110, 110, 1);
sunRefl.position.set(0, 10, -540);
scene.add(sunRefl);

// stars: two parallax layers
function makeStars(count, xR, yMin, yMax, zMin, zMax, size, opacity, colors) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-xR, xR);
    pos[i * 3 + 1] = rand(yMin, yMax);
    pos[i * 3 + 2] = rand(zMin, zMax);
    c.set(pick(colors)).multiplyScalar(rand(0.5, 1));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    map: starTex, size, transparent: true, opacity, vertexColors: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}
const starsFar = makeStars(1300, 700, 12, 340, -700, -120, 2.6, 0.85, [0xffffff, 0xbfdcff, 0xffc4f0, 0x9fe8ff]);
const starsNear = makeStars(340, 240, 3, 95, -320, -20, 4.6, 0.9, [0xffffff, 0x9fe8ff, 0xff9dfb]);
const starsNearPos = starsNear.geometry.attributes.position;

// ---------------------------------------------------------------- mountains (two silhouette layers)
// each layer scrolls toward the camera and wraps when fully behind it,
// re-entering just past the far end (fog hides the seam)
function makeMountains(color, count, xMin, xMax, zMax, hMin, hMax) {
  const mat = new THREE.MeshBasicMaterial({ color, fog: true });
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const w = rand(10, 26), h = rand(hMin, hMax);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), mat);
    cone.rotation.y = rand(0, Math.PI);
    cone.position.set(
      (Math.random() < 0.5 ? -1 : 1) * rand(xMin, xMax),
      h / 2 - 0.6,
      -rand(20, zMax)
    );
    cone.scale.z = rand(0.4, 1.1);
    group.add(cone);
  }
  scene.add(group);
  const wrap = { group, trigger: zMax + KILL_Z, span: zMax + KILL_Z + 20 };
  wrap.scroll = (dz) => {
    wrap.group.position.z += dz;
    if (wrap.group.position.z > wrap.trigger) wrap.group.position.z -= wrap.span;
  };
  return wrap;
}
const mountainsFar = makeMountains(0x05001a, 18, 26, 90, 520, 18, 48);
const mountainsNear = makeMountains(0x0b0230, 14, 16, 55, 400, 8, 26);

// ---------------------------------------------------------------- grid floor
const gridTex = gridTexture();
const floorGeo = new THREE.PlaneGeometry(90, 560, 1, 1);
const floorMat = new THREE.MeshBasicMaterial({ map: gridTex, fog: true });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, -200);
scene.add(floor);

// neon track edges — bright core + soft additive falloff
function edgeLine(x, color) {
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 560), new THREE.MeshBasicMaterial({ color }));
  core.position.set(x, 0.11, -200);
  scene.add(core);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.1, 560),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.set(x, 0.06, -200);
  scene.add(glow);
}
edgeLine(LANES[0] - 1.8, 0xff2df0);
edgeLine(LANES[2] + 1.8, 0x00e5ff);

// ---------------------------------------------------------------- side pylons (parallax light posts)
const PYLON_N = 12;
const PYLON_SPACING = 40;
const PYLON_SPAN = PYLON_N * PYLON_SPACING;
const pylonPoleMat = new THREE.MeshBasicMaterial({ color: 0x150a38 });
const pylonGeo = {
  pole: new THREE.BoxGeometry(0.12, 4.8, 0.12),
  base: new THREE.BoxGeometry(0.55, 0.24, 0.55),
  arm: new THREE.BoxGeometry(1.1, 0.1, 0.1),
  bulb: new THREE.BoxGeometry(0.28, 0.28, 0.28),
};
const pylons = [];
function makePylonRow(side, cA, cB) {
  for (let i = 0; i < PYLON_N; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(pylonGeo.pole, pylonPoleMat); pole.position.y = 2.4;
    const base = new THREE.Mesh(pylonGeo.base, pylonPoleMat); base.position.y = 0.12;
    const arm = new THREE.Mesh(pylonGeo.arm, pylonPoleMat); arm.position.set(-side * 0.55, 4.72, 0);
    const col = (i % 2 === 0) ? cA : cB;
    const bulb = new THREE.Mesh(pylonGeo.bulb, new THREE.MeshBasicMaterial({ color: col }));
    bulb.position.set(-side * 1.08, 4.74, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: col, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.copy(bulb.position);
    glow.scale.setScalar(1.8);
    g.add(pole, base, arm, bulb, glow);
    g.position.set(side * 8.2, 0, -10 - i * PYLON_SPACING);
    scene.add(g);
    pylons.push(g);
  }
}
makePylonRow(-1, 0x00e5ff, 0x7d5cff);
makePylonRow(1, 0xff2df0, 0xff7ad9);

function scrollPylons(dz) {
  for (const p of pylons) {
    p.position.z += dz;
    if (p.position.z > KILL_Z) p.position.z -= PYLON_SPAN;
  }
}

// ---------------------------------------------------------------- speed streaks (instanced light bars)
const STREAK_N = 110;
const STREAK_SPAN = 260;
const streaks = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 1),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  STREAK_N
);
streaks.frustumCulled = false;
scene.add(streaks);
const streakData = [];
{
  const cols = [0x9fdcff, 0xc7b8ff, 0xff9dfb, 0xffffff, 0x7df4ff];
  const c = new THREE.Color();
  for (let i = 0; i < STREAK_N; i++) {
    streakData.push({
      x: rand(9.5, 17) * (Math.random() < 0.5 ? -1 : 1),
      y: rand(0.4, 13),
      z: rand(-STREAK_SPAN + 5, 5),
      v: rand(1.06, 1.4),
      len: rand(0.8, 1.2),
    });
    streaks.setColorAt(i, c.set(pick(cols)).multiplyScalar(rand(0.5, 1)));
  }
  streaks.instanceColor.needsUpdate = true;
}
const streakDummy = new THREE.Object3D();
function scrollStreaks(dz, speed) {
  const baseLen = 1.5 + speed * 0.13;
  for (let i = 0; i < STREAK_N; i++) {
    const s = streakData[i];
    s.z += dz * s.v;
    if (s.z > 12) {
      s.z -= STREAK_SPAN + rand(0, 30);
      s.x = rand(9.5, 17) * (Math.random() < 0.5 ? -1 : 1);
      s.y = rand(0.4, 13);
      s.len = rand(0.8, 1.2);
    }
    streakDummy.position.set(s.x, s.y, s.z);
    streakDummy.scale.set(1, 1, baseLen * s.len);
    streakDummy.updateMatrix();
    streaks.setMatrixAt(i, streakDummy.matrix);
  }
  streaks.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- ship
const shipFlames = [];
const shipGlows = [];
function buildShip() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x141033, metalness: 0.92, roughness: 0.28, emissive: 0x1a0b3f, emissiveIntensity: 0.5 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const trimPink = new THREE.MeshBasicMaterial({ color: 0xff2df0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a3a44, emissive: 0x25e8ff, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.15 });

  // hexagonal body — reads as machined metal
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.52, 2.2, 6), hull);
  core.rotation.x = Math.PI / 2;
  core.position.z = 0.3;
  g.add(core);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.9, 6), hull);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.45;
  g.add(nose);

  // cockpit
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), glass);
  cockpit.scale.set(1, 0.72, 1.3);
  cockpit.position.set(0, 0.34, -0.42);
  g.add(cockpit);

  // swept wings + neon leading edges + tip beacons
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x141040, metalness: 0.85, roughness: 0.35, emissive: 0x120135, emissiveIntensity: 0.7 });
  const wingGeo = new THREE.BoxGeometry(1.7, 0.07, 0.9);
  const edgeGeo = new THREE.BoxGeometry(1.62, 0.025, 0.07);
  [-1, 1].forEach(s => {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(s * 1.08, -0.03, 0.5);
    wing.rotation.y = -s * 0.42;
    wing.rotation.z = -s * 0.1;
    g.add(wing);
    const edge = new THREE.Mesh(edgeGeo, trim);
    edge.position.set(s * 1.05, 0.03, -0.18);
    edge.rotation.y = -s * 0.42;
    g.add(edge);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), trimPink);
    tip.position.set(s * 1.98, -0.14, 0.72);
    g.add(tip);
  });

  // tail fin
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.5), hull);
  fin.position.set(0, 0.3, 1.0);
  fin.rotation.x = 0.12;
  g.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.5), trim);
  finTip.position.set(0, 0.55, 1.0);
  finTip.rotation.x = 0.12;
  g.add(finTip);

  // belly light strip
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 1.5), trimPink);
  belly.position.set(0, -0.3, 0.25);
  g.add(belly);

  // engines: ring + core + flickering flame + glow
  [-1, 1].forEach(s => {
    const ringE = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.5, 12), hull);
    ringE.rotation.x = Math.PI / 2;
    ringE.position.set(s * 0.36, -0.05, 1.42);
    g.add(ringE);
    const coreE = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.54, 12), trim);
    coreE.rotation.x = Math.PI / 2;
    coreE.position.set(s * 0.36, -0.05, 1.42);
    g.add(coreE);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 1.2, 10),
      new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(s * 0.36, -0.05, 2.1);
    g.add(flame);
    shipFlames.push(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x4be8ff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(s * 0.36, -0.05, 2.35);
    glow.scale.setScalar(1.6);
    g.add(glow);
    shipGlows.push(glow);
  });

  const pl = new THREE.PointLight(0x35e6ff, 2.6, 24, 2);
  pl.position.set(0, 0.6, 0.8);
  g.add(pl);
  return g;
}
const ship = buildShip();
ship.position.set(0, 1.1, PLAYER_Z);
scene.add(ship);

// blob shadow + engine light pool on the floor (grounds the ship in 3D)
const shipShadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false }));
shipShadow.scale.set(3.8, 2.4, 1);
shipShadow.position.set(0, 0.03, 0.4);
shipShadow.renderOrder = -1;
scene.add(shipShadow);
const shipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x00d5ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
shipGlow.scale.set(7.5, 3.8, 1);
shipGlow.position.set(0, 0.05, 1.6);
shipGlow.renderOrder = 0;
scene.add(shipGlow);

// ---------------------------------------------------------------- ship trail
const TRAIL_N = 70;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailCol = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailMat = new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: starTex });
const trail = new THREE.Points(trailGeo, trailMat);
trail.frustumCulled = false;
scene.add(trail);
let trailHead = 0;

function updateTrail() {
  trailHead = (trailHead + 1) % TRAIL_N;
  trailPos[trailHead * 3] = ship.position.x + rand(-0.15, 0.15);
  trailPos[trailHead * 3 + 1] = ship.position.y - 0.25 + rand(-0.08, 0.08);
  trailPos[trailHead * 3 + 2] = ship.position.z + 1.9 + rand(0, 0.5);
  const hue = (Math.sin(performance.now() * 0.005) * 0.5 + 0.5);
  trailCol[trailHead * 3] = hue * 0.9;          // cyan -> magenta drift
  trailCol[trailHead * 3 + 1] = 0.5 + (1 - hue) * 0.5;
  trailCol[trailHead * 3 + 2] = 0.85;
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- obstacle pool
const obstacles = [];
const OB_POOL = 22;
for (let i = 0; i < OB_POOL; i++) {
  const g = new THREE.Group();
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x1c0412, emissive: 0xff2d4d, emissiveIntensity: 2.0, metalness: 0.55, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), coreMat);
  body.scale.set(0.72, 1.3, 0.72);
  g.add(body);
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xffc2cf }));
  g.add(inner);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.045, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff4b6b }));
  ringA.rotation.x = Math.PI / 2;
  g.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.028, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff2df0, transparent: true, opacity: 0.85 }));
  ringB.rotation.x = 1.25;
  g.add(ringB);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2d55, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(3.6);
  g.add(halo);
  g.visible = false;
  scene.add(g);
  obstacles.push({ group: g, body, inner, ringA, ringB, coreMat, active: false, lane: 0, z: 0, phase: rand(0, Math.PI * 2) });
}

// ---------------------------------------------------------------- orb pool
const orbs = [];
const ORB_POOL = 30;
for (let i = 0; i < ORB_POOL; i++) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0),
    new THREE.MeshStandardMaterial({ color: 0x3a2404, emissive: 0xffd23d, emissiveIntensity: 2.4, metalness: 0.5, roughness: 0.25 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  g.add(ring);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd23d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(2.6);
  g.add(halo);
  g.visible = false;
  scene.add(g);
  orbs.push({ group: g, core, ring, active: false, lane: 0, z: 0, taken: false });
}

// ---------------------------------------------------------------- gates (glowing arches)
const gates = [];
const GATE_N = 10;
const gateDark = new THREE.MeshBasicMaterial({ color: 0x140a3a });
for (let i = 0; i < GATE_N; i++) {
  const g = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(4.85, 0.3, 10, 40, Math.PI), gateDark);
  g.add(arch);
  const archGlow = new THREE.Mesh(new THREE.TorusGeometry(4.85, 0.11, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
  archGlow.position.z = 0.12;
  g.add(archGlow);
  const stripMatL = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const stripMatR = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  [-1, 1].forEach(s => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.0, 0.42), gateDark);
    post.position.set(s * 4.85, 2.5, 0);
    g.add(post);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.6, 0.12), s < 0 ? stripMatL : stripMatR);
    strip.position.set(s * 4.6, 2.5, 0.05);
    g.add(strip);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), gateDark);
    foot.position.set(s * 4.85, 0.25, 0);
    g.add(foot);
  });
  g.visible = false;
  scene.add(g);
  gates.push({ group: g, stripL: stripMatL, stripR: stripMatR, active: false, z: 0 });
}

// ---------------------------------------------------------------- fx: ring bursts + explosion
const BURST_N = 12;
const bursts = [];
for (let i = 0; i < BURST_N; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.visible = false;
  sp.renderOrder = 20;
  scene.add(sp);
  bursts.push({ sp, t: 0, dur: 0.4, size: 2, active: false });
}
let burstIdx = 0;
function spawnBurst(pos, color, size, dur) {
  const b = bursts[burstIdx++ % BURST_N];
  b.t = 0; b.dur = dur; b.size = size; b.active = true;
  b.sp.visible = true;
  b.sp.position.copy(pos);
  b.sp.material.color.set(color);
}

const BOOM_N = 90;
const boomPos = new Float32Array(BOOM_N * 3);
const boomVel = new Float32Array(BOOM_N * 3);
const boomCol = new Float32Array(BOOM_N * 3);
const boomGeo = new THREE.BufferGeometry();
boomGeo.setAttribute('position', new THREE.BufferAttribute(boomPos, 3));
boomGeo.setAttribute('color', new THREE.BufferAttribute(boomCol, 3));
const boomMat = new THREE.PointsMaterial({ map: starTex, size: 1.1, transparent: true, opacity: 0, vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending });
const boom = new THREE.Points(boomGeo, boomMat);
boom.frustumCulled = false;
scene.add(boom);
let boomLife = 0;
function explode(pos) {
  boomLife = 0;
  const c = new THREE.Color();
  for (let i = 0; i < BOOM_N; i++) {
    const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
    const sp = rand(6, 26);
    boomPos[i * 3] = pos.x; boomPos[i * 3 + 1] = pos.y; boomPos[i * 3 + 2] = pos.z;
    boomVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
    boomVel[i * 3 + 1] = Math.cos(ph) * sp * 0.8 + 4;
    boomVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    c.set(pick([0xffffff, 0x9ff4ff, 0xff9dfb, 0xffd23d, 0xff5c7a])).multiplyScalar(rand(0.6, 1.2));
    boomCol[i * 3] = c.r; boomCol[i * 3 + 1] = c.g; boomCol[i * 3 + 2] = c.b;
  }
  boomGeo.attributes.position.needsUpdate = true;
  boomGeo.attributes.color.needsUpdate = true;
  boomMat.opacity = 1;
  spawnBurst(pos, 0xffffff, 10, 0.5);
  spawnBurst(pos, 0xff2df0, 14, 0.7);
  spawnBurst(pos, 0xff4b6b, 8, 0.45);
}
function updateBoom(dt) {
  if (boomLife <= 0) return;
  boomLife += dt;
  if (boomLife > 1.3) { boomMat.opacity = 0; return; }
  for (let i = 0; i < BOOM_N; i++) {
    boomPos[i * 3] += boomVel[i * 3] * dt;
    boomPos[i * 3 + 1] += boomVel[i * 3 + 1] * dt;
    boomPos[i * 3 + 2] += boomVel[i * 3 + 2] * dt;
    boomVel[i * 3 + 1] -= 16 * dt;
  }
  boomGeo.attributes.position.needsUpdate = true;
  boomMat.opacity = 1 - boomLife / 1.3;
  boomMat.size = 1.1 * (1 - boomLife * 0.35);
}
function updateBursts(dt) {
  for (const b of bursts) {
    if (!b.active) continue;
    b.t += dt / b.dur;
    if (b.t >= 1) { b.active = false; b.sp.visible = false; continue; }
    const e = easeOut(b.t);
    b.sp.scale.setScalar(lerp(0.6, b.size, e));
    b.sp.material.opacity = (1 - b.t) * 0.95;
  }
}

// ---------------------------------------------------------------- spawn helpers
function spawnObstacle(lane, z) {
  const o = obstacles.find(o => !o.active);
  if (!o) return;
  o.active = true;
  o.lane = lane;
  o.z = z;
  o.group.visible = true;
  o.group.position.set(LANES[lane], 1.4, z);
}
function spawnOrb(lane, z) {
  const o = orbs.find(o => !o.active);
  if (!o) return;
  o.active = true; o.taken = false; o.lane = lane; o.z = z;
  o.group.visible = true;
  o.group.position.set(LANES[lane], 1.4, z);
}
function spawnGate(z) {
  const g = gates.find(g => !g.active);
  if (!g) return;
  g.active = true; g.z = z; g.group.visible = true;
  g.group.position.set(0, 0, z);
}

// ---------------------------------------------------------------- game state
const state = { phase: 'menu', speed: 0, dist: 0, score: 0, combo: 1, maxCombo: 1, lives: 1 };
let playerLane = 1;          // index into LANES
let playerTargetX = LANES[1];
let spawnTimer = 0;
let gateTimer = 0;
let shake = 0;
let hitCooldown = 0;
let timeScale = 1;           // hit-stop on crash
let bank = 0;                // camera roll
let fov = 78;
let lastCombo = 1;

// localStorage can throw in sandboxed/private contexts — guard it
const storage = (() => {
  try { const t = '__nova_t'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); return window.localStorage; }
  catch (e) { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
})();
let best = parseInt(storage.getItem('nova_best') || '0', 10);

const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const comboEl = document.getElementById('combo');
const speedFill = document.getElementById('speed-fill');
const menuBestEl = document.getElementById('menu-best-v');
const popsEl = document.getElementById('pops');
const flashEl = document.getElementById('flash');

function setPhase(p) {
  state.phase = p;
  document.getElementById('menu').classList.toggle('hidden', p !== 'menu');
  document.getElementById('gameover').classList.toggle('hidden', p !== 'dead');
  document.getElementById('hud').classList.toggle('show', p !== 'menu');
}

function resetGame() {
  state.dist = 0; state.score = 0; state.combo = 1; state.maxCombo = 1;
  state.lives = 1; state.speed = BASE_SPEED;
  playerLane = 1; playerTargetX = LANES[1]; ship.position.x = LANES[1];
  ship.position.y = 1.1; ship.rotation.set(0, 0, 0); ship.visible = true;
  shipShadow.visible = true; shipGlow.visible = true;
  camera.position.x = 0; camera.position.y = 6.2; camera.position.z = 11.5;
  bank = 0; fov = 78; timeScale = 1; lastCombo = 1;
  spawnTimer = 0; gateTimer = 0; shake = 0; hitCooldown = 0;
  obstacles.forEach(o => { o.active = false; o.group.visible = false; });
  orbs.forEach(o => { o.active = false; o.group.visible = false; });
  gates.forEach(g => { g.active = false; g.group.visible = false; });
  // pre-seed a clean runway
  for (let z = -40; z > SPAWN_Z; z -= 24) spawnGate(z);
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = Math.floor(state.score).toLocaleString();
  speedEl.textContent = Math.round(state.speed);
  const pct = clamp((state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1) * 100;
  speedFill.style.width = pct.toFixed(1) + '%';
  const showCombo = state.combo > 1;
  comboEl.classList.toggle('on', showCombo);
  if (showCombo) {
    comboEl.textContent = 'COMBO x' + state.combo;
    if (state.combo !== lastCombo) {
      comboEl.animate(
        [{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }],
        { duration: 180, easing: 'cubic-bezier(.2,.7,.3,1.4)' }
      );
    }
  }
  lastCombo = state.combo;
}

// floating score popups projected from world space
const _proj = new THREE.Vector3();
function spawnPop(text, worldPos, color) {
  _proj.copy(worldPos).project(camera);
  if (_proj.z > 1) return;
  const el = document.createElement('span');
  el.className = 'pop';
  el.textContent = text;
  el.style.color = color;
  el.style.left = ((_proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
  el.style.top = ((-_proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
  popsEl.appendChild(el);
  setTimeout(() => el.remove(), 850);
}

// ---------------------------------------------------------------- crash
function crash() {
  if (state.phase !== 'playing') return;
  state.phase = 'dead';
  shake = 1.2;
  timeScale = 0.2;
  caSpike = 0.0065;
  audio.crash();
  audio.setThrottle(0);
  explode(ship.position);
  ship.visible = false;
  shipShadow.visible = false;
  shipGlow.visible = false;
  flashEl.classList.add('on');
  setTimeout(() => flashEl.classList.remove('on'), 110);
  finalize();
}
function finalize() {
  const s = Math.floor(state.score);
  document.getElementById('final-score').textContent = s.toLocaleString();
  document.getElementById('final-best').textContent = best.toLocaleString();
  const nb = s > best;
  if (nb) { best = s; storage.setItem('nova_best', String(best)); }
  menuBestEl.textContent = best.toLocaleString();
  document.getElementById('newbest').classList.toggle('on', nb);
  setPhase('dead');
}

// ---------------------------------------------------------------- audio
const audio = (() => {
  let ctx, master, started = false, muted = false;
  let o1, o2, engG;
  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1600;
      master.connect(filt); filt.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  const start = () => {
    ensure(); if (started) return; started = true;
    // engine hum (two detuned oscillators, LFO tremolo)
    o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 50;
    o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 100;
    engG = ctx.createGain(); engG.gain.value = 0.04;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
    const lg = ctx.createGain(); lg.gain.value = 4;
    lfo.connect(lg); lg.connect(engG.gain);
    o1.connect(engG); o2.connect(engG); engG.connect(master);
    o1.start(); o2.start(); lfo.start();
  };
  const setThrottle = (p) => {
    if (!ctx || !started || !o1) return;
    const t = ctx.currentTime;
    o1.frequency.setTargetAtTime(46 + p * 46, t, 0.15);
    o2.frequency.setTargetAtTime(92 + p * 96, t, 0.15);
    engG.gain.setTargetAtTime(muted ? 0 : 0.032 + p * 0.05, t, 0.25);
  };
  const pickup = () => {
    if (muted) return; ensure();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.22);
  };
  const crash = () => {
    if (muted) return; ensure();
    const t = ctx.currentTime;
    const len = 0.6;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(120, t + len);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  };
  const toggleMute = () => {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    document.getElementById('mute').textContent = muted ? '🔇' : '🔊';
  };
  return { start, setThrottle, pickup, crash, toggleMute };
})();

// ---------------------------------------------------------------- input
const setLane = (idx) => {
  playerLane = clamp(idx, 0, LANES.length - 1);
  playerTargetX = LANES[playerLane];
};

function handleKey(e) {
  if (state.phase === 'menu') { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); startGame(); } return; }
  if (state.phase === 'dead') { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); resetGame(); setPhase('playing'); audio.start(); } return; }
  if (state.phase === 'playing') {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setLane(playerLane - 1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setLane(playerLane + 1);
    else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { state.phase = 'menu'; setPhase('menu'); }
  }
}
window.addEventListener('keydown', handleKey);

// touch / pointer
let dragStartX = null;
const stage = renderer.domElement;
stage.addEventListener('pointerdown', (e) => {
  if (state.phase !== 'playing') return;
  dragStartX = e.clientX;
});
stage.addEventListener('pointerup', (e) => {
  if (state.phase !== 'playing' || dragStartX === null) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 30) setLane(playerLane + (dx > 0 ? 1 : -1));
  dragStartX = null;
});
window.addEventListener('resize', onResize);
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
}

// start buttons
document.getElementById('start').addEventListener('click', startGame);
document.getElementById('restart').addEventListener('click', () => { resetGame(); setPhase('playing'); audio.start(); });
document.getElementById('mute').addEventListener('click', () => { audio.start(); audio.toggleMute(); });
function startGame() {
  resetGame(); setPhase('playing'); audio.start();
}

// ---------------------------------------------------------------- game loop
const clock = new THREE.Clock();
const _burstPos = new THREE.Vector3();

function spawnPattern() {
  const z = SPAWN_Z;
  // how many lanes blocked this row (1 or 2, typically)
  const blockCount = state.speed > 95 ? randInt(1, 2) : (state.speed > 70 ? randInt(1, 2) : 1);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (let i = 0; i < blockCount; i++) spawnObstacle(lanes[i], z + randInt(0, 1));
  // scatter orbs through free lanes
  const free = [0, 1, 2].filter(l => !lanes.slice(0, blockCount).includes(l));
  free.forEach(l => {
    if (Math.random() < 0.8) spawnOrb(l, z + rand(-6, 4));
  });
  // occasionally a run of orbs
  if (Math.random() < 0.3) {
    const l = pick([0, 1, 2]);
    const n = randInt(3, 6);
    for (let i = 0; i < n; i++) spawnOrb(l, z - 8 - i * 3.2);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const t = now * 0.001;
  // hit-stop eases back to full speed
  timeScale = lerp(timeScale, 1, Math.min(1, rawDt * 2.4));
  const dt = rawDt * timeScale;

  // --- ambience that runs in every phase ---
  for (const n of nebulas) n.material.rotation += rawDt * 0.008;
  const sunPulse = 1 + Math.sin(t * 0.6) * 0.015;
  sun.scale.set(170 * sunPulse, 170 * sunPulse, 1);
  updateBursts(rawDt);
  updateBoom(rawDt);
  caSpike = Math.max(0, caSpike - rawDt * 0.006);
  grade.uniforms.uCA.value = 0.0011 + caSpike;

  if (state.phase === 'menu') {
    // idle attract mode: slow drift + scroll so the scene feels alive
    const mz = 6 * rawDt;
    gridTex.offset.y += mz / (560 / 120);
    mountainsFar.scroll(mz * 0.98);
    mountainsNear.scroll(mz);
    scrollPylons(mz);
    scrollStreaks(mz, 12);
    for (const g of gates) {
      if (!g.active) continue;
      g.z += mz;
      g.group.position.z = g.z;
      if (g.z > KILL_Z) { g.active = false; g.group.visible = false; spawnGate(SPAWN_Z); }
    }
    for (let i = 0; i < starsNearPos.count; i++) {
      starsNearPos.array[i * 3 + 2] += mz * 0.4;
      if (starsNearPos.array[i * 3 + 2] > 20) starsNearPos.array[i * 3 + 2] -= 320;
    }
    starsNearPos.needsUpdate = true;

    ship.position.x = LANES[1] + Math.sin(now * 0.0005) * 1.4;
    ship.position.y = 1.2 + Math.sin(now * 0.004) * 0.1;
    ship.rotation.z = Math.sin(now * 0.0008) * 0.1;
    ship.rotation.y = Math.sin(now * 0.0005) * 0.12;
    updateTrail();
    animateShipFlames(t);
    shipShadow.position.x = ship.position.x;
    shipGlow.position.x = ship.position.x;

    camera.position.y = 6.2 + Math.sin(now * 0.0004) * 0.35;
    camera.position.z = 11.5 + Math.sin(now * 0.0006) * 0.6;
    camera.position.x = lerp(camera.position.x, ship.position.x * 0.5, 0.03);
    camera.lookAt(ship.position.x * 0.6, 1.6, -20);
    camera.rotateZ(lerp(bank, Math.sin(now * 0.0005) * 0.04, 0.04));
    if (Math.abs(camera.fov - 78) > 0.01) { camera.fov = 78; camera.updateProjectionMatrix(); }
    bloom.strength = 0.85;
  }

  if (state.phase === 'playing') {
    // difficulty ramp + scroll
    state.dist += state.speed * dt;
    state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.dist * 0.09);
    const dz = state.speed * dt;

    // scroll textures + decor (grid must slide at world speed for coherent motion)
    gridTex.offset.y += dz / (560 / 120);
    mountainsFar.scroll(dz * 0.98);
    mountainsNear.scroll(dz);
    scrollPylons(dz);
    scrollStreaks(dz, state.speed);
    sun.position.z += dz * 0.02; if (sun.position.z > -100) sun.position.z = -560;
    sunGlow.position.z = sun.position.z;
    sunRefl.position.z = sun.position.z + 20;
    for (let i = 0; i < starsNearPos.count; i++) {
      starsNearPos.array[i * 3 + 2] += dz * 0.35;
      if (starsNearPos.array[i * 3 + 2] > 20) starsNearPos.array[i * 3 + 2] -= 320;
    }
    starsNearPos.needsUpdate = true;

    // advance obstacles
    for (const o of obstacles) {
      if (!o.active) continue;
      o.z += dz;
      o.group.position.z = o.z;
      o.group.rotation.y += dt * 2.2;
      o.group.position.y = 1.4 + Math.sin(performance.now() * 0.004 + o.phase) * 0.15;
      const pulse = 1 + Math.sin(t * 5 + o.phase) * 0.05;
      o.group.scale.setScalar(pulse);
      o.coreMat.emissiveIntensity = 1.7 + Math.sin(t * 6 + o.phase) * 0.7;
      o.inner.rotation.y += dt * 5;
      o.ringB.rotation.y += dt * 2.6;
      if (o.z > KILL_Z) { o.active = false; o.group.visible = false; o.group.scale.setScalar(1); continue; }
      // collision
      if (hitCooldown <= 0 && o.z > PLAYER_Z - 1.6 && o.z < PLAYER_Z + 1.6 + dz && Math.abs(ship.position.x - LANES[o.lane]) < LANE_W) {
        crash();
      }
    }
    // advance orbs
    for (const ob of orbs) {
      if (!ob.active) continue;
      ob.z += dz;
      ob.group.position.z = ob.z;
      ob.core.rotation.y += dt * 4;
      ob.ring.rotation.x += dt * 3;
      ob.ring.rotation.y += dt * 2;
      ob.group.position.y = 1.4 + Math.sin(performance.now() * 0.006 + ob.z) * 0.2;
      if (ob.z > KILL_Z) { ob.active = false; ob.group.visible = false; continue; }
      if (!ob.taken && ob.z > PLAYER_Z - 1.4 && ob.z < PLAYER_Z + 1.4 && Math.abs(ship.position.x - LANES[ob.lane]) < 1.1) {
        ob.taken = true;
        const gained = 50 * state.combo;
        state.score += gained;
        state.combo = Math.min(9, state.combo + 1);
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        audio.pickup();
        _burstPos.set(LANES[ob.lane], 1.5, ob.z);
        spawnBurst(_burstPos, 0xffd23d, 3.2, 0.4);
        spawnPop('+' + gained.toLocaleString(), _burstPos, '#ffd23d');
        ob.group.visible = false; ob.active = false;
      }
    }
    // advance gates (with traveling light pulse)
    for (const g of gates) {
      if (!g.active) continue;
      g.z += dz;
      g.group.position.z = g.z;
      const c = 0.55 + 0.45 * Math.sin(t * 3.2 + g.z * 0.06);
      g.stripL.color.setRGB(0.05 * c, 0.95 * c, c);
      g.stripR.color.setRGB(0.05 * c, 0.95 * c, c);
      if (g.z > KILL_Z) { g.active = false; g.group.visible = false; }
    }

    // spawn
    spawnTimer -= dz;
    if (spawnTimer <= 0) {
      spawnPattern();
      spawnTimer = rand(34, 62) * (state.speed / BASE_SPEED) * 0.5 + 6;
    }
    gateTimer -= dz;
    if (gateTimer <= 0) {
      spawnGate(SPAWN_Z);
      gateTimer = rand(80, 150);
    }

    // ship movement / tilt
    ship.position.x = lerp(ship.position.x, playerTargetX, 1 - Math.pow(0.0001, dt));
    ship.position.y = 1.1 + Math.sin(performance.now() * 0.004) * 0.08;
    const tiltTarget = clamp((LANES[playerLane] - ship.position.x) * 0.05, -0.5, 0.5);
    ship.rotation.z = lerp(ship.rotation.z, -tiltTarget, 0.15);
    ship.rotation.y = lerp(ship.rotation.y, tiltTarget, 0.15);
    updateTrail();
    animateShipFlames(t);
    shipShadow.position.x = ship.position.x;
    shipGlow.position.x = ship.position.x;
    shipGlow.material.opacity = 0.14 + Math.sin(t * 9) * 0.02;

    // passive score trickle
    state.score += state.speed * dt * 1.2;
    audio.setThrottle((state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED));

    // camera: smoothed chase + banking roll + speed FOV + slight dive
    const spd01 = (state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED);
    camera.position.z = 11.5 + spd01 * 1.3;
    camera.position.x = lerp(camera.position.x, ship.position.x * 0.55, 0.045);
    camera.position.y = 6.2 - spd01 * 0.5 + Math.sin(t * 1.4) * 0.07;
    camera.lookAt(ship.position.x * 0.7, 1.3, -24);
    const bankTarget = clamp((playerTargetX - ship.position.x) * -0.055, -0.13, 0.13);
    bank = lerp(bank, bankTarget, Math.min(1, dt * 6));
    camera.rotateZ(bank);
    fov = lerp(fov, 76 + spd01 * 13, Math.min(1, dt * 3));
    if (Math.abs(camera.fov - fov) > 0.02) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (shake > 0) {
      shake = Math.max(0, shake - rawDt * 2.2);
      camera.position.x += (Math.random() - 0.5) * shake * 1.2;
      camera.position.y += (Math.random() - 0.5) * shake * 1.0;
    }

    hitCooldown = Math.max(0, hitCooldown - dt);
    // intensity pulse for bloom driven by speed
    bloom.strength = 0.8 + spd01 * 0.55;
    updateHUD();
  }

  if (state.phase === 'dead') {
    // cinematic hold: slow push-in, shake decay, explosion plays out
    if (shake > 0) {
      shake = Math.max(0, shake - rawDt * 2.2);
      camera.position.x += (Math.random() - 0.5) * shake * 1.2;
      camera.position.y += (Math.random() - 0.5) * shake * 1.0;
    }
    camera.position.z = Math.max(9.5, camera.position.z - rawDt * 0.6);
    camera.lookAt(ship.position.x * 0.5, 1.5, -18);
    bloom.strength = Math.max(0.9, bloom.strength - rawDt * 0.4);
    audio.setThrottle(0);
  }

  composer.render();
}

// flicker the engine flames + glows (called each frame the ship is visible)
function animateShipFlames(t) {
  for (let i = 0; i < shipFlames.length; i++) {
    const f = shipFlames[i];
    const k = 0.85 + Math.sin(t * 31 + i * 2.4) * 0.18 + Math.sin(t * 17.3 + i) * 0.07;
    f.scale.set(1, 1, k);
    f.material.opacity = 0.7 + k * 0.25;
    shipGlows[i].material.opacity = 0.5 + k * 0.28;
    shipGlows[i].scale.setScalar(1.4 + k * 0.35);
  }
}

animate();
resetGame();  // seed the menu runway
setPhase('menu');
menuBestEl.textContent = best.toLocaleString();

// expose for debugging / testing
window.__nova = { state, ship, startGame, resetGame };
