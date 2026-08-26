import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';

/* =========================================================================
   NOVA RUSH — a 3D neon endless runner
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

// ---------------------------------------------------------------- renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0220, 0.011);

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
  /*strength*/ 0.8, /*radius*/ 0.6, /*threshold*/ 0.16
);
composer.addPass(bloom);

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0x33214d, 1.4));
const key = new THREE.DirectionalLight(0xffd9ff, 0.9);
key.position.set(8, 14, 6);
scene.add(key);
const rim = new THREE.PointLight(0x22ffee, 1.4, 90);
rim.position.set(-12, 6, -30);
scene.add(rim);
const rim2 = new THREE.PointLight(0xff2df0, 1.6, 90);
rim2.position.set(12, 5, -40);
scene.add(rim2);

// ---------------------------------------------------------------- textures
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#08001a';
  g.fillRect(0, 0, 256, 256);
  // faint base grid
  g.strokeStyle = 'rgba(90,40,160,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = i * 64;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
  }
  // glowing horizon lines (the "speed" lines)
  g.strokeStyle = 'rgba(255,45,240,0.9)';
  g.lineWidth = 3;
  g.shadowColor = '#ff2df0'; g.shadowBlur = 12;
  for (let i = 0; i <= 4; i++) { const p = i * 64; g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke(); }
  g.strokeStyle = 'rgba(0,229,255,0.9)';
  for (let i = 0; i <= 4; i++) { const p = i * 64; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 120);
  return t;
}

function skyTexture() {
  // vertical gradient used on an inside-out sphere
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0.00, '#040010');   // top
  grd.addColorStop(0.45, '#16043a');
  grd.addColorStop(0.72, '#3a0a5e');
  grd.addColorStop(0.86, '#7a168f');
  grd.addColorStop(1.00, '#c22ba8');   // horizon
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
  grd.addColorStop(0, 'rgba(255,250,180,1)');
  grd.addColorStop(0.35, 'rgba(255,150,90,1)');
  grd.addColorStop(0.62, 'rgba(255,60,160,0.85)');
  grd.addColorStop(1, 'rgba(255,45,240,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  // horizontal "retro sun" stripe artifacts
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) { g.fillRect(0, 150 + i * 14, 256, 4); }
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

// ---------------------------------------------------------------- sky + sun + stars
const skyGeo = new THREE.SphereGeometry(700, 32, 24);
const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false });
scene.add(new THREE.Mesh(skyGeo, skyMat));

const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false }));
sun.scale.set(150, 150, 1);
sun.position.set(0, 28, -520);
scene.add(sun);
// mirrored sun glow on horizon
const sunRefl = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), fog: false, depthWrite: false, opacity: 0.35 }));
sunRefl.scale.set(110, 110, 1);
sunRefl.position.set(0, 10, -500);
scene.add(sunRefl);

const starCount = 900;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPos[i * 3] = rand(-600, 600);
  starPos[i * 3 + 1] = rand(20, 300);
  starPos[i * 3 + 2] = rand(-600, -60);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ map: starTexture(), size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xbfdcff, sizeAttenuation: true });
scene.add(new THREE.Points(starGeo, starMat));

// ---------------------------------------------------------------- mountains
const mtnMat = new THREE.MeshBasicMaterial({ color: 0x060014, fog: true });
const mountains = [];
const mtnSpots = [-1, 1];
function makeMountains(side) {
  const group = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const w = rand(8, 22), h = rand(10, 34), d = rand(20, 30);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), mtnMat);
    cone.rotation.y = rand(0, Math.PI);
    cone.position.set(side * rand(18, 60), h / 2 - 0.5, -rand(30, 460));
    cone.scale.z = rand(0.4, 1.1);
    group.add(cone);
  }
  scene.add(group);
  return group;
}
mountains.push(makeMountains(-1), makeMountains(1));

