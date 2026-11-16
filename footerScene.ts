// 1:1 port of the source footer cluster (pretty 28569-28901):
// AboutHeroLightField (32x16x16 sliced R8 light volume with temporal decay
// blend), Particles (coffee beans on a drifting spiral path with mouse push,
// pairwise contact resolution and slerped orientations, instanced mesh +
// MAX-blended point splats into the light field) and FooterScene (activates
// the bokeh profile and pins the camera).

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  MaxEquation,
  Mesh,
  Object3D,
  OneFactor,
  Points,
  Quaternion,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { RawShaderMaterial, Texture, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { loader } from '../core/Loader';
import { fit } from '../core/math';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { shaderHelper } from '../core/shaderHelper';
import { textureHelper } from '../core/textureHelper';
import {
  coffeeParticlesFrag,
  coffeeParticlesVert,
  lightFieldFrag,
  lightFieldSlice,
  lightFieldSliceBlendFrag,
  lightFieldVert,
} from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { PostProfile } from '../post/PostProfile';
import { bg } from './bg';
import { coaster } from './coaster';

// ------------------------------------------------------------- light field

export class AboutHeroLightField {
  GRID_COUNT = new Vector3(32, 16, 16);
  ORIGIN = new Vector3(0, 0, 0);
  VOLUME_SIZE = new Vector3(1.5, 0, 0);
  container = new Object3D();
  prevSliceRenderTarget: WebGLRenderTarget | null = null;
  currSliceRenderTarget: WebGLRenderTarget | null = null;
  drawnSliceRenderTarget: WebGLRenderTarget | null = null;
  sliceBlendMaterial!: RawShaderMaterial;
  sliceColumnCount = 0;
  sliceRowCount = 0;
  gridSize = 0;
  isReady = false;
  sharedUniforms = {
    u_lightFieldTexture3D: { value: null as Texture | null },
    u_lightFieldMaxLod: { value: 0 },
    u_lightFieldSlicedTexture: { value: null as Texture | null },
    u_lightFieldSlicedTextureSize: { value: new Vector2() },
    u_lightFieldSliceColRowCount: { value: new Vector2() },
    u_lightFieldGridSize: { value: 0 },
    u_lightFieldGridCount: { value: this.GRID_COUNT },
    u_lightFieldVolumeOffset: { value: new Vector3() },
    u_lightFieldVolumeSize: { value: new Vector3() },
  };

  init(): void {
    shaderHelper.addChunk('lightFieldSlice', lightFieldSlice);
    this.gridSize = this.VOLUME_SIZE.x / (this.GRID_COUNT.x - 1);
    this.sharedUniforms.u_lightFieldGridSize.value = this.gridSize;
    this.VOLUME_SIZE.y = this.gridSize * (this.GRID_COUNT.y - 1);
    this.VOLUME_SIZE.z = this.gridSize * (this.GRID_COUNT.z - 1);
    this.sharedUniforms.u_lightFieldVolumeSize.value.setScalar(this.gridSize).add(this.VOLUME_SIZE);
    this.sharedUniforms.u_lightFieldMaxLod.value = Math.log2(
      Math.min(this.GRID_COUNT.x, this.GRID_COUNT.y, this.GRID_COUNT.z),
    );
    const cellCount = this.GRID_COUNT.x * this.GRID_COUNT.y * this.GRID_COUNT.z;
    const cols = (this.sliceColumnCount = Math.ceil(Math.sqrt(cellCount) / this.GRID_COUNT.x));
    const rows = (this.sliceRowCount = Math.ceil(this.GRID_COUNT.z / cols));
    this.sharedUniforms.u_lightFieldSliceColRowCount.value.set(cols, rows);
    const texWidth = this.GRID_COUNT.x * cols;
    const texHeight = this.GRID_COUNT.y * rows;
    this.sharedUniforms.u_lightFieldSlicedTextureSize.value.set(texWidth, texHeight);
    this.currSliceRenderTarget = fboHelper.createRenderTarget(texWidth, texHeight);
    // Source assigns rt.format = RedFormat / rt.internalFormat = "R8" on the
    // WebGLRenderTarget OBJECT, not its texture — a dead write in three (same
    // class of dead param as TextureItem's mipFilter), so the slice RT really
    // is RGBA8. Mirrored as-is.
    (this.currSliceRenderTarget as unknown as Record<string, unknown>).format = RedFormat;
    (this.currSliceRenderTarget as unknown as Record<string, unknown>).internalFormat = 'R8';
    this.prevSliceRenderTarget = this.currSliceRenderTarget.clone();
    this.drawnSliceRenderTarget = this.currSliceRenderTarget.clone();
    fboHelper.clearColor(0, 0, 0, 0, this.currSliceRenderTarget);
    this.sliceBlendMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_lightFieldSlicedTextureSize: this.sharedUniforms.u_lightFieldSlicedTextureSize,
        u_lightFieldSliceColRowCount: this.sharedUniforms.u_lightFieldSliceColRowCount,
        u_lightFieldGridCount: this.sharedUniforms.u_lightFieldGridCount,
        u_lightFieldVolumeOffset: this.sharedUniforms.u_lightFieldVolumeOffset,
        u_lightFieldVolumeSize: this.sharedUniforms.u_lightFieldVolumeSize,
        u_prevSliceTexture: { value: null },
        u_drawnSliceTexture: { value: this.drawnSliceRenderTarget.texture },
      },
      fragmentShader: lightFieldSliceBlendFrag,
    });
    this.isReady = true;
  }

  update(_dt: number): void {
    if (!this.isReady) return;
    const centerShift = this.VOLUME_SIZE.clone().multiplyScalar(0.5).sub(this.ORIGIN).multiplyScalar(-1);
    this.sharedUniforms.u_lightFieldVolumeOffset.value
      .setScalar(-this.gridSize / 2)
      .add(centerShift);
    const renderer = properties.renderer;
    const colorState = fboHelper.getColorState();
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.drawnSliceRenderTarget);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.setRenderTarget(prevRT);
    fboHelper.setColorState(colorState);
  }

  renderMesh(mesh: Object3D): void {
    if (!this.isReady) return;
    const renderer = properties.renderer;
    const colorState = fboHelper.getColorState();
    const prevRT = renderer.getRenderTarget();
    renderer.autoClearColor = false;
    fboHelper.renderMesh(mesh, this.drawnSliceRenderTarget!);
    renderer.setRenderTarget(prevRT);
    fboHelper.setColorState(colorState);
  }

  postUpdate(_dt: number): void {
    if (!this.isReady) return;
    const renderer = properties.renderer;
    const colorState = fboHelper.getColorState();
    const prevRT = renderer.getRenderTarget();
    renderer.autoClear = false;
    const swap = this.prevSliceRenderTarget;
    this.prevSliceRenderTarget = this.currSliceRenderTarget;
    this.currSliceRenderTarget = swap;
    this.sharedUniforms.u_lightFieldSlicedTexture.value = this.currSliceRenderTarget!.texture;
    this.sliceBlendMaterial.uniforms.u_prevSliceTexture.value =
      this.prevSliceRenderTarget!.texture;
    fboHelper.render(this.sliceBlendMaterial, this.currSliceRenderTarget!);
    renderer.setRenderTarget(prevRT);
    fboHelper.setColorState(colorState);
  }
}

