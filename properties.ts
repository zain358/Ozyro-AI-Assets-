// Port of the source bundle's `properties` singleton (pretty line 12540-12643),
// restricted to the fields the ported subsystems consume.

import { Color, Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import type { WebGLRenderer } from 'three';
import { MinSignal } from './MinSignal';

// Source camera: TAAPerspectiveCamera (pretty line 17248-17269) with Halton
// jitter, plus the .mvp matrix the engine attaches to it.
function createHaltonSequence(index: number, base: number): number {
  let f = 1;
  let result = 0;
  let i = index;
  do {
    f = f / base;
    result = result + f * (i % base);
    i = Math.floor(i / base);
  } while (i > 0);
  return result;
}
const HALTON_SEQUENCE = Array.from({ length: 8 }, (_, i) => ({
  x: createHaltonSequence(i + 1, 2),
  y: createHaltonSequence(i + 1, 3),
}));

export class EngineCamera extends PerspectiveCamera {
  mvp = new Matrix4();
  currentJitterIndex = 0;
  jitterOffset = new Vector2();
  previousJitterOffset = new Vector2();
  projectionMatrixJittered = new Matrix4();

  applyJitter(resolution: Vector2): void {
    if (resolution.x === 0 || resolution.y === 0) return;
    this.previousJitterOffset.copy(this.jitterOffset);
    this.projectionMatrixJittered.copy(this.projectionMatrix);
    this.currentJitterIndex = (this.currentJitterIndex + 1) % HALTON_SEQUENCE.length;
    const halton = HALTON_SEQUENCE[this.currentJitterIndex];
    this.jitterOffset.x = ((halton.x - 0.5) / resolution.x) * 2;
    this.jitterOffset.y = ((halton.y - 0.5) / resolution.y) * 2;
    const { x, y } = this.jitterOffset;
    const e = this.projectionMatrixJittered.elements;
    e[0] += x * e[3];
    e[4] += x * e[7];
    e[8] += x * e[11];
    e[12] += x * e[15];
    e[1] += y * e[3];
    e[5] += y * e[7];
    e[9] += y * e[11];
    e[13] += y * e[15];
  }

  resetJitter(): void {
    this.currentJitterIndex = 0;
    this.jitterOffset.set(0, 0);
    this.previousJitterOffset.set(0, 0);
    this.projectionMatrixJittered.copy(this.projectionMatrix);
  }
}

export const properties = {
  time: 0,
  deltaTime: 0,
  tick: 0,
  /** Objects queued for renderer.compileAsync during preload (source). */
  compileList: [] as unknown[],
  /** Dispatched on the first pointerup (source; gates iOS device orientation). */
  onFirstClicked: new MinSignal(),
  hasInitialized: false,
  hasStarted: false,
  startTime: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  width: 0,
  height: 0,
  renderer: null as WebGLRenderer | null,
  /** OES_draw_buffers_indexed — used to disable blending on the velocity MRT. */
  drawBuffersExt: null as { disableiOES(cap: number, index: number): void } | null,
  camera: new EngineCamera(),
  resolution: new Vector2(),
  viewportResolution: new Vector2(),
  bgColor: new Color(),
  cameraDirection: new Vector3(),
  isMobile: false,
  useMobileLayout: false,
  webglOpts: { antialias: false, alpha: false, xrCompatible: true },
  paddingX: 0,
  paddingY: 0,
  cameraLookX: 0,
  cameraLookY: 0,
  cameraDistance: 0.01,
  cameraLookStrength: 0.05,
  cameraLookEaseFactor: 5,
  cameraShakePositionStrength: 0.5,
  cameraShakePositionSpeed: 0.15,
  cameraShakeRotationStrength: 0.003,
  cameraShakeRotationSpeed: 0.3,
  bgColorHex: '#100904',
  opacity: 1,
  sharedUniforms: {
    u_useMobileLayout: { value: false },
    u_brdfLut: { value: null as unknown },
    u_cameraMVP: { value: null as unknown },
    u_cameraDirection: { value: null as unknown },
    u_time: { value: 0 },
    u_deltaTime: { value: 1 },
    u_resolution: { value: null as unknown },
    u_viewportResolution: { value: null as unknown },
    u_bgColor: { value: null as unknown },
  },

  /** Source: url.replace(/\.([^.]+)$/, "_MOBILE.$1") */
  getMobileUrl(url: string): string {
    return url.replace(/\.([^.]+)$/, '_MOBILE.$1');
  },
};

properties.sharedUniforms.u_cameraDirection.value = properties.cameraDirection;
properties.sharedUniforms.u_resolution.value = properties.resolution;
properties.sharedUniforms.u_viewportResolution.value = properties.viewportResolution;
properties.sharedUniforms.u_bgColor.value = properties.bgColor;
properties.sharedUniforms.u_cameraMVP.value = properties.camera.mvp;