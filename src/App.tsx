import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { Experience } from './scene/Experience';
import { ride } from './state/ride';
import { isTouch, prefersReducedMotion } from './lib/utils';
import { Loader } from './ui/Loader';
import { Chrome } from './ui/Chrome';
import { Overlays } from './ui/Overlays';
import { BoxOffice } from './ui/BoxOffice';
import { Cursor } from './ui/Cursor';
import { Toast } from './ui/Toast';

const touch = isTouch();
ride.quality = touch ? 'low' : 'high';
ride.reducedMotion = prefersReducedMotion();
const maxDpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 1.75);

export default function App() {
  // canvas-rasterised type (bulb marquee, firework lettering, booth signs) needs Rye loaded first
  const [fontsReady, setFontsReady] = useState(false);
  const [dpr, setDpr] = useState(maxDpr);
  useEffect(() => {
    Promise.race([document.fonts.load('400 64px Rye'), new Promise((r) => setTimeout(r, 2500))]).then(() => setFontsReady(true));
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
  }, []);

  return (
    <>
      <Canvas
        id="scene"
        flat
        dpr={dpr}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 45, near: 0.1, far: 1500, position: [0, 5.2, 38] }}
        style={{ position: 'fixed', inset: 0 }}
        onCreated={({ gl }) => gl.setClearColor('#050204')}
      >
        <PerformanceMonitor
          flipflops={3}
          onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
        />
        {fontsReady && <Experience />}
      </Canvas>
      <Overlays />
      <Chrome />
      <Loader />
      <BoxOffice />
      <Toast />
      <div id="flash" aria-hidden="true" />
      <Cursor />
      <div id="track" aria-hidden="true" />
    </>
  );
}