export const lightField = new AboutHeroLightField();

// --------------------------------------------------------- coffee particles

const TEXTURE_WIDTH = 32; // browser.isMobile ? 24 : 32 — resolved at init
const PARTICLE_RADIUS = 0.01;
const VELOCITY_DAMPING_RATE = 1;
const MOUSE_PLANE_Z = -0.3;
const MOUSE_RADIUS = 0.1;
const MOUSE_PUSH_FORCE = 0.25;
const PATH_START = new Vector3(-0.5, 0.25, MOUSE_PLANE_Z);
const PATH_END = new Vector3(0.5, -0.25, MOUSE_PLANE_Z);
const PATH_CURVE_FREQUENCY = 8;
const PATH_CURVE_AMPLITUDE = 0.05;
const PATH_CURVE_PHASE_SPEED = 0.25;
const PATH_DRIFT_SPEED = 0.1;
const PATH_DRIFT_RATE = 2;
const PATH_ATTRACTION_RATE = 0.5;
const PATH_SPIRAL_FREQUENCY = 8;
const PATH_RADIUS = 0.05;
const CONTACT_DIST = PARTICLE_RADIUS * 2 * 0.7;
const CONTACT_DIST_SQ = CONTACT_DIST * CONTACT_DIST;

const _v0 = new Vector3();
const _v1 = new Vector3();
const _pos = new Vector3();
const _vel = new Vector3();
const _mousePushForce = new Vector3();
const _quat = new Quaternion();
const _targetQuat = new Quaternion();
const _randQuat = new Quaternion();
const _mat = new Matrix4();
const _segment = new Vector3();
const _tangent = new Vector3();
const _perpU = new Vector3();
const _perpV = new Vector3();
const _worldUp = new Vector3(0, 0, 1);
const _worldUpAlt = new Vector3(0, 1, 0);