// ---------------------------------------------------------------- grid floor
const gridTex = gridTexture();
const floorGeo = new THREE.PlaneGeometry(90, 560, 1, 1);
const floorMat = new THREE.MeshBasicMaterial({ map: gridTex, fog: true });
floorMat.map.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, -200);
scene.add(floor);

// neon side walls / tracks edges
function edgeLine(x, color) {
  const mat = new THREE.MeshBasicMaterial({ color });
  const geo = new THREE.BoxGeometry(0.3, 0.3, 560);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, 0.15, -200);
  scene.add(m);
}
edgeLine(LANES[0] - 1.8, 0xff2df0);
edgeLine(LANES[2] + 1.8, 0x00e5ff);

// ---------------------------------------------------------------- ship
function buildShip() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x0e0a2a, metalness: 0.9, roughness: 0.35, emissive: 0x14003a, emissiveIntensity: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x22ffee });

  // body
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 12), hull);
  core.rotation.x = Math.PI / 2;
  core.position.z = 0.6;
  g.add(core);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 12), hull);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.0;
  g.add(nose);

  // wings
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x141040, metalness: 0.8, roughness: 0.4, emissive: 0x120135, emissiveIntensity: 0.8 });
  const wingGeo = new THREE.BoxGeometry(0.16, 0.08, 1.8);
  [-1, 1].forEach(s => {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(s * 1.15, 0, 0.4);
    wing.rotation.z = s * -0.35;
    g.add(wing);
    // neon wing tip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), glow);
    tip.position.set(s * 2.05, 0, 0.2);
    g.add(tip);
  });

  // cockpit
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x5ff6ff, emissive: 0x2ee0ff, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.2 }));
  cockpit.position.set(0, 0.42, -0.05);
  g.add(cockpit);

  // engine nozzles
  const engineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach(s => {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 12), hull);
    e.rotation.x = Math.PI / 2;
    e.position.set(s * 0.42, 0, 1.6);
    g.add(e);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 10), engineMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(s * 0.42, 0, 2.15);
    flame.material = new THREE.MeshBasicMaterial({ color: 0x7df4ff });
    g.add(flame);
  });

  // light
  const pl = new THREE.PointLight(0x33eeff, 2.4, 18, 2);
  pl.position.set(0, 0.6, 1);
  g.add(pl);
  return g;
}
const ship = buildShip();
ship.position.set(0, 1.1, PLAYER_Z);
scene.add(ship);

// ---------------------------------------------------------------- ship trail
const TRAIL_N = 70;
const trailPos = new Float32Array(TRAIL_N * 3);
const trailCol = new Float32Array(TRAIL_N * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailMat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: starTexture() });
const trail = new THREE.Points(trailGeo, trailMat);
trail.frustumCulled = false;
scene.add(trail);
let trailHead = 0;

function updateTrail() {
  trailHead = (trailHead + 1) % TRAIL_N;
  trailPos[trailHead * 3] = ship.position.x + rand(-0.1, 0.1);
  trailPos[trailHead * 3 + 1] = ship.position.y - 0.2 + rand(-0.05, 0.05);
  trailPos[trailHead * 3 + 2] = ship.position.z + 1.6;
  const hue = Math.sin(performance.now() * 0.005) * 0.5 + 0.5;
  trailCol[trailHead * 3] = 0.0;
  trailCol[trailHead * 3 + 1] = 0.6 + hue * 0.4;
  trailCol[trailHead * 3 + 2] = 0.8 + (1 - hue) * 0.2;
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- obstacle pool
const gemMat = new THREE.MeshStandardMaterial({ color: 0x120529, emissive: 0xffffff, emissiveIntensity: 0.0, metalness: 0.6, roughness: 0.25 });
gemMat.emissive = new THREE.Color(0xff4b5c);
gemMat.emissiveIntensity = 1.6;
const gemColorMat = () => new THREE.MeshStandardMaterial({ color: 0x120029, emissive: 0xff2d4d, emissiveIntensity: 1.7, metalness: 0.5, roughness: 0.3 });

const obstacles = [];
const OB_POOL = 22;
for (let i = 0; i < OB_POOL; i++) {
  const g = new THREE.Group();
  const m = gemColorMat();
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), m);
  body.scale.set(0.7, 1.3, 0.7);
  g.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff2d4d }));
  g.add(ring);
  const pl = new THREE.PointLight(0xff2d4d, 1.4, 10, 2);
  pl.position.y = 0;
  g.add(pl);
  g.visible = false;
  scene.add(g);
  obstacles.push({ group: g, body, active: false, lane: 0, z: 0 });
}

