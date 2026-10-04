# HOLLOWGRIN · Midnight Carnival (React)

The HOLLOWGRIN ride rebuilt in React with React Three Fiber, plus new set pieces. Stack: React 19.3, @react-three/fiber 9, drei 10, three r186, pmndrs postprocessing, zustand, Vite 8 (Rolldown), TypeScript 7.

## Run it

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # type-check + production build into dist/
```

## New since the vanilla version

| | |
|---|---|
| **Drag-to-tear loader** | Grab anywhere and pull. The ticket stub peels back on its perforation hinge (with paper-rip audio) and tears off at 70%. The button still works. |
| **Bulb marquee** | "WELCOME HOME" spelled in about 700 real bulbs across the midway. It powers up letter by letter as you fly through the mouth, and a few bulbs never catch. |
| **Lightning storm** | Forked bolts and thunder. Each flash briefly reveals a colossal Ringmaster silhouette standing in the clouds. |
| **Wet ground** | Blurred, depth-aware reflections (drei `MeshReflectorMaterial`) pick up every bulb. Desktop only. |
| **Blackout** | The Big Top's house lights die. Your cursor becomes a flashlight: a real SpotLight, and the painted cut-outs and curtains read the same cone. Eyes glow in the empty bleachers and shut when your beam finds them. |
| **Beat sync** | Every bulb chase and glow pulses on the beat of the synthesized calliope. |
| **Galloping mounts** | Carousel mounts pitch as they bob. |
| **Fireworks finale** | Rockets burst into spheres, rings, willows, hearts, a grinning clown face sampled from the balloon art, and "HOLLOWGRIN" spelled across the sky. Each burst lights the carnival below. |
| **Balloon hunt** | Pop 13 balloons to unlock a foil Golden Ticket tier in the box office. |
| **Box office** | Opens from the header. It closes with ×, Esc, a click outside, or a click on the ticket itself, which tears in half. |
| **Tickets close on click** | Madame Cackle's tarot card, the finale ticket and the box office ticket all dismiss when you click them. |

## Architecture

```
src/
  config.ts           layout, camera keyframes (+ portrait overrides), story beats, copy
  state/ride.ts       `ride`: mutable per-frame state · `useUI`: zustand UI state · `bridge`: DOM → 3D calls
  lib/audio.ts        Web Audio engine (calliope, beat clock, thunder, fireworks, laughs…); suspends while muted
  lib/ticker.ts       one shared rAF loop for the DOM chrome + event-cached scroll metrics
  three/materials.ts  shared uniforms (power grid, flashlight, lightning, beat), cut-out/glow/bulb shaders
  three/assets.ts     suspense texture loading, repeat variants, bulbs.json
  scene/Director.tsx  scroll → ride progress, camera rig, brownouts, blackout, lightning, scares
  scene/PostFX.tsx    mipmap bloom → ACES → custom grade (grain, speed aberration, glitch, lens warp)
  scene/LightRig.tsx  keeps the light count constant (set-piece lights mirrored to the scene root), so every shader compiles during loading
  scene/*.tsx         one component per attraction, plus Fireworks, Flashlight, Ticket, Particles
  ui/*.tsx            loader, chrome/rail, chapter overlays, box office, cursor, toast
public/assets/        optimized WebP + bulbs.json (generated)
tools/optimize_assets.py
```

Per-frame values never go through React state. Components read `ride` inside `useFrame`, and the DOM chrome polls it from one shared ticker (`lib/ticker.ts`). React re-renders only when UI state actually changes. Scroll position and height are cached from events so the render loop never forces a layout.

Set pieces build their world once in `useMemo([tx])`; `useTextures` returns a stable record so a re-render (e.g. PerformanceMonitor changing the pixel ratio) never rebuilds them. Lights inside set pieces are anchors: `LightRig` mirrors them at the scene root and darkens them while their set piece is hidden, so the renderer's light count, and with it the shader program set, never changes mid-ride.

The production build splits `three`, `postprocessing` (`fx`) and the rest of `node_modules` (`vendor`) into separate long-cached chunks (see `vite.config.ts`).

## Assets

The source PNGs live in `assets/`. After changing any of them, regenerate the web versions in `public/assets/`:

```bash
npm run assets     # needs Python 3 with Pillow, numpy, scipy
```

## Debug

Append `?debug` to the URL to expose `window.__ec` (ride state, scene, camera, renderer, UI store, uniforms, audio engine). Set `window.__ecDebugCam = { pos, look }` (Vector3s) to take over the camera.