export class Particles {
  container = new Object3D();
  mesh: Mesh | null = null;
  lightFieldMesh: Points | null = null;
  positionTexture!: DataTexture;
  rotationTexture!: DataTexture;
  textureWidth = TEXTURE_WIDTH;
  textureHeight = TEXTURE_WIDTH;
  particleCount = TEXTURE_WIDTH * TEXTURE_WIDTH;
  pos!: Float32Array;
  vel!: Float32Array;
  pathRadius!: Float32Array;
  pathPhase!: Float32Array;
  pathSpiralFreqFactor!: Float32Array;
  rotOffset!: Float32Array;
  quat!: Float32Array;
  pathStart = new Vector3();
  pathEnd = new Vector3();
  pathTime = 0;
  mouse = new Vector3();
  mousePrev = new Vector3();
  lightPosition = new Vector3();
  screenXMin = 0;
  screenXMax = 0;
  isActive = false;
  coffeeBeansTexture: Texture | null = null;
  coffeeBeansGeometry: BufferGeometry | null = null;

  private _updatePathBasis(): number {
    _segment.subVectors(this.pathEnd, this.pathStart);
    const len = _segment.length() || 1e-6;
    _tangent.copy(_segment).divideScalar(len);
    _perpU.crossVectors(_tangent, _worldUp);
    if (_perpU.lengthSq() < 1e-6) _perpU.crossVectors(_tangent, _worldUpAlt);
    _perpU.normalize();
    _perpV.crossVectors(_tangent, _perpU).normalize();
    return len;
  }

  private _evalPathTarget(
    t: number,
    pathLength: number,
    radius: number,
    phase: number,
    spiralFreqFactor: number,
  ): void {
    const curveAngle = PATH_CURVE_FREQUENCY * t * pathLength + this.pathTime * PATH_CURVE_PHASE_SPEED;
    const amp = PATH_CURVE_AMPLITUDE;
    _v0.copy(this.pathStart).addScaledVector(_segment, t);
    _v0.addScaledVector(_perpU, amp * Math.sin(curveAngle));
    _v0.addScaledVector(_perpV, amp * Math.cos(curveAngle));
    const spiralAngle = PATH_SPIRAL_FREQUENCY * spiralFreqFactor * t * pathLength + phase;
    _v0.addScaledVector(_perpU, radius * Math.cos(spiralAngle));
    _v0.addScaledVector(_perpV, radius * Math.sin(spiralAngle));
  }

  preInit(): void {
    const width = (this.textureWidth = this.textureHeight = properties.isMobile ? 24 : 32);
    this.particleCount = width * width;
    this.pos = new Float32Array(this.particleCount * 3);
    this.vel = new Float32Array(this.particleCount * 3);
    this.pathRadius = new Float32Array(this.particleCount);
    this.pathPhase = new Float32Array(this.particleCount);
    this.pathSpiralFreqFactor = new Float32Array(this.particleCount);
    this.rotOffset = new Float32Array(this.particleCount * 4);
    this.quat = new Float32Array(this.particleCount * 4);
    this.coffeeBeansTexture = textureHelper.loadRGBATexture(
      settings.TEXTURE_PATH + 'coffeeBean/DIFF.webp',
      settings.TEXTURE_PATH + 'coffeeBean/HEIGHT.webp',
    );
    loader.add(settings.MODEL_PATH + 'COFFEE_BEAN.buf', {
      autoMobile: true,
      onLoad: (content) => {
        this.coffeeBeansGeometry = content as BufferGeometry;
      },
    });
  }