// ---------------------------------------------------------------- orb pool
const orbs = [];
const ORB_POOL = 30;
for (let i = 0; i < ORB_POOL; i++) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
  g.add(core);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 16), new THREE.MeshBasicMaterial({ color: 0x2dff8a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  const pl = new THREE.PointLight(0xffd23d, 1.1, 8, 2);
  g.add(pl);
  g.visible = false;
  scene.add(g);
  orbs.push({ group: g, core, active: false, lane: 0, z: 0, taken: false });
}

// ---------------------------------------------------------------- gates (decorative arches)
const gates = [];
const GATE_N = 10;
const gateMat = new THREE.MeshBasicMaterial({ color: 0x0a0420 });
for (let i = 0; i < GATE_N; i++) {
  const g = new THREE.Group();
  const barMat = new THREE.MeshBasicMaterial({ color: 0x4d2fff });
  const railGeo = new THREE.BoxGeometry(9.6, 0.35, 0.35);
  const top = new THREE.Mesh(railGeo, barMat); top.position.y = 7.2;
  g.add(top);
  [-1, 1].forEach(s => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35), barMat);
    post.position.set(s * 4.7, 3.6, 0);
    g.add(post);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), gateMat);
    foot.position.set(s * 4.7, 0.2, 0);
    g.add(foot);
  });
  // glowing top strip
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.1, 0.5), stripMat);
  strip.position.y = 7.3;
  g.add(strip);
  const pl = new THREE.PointLight(0x00e5ff, 1.2, 26, 2);
  pl.position.y = 7.2;
  g.add(pl);
  g.visible = false;
  scene.add(g);
  gates.push({ group: g, active: false, z: 0 });
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

// localStorage can throw in sandboxed/private contexts — guard it
const storage = (() => {
  try { const t = '__nova_t'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); return window.localStorage; }
  catch (e) { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
})();
let best = parseInt(storage.getItem('nova_best') || '0', 10);
const scoreEl = document.getElementById('score');
const speedEl = document.getElementById('speed');
const comboEl = document.getElementById('combo');

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
  camera.position.x = 0; camera.position.y = 6.2; camera.position.z = 11.5;
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
  const showCombo = state.combo > 1;
  comboEl.classList.toggle('on', showCombo);
  if (showCombo) comboEl.textContent = 'COMBO x' + state.combo;
}

// ---------------------------------------------------------------- crash
function crash() {
  if (state.phase !== 'playing') return;
  state.phase = 'dead';
  shake = 1;
  audio.crash();
  ship.visible = false;
  finalize();
}
function finalize() {
  const s = Math.floor(state.score);
  document.getElementById('final-score').textContent = s.toLocaleString();
  document.getElementById('final-best').textContent = best.toLocaleString();
  const nb = s > best;
  if (nb) { best = s; storage.setItem('nova_best', String(best)); }
  document.getElementById('newbest').classList.toggle('on', nb);
  setPhase('dead');
}

