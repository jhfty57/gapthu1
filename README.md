# 🚀 NOVA RUSH — 3D Neon Runner

A polished, single-page **3D endless-runner** built with [Three.js](https://threejs.org) and WebGL.
Scroll down the neon grid, dodge the energy cores, grab the orbs, and push your speed to the limit.

![style](https://img.shields.io/badge/three.js-r160-7d3bff)
![style](https://img.shields.io/badge/graphics-3D%20%2B%20Bloom-2dff8a)
![style](https://img.shields.io/badge/v2-remastered-ff2df0)

## ✨ v2 — Remastered (đẹp hơn, nét hơn, 3D hơn)

- **Cinematic grade pass** — a custom final shader pass applies ACES tonemapping + correct sRGB
  (Three r160 composer buffers are linear, so the old build was ungraded), a vignette and a subtle
  chromatic aberration that spikes on impact. The image is visibly crisper and richer.
- **Deeper 3D world** — two parallax star layers, two mountain silhouette layers, neon light pylons
  racing past on both sides, 110 instanced 3D light-streaks whose length scales with speed,
  floating score popups, and a blob shadow + engine light-pool that ground the ship in the scene.
- **Cinematic camera** — smoothed chase with banking roll on lane changes, speed-reactive FOV
  kick and a slight dive at top speed; slow-mo hit-stop, explosion burst and screen flash on crash.
- **Refined geometry & FX** — hexagonal machined hull with neon wing edges and flickering engines,
  pulsing containment-ring obstacles, golden ringed orbs, glowing arch gates with a traveling
  light pulse, and a lane-aware grid floor with anisotropic filtering.
- **Performance** — the ~60 per-object point lights were replaced with emissive materials +
  additive glow sprites, so the same look costs far less per frame.
- Gameplay, controls and scoring are unchanged.

---

## ✨ What's in it

- **Full 3D neon synthwave scene** — gradient skydome, retro glowing sun, drifting stars,
  mountain silhouettes, and a scrolling luminous grid floor.
- **Real-time glow** — `UnrealBloomPass` post-processing with speed-reactive intensity,
  ACES filmic tone mapping, and exponential fog.
- **Hovercraft player ship** built from procedural primitives with a dynamic particle exhaust trail.
- **Procedural obstacles & collectibles** (spinning energy cores + golden orbs) using pooled objects
  for smooth performance.
- **Speed, score & combo system** with a persistent best score (safe `localStorage` fallback).
- **Synthesised audio** (Web Audio API): engine hum, pickup blips, crash noise — no audio files needed.
- **Works on desktop & mobile** — keyboard (←/→ or A/D), swipe / tap to steer.

## 🎮 How to play

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move left / right | `←` `→` or `A` `D` | swipe or tap the sides |
| Start / restart | `Space` or **Start** button | tap **Start / Retry** |
| Mute | 🔊 button | 🔊 button |

**Goal:** dodge the red cores, collect the gold orbs to build your combo, survive as long as you can.
Speed climbs with distance — how far can you go?

## 🕹️ Run it locally

The game is fully self-contained (Three.js is vendored — no build step, no CDN needed at runtime).
Any static file server works:

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000
```

or

```bash
npm run start
```

> Why a server and not just double-clicking `index.html`? ES modules + import maps need to be
> served over HTTP. Open the dev server and the **live preview** in the browser.

## 🗂️ Project structure

```
index.html                # page + import map + UI/HUD overlays (menu, game over)
game.js                   # the whole game engine (scene, ship, world, audio, loop)
vendor/
  three.module.js         # Three.js r160 (vendored, offline)
  jsm/postprocessing/     # EffectComposer, RenderPass, UnrealBloomPass, ...
  jsm/shaders/            # CopyShader, LuminosityHighPassShader
package.json              # optional: `npm run start`
```

## 🛠️ Tech notes

- Three.js **r160** vendored locally (works fully offline).
- Post-processing: `EffectComposer` + `RenderPass` + `UnrealBloomPass`.
- Object pooling for obstacles, orbs and gates to keep the frame cost low.
- Safe `localStorage` wrapper so the best-score still works in sandboxed/private contexts.