  init(): void {
    const count = this.particleCount;
    const width = this.textureWidth;
    const height = this.textureHeight;
    const positionData = new Float32Array(count * 4);
    const rotationData = new Float32Array(count * 4);
    this.pathStart.copy(PATH_START);
    this.pathEnd.copy(PATH_END);
    const pathLength = this._updatePathBasis();
    for (let i = 0; i < count; i++) {
      this.pathRadius[i] = 2 * Math.random() * PATH_RADIUS;
      this.pathPhase[i] = 2 * Math.PI * Math.random();
      this.pathSpiralFreqFactor[i] = 2 * Math.random();
      const t = Math.random();
      this._evalPathTarget(t, pathLength, this.pathRadius[i], this.pathPhase[i], this.pathSpiralFreqFactor[i]);
      this.pos[i * 3] = _v0.x;
      this.pos[i * 3 + 1] = _v0.y;
      this.pos[i * 3 + 2] = _v0.z;
      this.vel[i * 3] = _tangent.x * PATH_DRIFT_SPEED;
      this.vel[i * 3 + 1] = _tangent.y * PATH_DRIFT_SPEED;
      this.vel[i * 3 + 2] = _tangent.z * PATH_DRIFT_SPEED;
      _vel.fromArray(this.vel, i * 3);
      const speed = _vel.length();
      if (speed > 0.001) {
        _v0.copy(_vel).divideScalar(speed);
        _v1.set(0, 0, 1);
        if (Math.abs(_v0.z) > 0.99) _v1.set(1, 0, 0);
        _v1.crossVectors(_v0, _v1).normalize();
        _mat.makeBasis(_v1, _v0, _v1.clone().cross(_v0).normalize());
        _quat.setFromRotationMatrix(_mat);
      } else {
        _quat.identity();
      }
      _quat.toArray(this.quat, i * 4);
      _v0.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      _quat.setFromAxisAngle(_v0, (Math.random() - 0.5) * 2 * Math.PI);
      _quat.toArray(this.rotOffset, i * 4);
      positionData[i * 4] = this.pos[i * 3];
      positionData[i * 4 + 1] = this.pos[i * 3 + 1];
      positionData[i * 4 + 2] = this.pos[i * 3 + 2];
      positionData[i * 4 + 3] = Math.random();
      rotationData[i * 4 + 3] = 1;
    }
    this.positionTexture = new DataTexture(positionData, width, height, RGBAFormat, FloatType);
    this.rotationTexture = new DataTexture(rotationData, width, height, RGBAFormat, FloatType);
    const instanceUv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      instanceUv[i * 2] = ((i % width) + 0.5) / width;
      instanceUv[i * 2 + 1] = (~~(i / width) + 0.5) / height;
    }
    const geometry = new InstancedBufferGeometry();
    const beanGeometry = this.coffeeBeansGeometry!;
    for (const name in beanGeometry.attributes) {
      geometry.setAttribute(name, beanGeometry.attributes[name]);
    }
    geometry.setIndex(beanGeometry.getIndex());
    geometry.setAttribute('instanceUv', new InstancedBufferAttribute(instanceUv, 2));
    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: coffeeParticlesVert,
        fragmentShader: coffeeParticlesFrag,
        uniforms: Object.assign(
          {
            u_positionTexture: { value: this.positionTexture },
            u_rotationTexture: { value: this.rotationTexture },
            u_lightPosition: { value: this.lightPosition },
            u_coffeeBeansTexture: { value: this.coffeeBeansTexture },
            u_resolution: properties.sharedUniforms.u_resolution,
            u_lightColor: { value: new Color('#700') },
            u_scale: { value: PARTICLE_RADIUS },
          },
          lightField.sharedUniforms,
          bg.sharedUniforms,
          blueNoise.sharedUniforms,
        ),
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.container.add(this.mesh);
    const pointPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pointPositions[i * 3 + 0] = ((i % width) + 0.5) / width;
      pointPositions[i * 3 + 1] = (~~(i / width) + 0.5) / height;
      pointPositions[i * 3 + 2] = 0;
    }
    const pointsGeometry = new BufferGeometry();
    pointsGeometry.setAttribute('position', new BufferAttribute(pointPositions, 3));
    pointsGeometry.setAttribute('instanceUv', new BufferAttribute(instanceUv, 2));
    this.lightFieldMesh = new Points(
      pointsGeometry,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign(
          {
            u_positionTexture: { value: this.positionTexture },
            u_lightPosition: { value: this.lightPosition },
            u_color: { value: new Color('#fff') },
          },
          lightField.sharedUniforms,
        ),
        vertexShader: lightFieldVert,
        fragmentShader: lightFieldFrag,
        blending: CustomBlending,
        blendEquation: MaxEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendEquationAlpha: MaxEquation,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
      }),
    );
    this.lightFieldMesh.frustumCulled = false;
  }

  resize(_width?: number, _height?: number): void {
    if (!properties.camera) return;
    const camera = properties.camera;
    _v0.set(-1, 0, 0.5).unproject(camera).sub(camera.position).normalize();
    const tMin = (MOUSE_PLANE_Z - camera.position.z) / _v0.z;
    this.screenXMin = camera.position.x + tMin * _v0.x;
    _v0.set(1, 0, 0.5).unproject(camera).sub(camera.position).normalize();
    const tMax = (MOUSE_PLANE_Z - camera.position.z) / _v0.z;
    this.screenXMax = camera.position.x + tMax * _v0.x;
    if (this.screenXMin > this.screenXMax) {
      [this.screenXMin, this.screenXMax] = [this.screenXMax, this.screenXMin];
    }
  }

  preUpdate(_dt: number): void {}

  update(dt: number): void {
    if (!this.mesh) return;
    this.mesh.visible = this.isActive;
    if (!this.isActive) return;
    if (this.lightFieldMesh && lightField.isReady) {
      (this.lightFieldMesh.material as RawShaderMaterial).uniforms.u_positionTexture.value =
        this.positionTexture;
      lightField.renderMesh(this.lightFieldMesh);
    }
    const mouse = input.easedMouseDynamics.default.value;
    _v0.set(mouse.x, mouse.y, 0.5).unproject(properties.camera);
    _v0.sub(properties.camera.position).normalize();
    _v0.multiplyScalar((MOUSE_PLANE_Z - properties.camera.position.z) / _v0.z);
    this.mouse.copy(properties.camera.position).add(_v0);
    _mousePushForce.copy(this.mouse).sub(this.mousePrev).multiplyScalar(Math.exp(-dt * 10));
    this.mousePrev.copy(this.mouse);
    this.lightPosition.copy(this.mouse);
    this.lightPosition.z += 0.1;
    this.pathTime += dt;
    const pathLength = this._updatePathBasis();
    const segmentLengthSq = _segment.lengthSq() || 1e-12;
    const count = this.particleCount;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      _pos.fromArray(this.pos, i3);
      _vel.fromArray(this.vel, i3);
      const t = _segment.dot(_v1.copy(_pos).sub(this.pathStart)) / segmentLengthSq;
      this._evalPathTarget(t, pathLength, this.pathRadius[i], this.pathPhase[i], this.pathSpiralFreqFactor[i]);
      _v1.subVectors(_pos, _v0);
      const attraction = 1 - Math.exp(-dt * PATH_ATTRACTION_RATE);
      _vel.x -= _v1.x * attraction;
      _vel.y -= _v1.y * attraction;
      _vel.z -= _v1.z * attraction;
      const driftSpeed = _vel.x * _tangent.x + _vel.y * _tangent.y + _vel.z * _tangent.z;
      const drift = 1 - Math.exp(-dt * PATH_DRIFT_RATE);
      _vel.addScaledVector(_tangent, (PATH_DRIFT_SPEED - driftSpeed) * drift);
      _vel.multiplyScalar(Math.exp(-dt * VELOCITY_DAMPING_RATE));
      _pos.addScaledVector(_vel, dt);
      const wrapped = _segment.dot(_v1.copy(_pos).sub(this.pathStart)) / segmentLengthSq;
      if (wrapped > 1) {
        this._evalPathTarget(0, pathLength, this.pathRadius[i], this.pathPhase[i], this.pathSpiralFreqFactor[i]);
        _pos.copy(_v0);
      } else if (wrapped < 0) {
        this._evalPathTarget(1, pathLength, this.pathRadius[i], this.pathPhase[i], this.pathSpiralFreqFactor[i]);
        _pos.copy(_v0);
      }
      _v0.subVectors(_pos, this.mouse);
      const mouseDist = _v0.length();
      if (mouseDist < MOUSE_RADIUS + PARTICLE_RADIUS && mouseDist > 0.001) {
        _v0.divideScalar(mouseDist);
        const overlap = MOUSE_RADIUS + PARTICLE_RADIUS - mouseDist;
        _vel.addScaledVector(_v0, MOUSE_PUSH_FORCE * overlap);
        _vel.add(_mousePushForce);
      }
      _pos.toArray(this.pos, i3);
      _vel.toArray(this.vel, i3);
    }
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      _pos.fromArray(this.pos, i3);
      for (let j = i + 1; j < count; j++) {
        const j3 = j * 3;
        _v1.fromArray(this.pos, j3);
        _v0.subVectors(_v1, _pos);
        const distSq = _v0.lengthSq();
        if (distSq >= CONTACT_DIST_SQ || distSq < 1e-12) continue;
        const dist = Math.sqrt(distSq);
        const push = (CONTACT_DIST - dist) * 0.5;
        _v0.divideScalar(dist);
        _pos.addScaledVector(_v0, -push);
        _v1.addScaledVector(_v0, push);
        _pos.toArray(this.pos, i3);
        _v1.toArray(this.pos, j3);
      }
    }
    const positionData = this.positionTexture.image.data as Float32Array;
    const rotationData = this.rotationTexture.image.data as Float32Array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      _pos.fromArray(this.pos, i3);
      _vel.fromArray(this.vel, i3);
      const speed = _vel.length();
      if (speed > 0.001) {
        _v0.copy(_vel).divideScalar(speed);
        _v1.set(0, 0, 1);
        if (Math.abs(_v0.z) > 0.99) _v1.set(1, 0, 0);
        _v1.crossVectors(_v0, _v1).normalize();
        _mat.makeBasis(_v1, _v0, _v1.clone().cross(_v0).normalize());
        _targetQuat.setFromRotationMatrix(_mat);
      } else {
        _targetQuat.fromArray(this.quat, i4);
      }
      _quat.fromArray(this.quat, i4).slerp(_targetQuat, 0.8).toArray(this.quat, i4);
      _quat.fromArray(this.quat, i4).multiply(_randQuat.fromArray(this.rotOffset, i4));
      positionData[i4] = _pos.x;
      positionData[i4 + 1] = _pos.y;
      positionData[i4 + 2] = _pos.z;
      rotationData[i4] = _quat.x;
      rotationData[i4 + 1] = _quat.y;
      rotationData[i4 + 2] = _quat.z;
      rotationData[i4 + 3] = _quat.w;
    }
    this.positionTexture.needsUpdate = true;
    this.rotationTexture.needsUpdate = true;
  }
}