// ---------------------------------------------------------------- audio
const audio = (() => {
  let ctx, master, started = false, muted = false;
  const ensure = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.5;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1400;
      master.connect(filt); filt.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  const start = () => {
    ensure(); if (started) return; started = true;
    // engine hum
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 140;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
    const lg = ctx.createGain(); lg.gain.value = 4;
    lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); o2.connect(g); g.connect(master);
    o.start(); o2.start(); lfo.start();
    audio._engine = g;
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
  return { start, pickup, crash, toggleMute };
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
let running = false;

function spawnPattern() {
  const z = SPAWN_Z;
  // how many lanes blocked this row (1 or 2, typically)
  const blockCount = state.speed > 95 ? randInt(1, 2) : (state.speed > 70 ? randInt(1, 2) : 1);
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  // ensure at least one free lane adjacent to a reachable position
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
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (state.phase === 'menu') {
    // idle attract mode: slow drift + scroll so the scene feels alive
    gridTex.offset.y = (gridTex.offset.y + dt * 2.2) % 1;
    ship.position.x = LANES[1] + Math.sin(now * 0.0005) * 1.4;
    ship.position.y = 1.2 + Math.sin(now * 0.004) * 0.1;
    ship.rotation.z = Math.sin(now * 0.0008) * 0.1;
    ship.rotation.y = Math.sin(now * 0.0005) * 0.12;
    updateTrail();
    camera.position.y = 6.2;
    camera.position.z = 11.5 + Math.sin(now * 0.0006) * 0.6;
    camera.position.x = lerp(camera.position.x, ship.position.x * 0.5, 0.03);
    camera.lookAt(ship.position.x * 0.6, 1.6, -20);
    bloom.strength = 0.85;
  }

  if (state.phase === 'playing') {
    // difficulty ramp + scroll
    state.dist += state.speed * dt;
    state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.dist * 0.09);
    const dz = state.speed * dt;

    // scroll textures + decor (grid must slide at world speed for coherent motion)
    gridTex.offset.y += dz / (560 / 120);
    mountains.forEach(m => { m.position.z += dz; if (m.position.z > KILL_Z) m.position.z -= 460 + 120; });
    sun.position.z += dz * 0.02; if (sun.position.z > -100) sun.position.z = -520;
    sunRefl.position.z = sun.position.z + 20;

    // advance obstacles
    const freeObstacles = [];
    for (const o of obstacles) {
      if (!o.active) continue;
      o.z += dz;
      o.group.position.z = o.z;
      o.group.rotation.y += dt * 2.4;
      o.group.position.y = 1.4 + Math.sin(performance.now() * 0.004) * 0.15;
      if (o.z > KILL_Z) { o.active = false; o.group.visible = false; continue; }
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
      ob.group.position.y = 1.4 + Math.sin(performance.now() * 0.006 + ob.z) * 0.2;
      if (ob.z > KILL_Z) { ob.active = false; ob.group.visible = false; continue; }
      if (!ob.taken && ob.z > PLAYER_Z - 1.4 && ob.z < PLAYER_Z + 1.4 && Math.abs(ship.position.x - LANES[ob.lane]) < 1.1) {
        ob.taken = true;
        state.score += 50 * state.combo;
        state.combo = Math.min(9, state.combo + 1);
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        audio.pickup();
        ob.group.visible = false; ob.active = false;
      }
    }
    // advance gates
    for (const g of gates) {
      if (!g.active) continue;
      g.z += dz;
      g.group.position.z = g.z;
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

    // passive score trickle
    state.score += state.speed * dt * 1.2;
    updateTrail();

    // camera
    camera.position.z = 11.5;
    camera.position.x = lerp(camera.position.x, ship.position.x * 0.5, 0.04);
    camera.position.y = 6.2;
    camera.lookAt(ship.position.x, 1.4, -20);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.2);
      camera.position.x += (Math.random() - 0.5) * shake * 1.2;
      camera.position.y += (Math.random() - 0.5) * shake * 1.0;
    }

    hitCooldown = Math.max(0, hitCooldown - dt);
    // intensity pulse for bloom driven by speed
    bloom.strength = 0.8 + (state.speed / MAX_SPEED) * 0.5;
    updateHUD();
  }

  composer.render();
}
animate();

// expose for debugging / testing
window.__nova = { state, ship, startGame, resetGame };