export const coffeeParticles = new Particles();

// -------------------------------------------------------------- footer scene

const POST_PROFILE = new PostProfile({
  bloomAmount: 0,
  bokehAmount: 1,
  bokehFocusDistance: 0.75,
  bokehFocalLength: 0.25,
});

export class FooterScene {
  container = new Object3D();
  activeRatio = 0;

  preInit(): void {
    coffeeParticles.preInit();
    this.container.add(coffeeParticles.container);
  }

  init(): void {
    lightField.init();
    coffeeParticles.init();
  }

  resize(width: number, height: number): void {
    coffeeParticles.resize(width, height);
  }

  preUpdate(dt: number): void {
    coffeeParticles.preUpdate(dt);
    if (this.activeRatio > 0) {
      cameraControls.viewOffsetY = (1 - this.activeRatio) * 0.8;
      cameraControls.position.set(0, 0.4, 0.45);
      coaster.isActive = false;
    }
    postprocessing.blendProfile(POST_PROFILE, fit(this.activeRatio, 0, 0.15, 0, 1));
  }

  update(dt: number): void {
    this.container.visible = this.activeRatio > 0;
    if (this.activeRatio > 0) {
      coffeeParticles.isActive = this.activeRatio > 0;
      lightField.update(dt);
      coffeeParticles.update(dt);
    }
  }

  postUpdate(dt: number): void {
    if (this.activeRatio > 0) lightField.postUpdate(dt);
  }
}

export const footerScene = new FooterScene();