import {
  AddEquation,
  CustomBlending,
  Euler,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SrcAlphaFactor,
  SRGBColorSpace,
  Vector2,
  Vector3,
  ZeroFactor,
} from 'three';
import type { BufferGeometry, IUniform, Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { BrownianMotion } from '../core/BrownianMotion';
import { browser } from '../core/browser';
import { cameraControls } from '../core/cameraControls';
import { DomGLRect } from '../core/DomGLRect';
import { ease } from '../core/ease';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { clamp, fit, mix } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { WiggleSystem } from '../core/WiggleSystem';
import {
  gripMicroFrag,
  gripMicroVert,
  gripOverlayFrag,
  gripOverlayVert,
  waterBear2DFrag,
  waterBear2DVert,
  waterBearFrag,
  waterBearVert,
} from '../glsl';
import { postprocessing } from '../post/postprocessing';

// ---------------------------------------------------------------- overlay --

let _overlayMesh: Mesh;
let _overlayUniforms: Record<string, IUniform>;

export class TableGripOverlay {
  container = new Object3D();
  zoom = 0;
  opacity = 0;
  blurRatio = 0;
  brightness = 0;
  sharedUniforms = {
    u_texture: { value: null as Texture | null },
    u_zoom: { value: 0 },
    u_opacity: { value: 0 },
    u_aspect: { value: 1 },
    u_texelSize: {
      value: new Vector2(1 / (browser.isMobile ? 800 : 2560), 1 / (browser.isMobile ? 1024 : 1280)),
    },
    u_blurRadius: { value: 10 },
    u_brightness: { value: 0 },
  };

  preInit(): void {
    _overlayUniforms = Object.assign({}, blueNoise.shaderUniforms, this.sharedUniforms);
    _overlayMesh = new Mesh(
      fboHelper.triGeom,
      fboHelper.createRawShaderMaterial({
        uniforms: _overlayUniforms,
        vertexShader: gripOverlayVert,
        fragmentShader: gripOverlayFrag,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquationAlpha: AddEquation,
        blendDstAlpha: OneFactor,
        blendSrcAlpha: ZeroFactor,
        defines: { BLUR_SAMPLE: 6 },
      }),
    );
    _overlayMesh.frustumCulled = false;
    _overlayMesh.renderOrder = 100;
    this.container.add(_overlayMesh);
  }

  init(): void {
    this.sharedUniforms.u_texture.value = loader.load(
      settings.TEXTURE_PATH + 'table/cork_closeup.webp',
      { type: 'texture', channel: 1, autoMobile: true },
    ).content as Texture;
  }

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    _overlayMesh.visible = this.opacity > 0;
    _overlayUniforms.u_zoom.value = this.zoom;
    _overlayUniforms.u_opacity.value = this.opacity;
    _overlayUniforms.u_aspect.value = properties.viewportWidth / properties.viewportHeight;
    _overlayUniforms.u_blurRadius.value = this.blurRatio * 15;
    _overlayUniforms.u_brightness.value = this.brightness;
  }
}

export const tableGripOverlay = new TableGripOverlay();

// ------------------------------------------------------------- water bear --

let _bearMesh: Mesh | null = null;
let _bearCamera: PerspectiveCamera;
let _wiggleSystem: WiggleSystem;
const _e = new Euler();
const rootTargetPosition = new Vector3();
const rootTargetQuaternion = new Quaternion();
let _localOffset = 0;
let _targetLocalOffset = 0;
let _bearTexture: Texture;

interface JointDef {
  index: number;
  speed: number;
  quaternion?: Quaternion;
  motion?: BrownianMotion;
}

const joints: Record<string, JointDef> = {
  head: { index: 39, speed: 2 },
  neck: { index: 34, speed: 2 },
  left1stLeg: { index: 35, speed: 3 },
  right1stLeg: { index: 33, speed: 3 },
  back: { index: 18, speed: 1 },
  left2ndLeg: { index: 22, speed: 2 },
  right2ndLeg: { index: 20, speed: 2 },
  left3rdLeg: { index: 11, speed: 2 },
  right3rdLeg: { index: 10, speed: 2 },
};

export class TableGripMicroWaterBear {
  container = new Object3D();
  isActive = false;
  time = 0;
  activeRatio = 0;

  preInit(): void {
    _bearCamera = new PerspectiveCamera(60, 1, 0.01, 20);
    _bearCamera.position.set(0, 0, 2);
    _bearCamera.updateMatrixWorld(true);
  }

  private _onModelLoaded(geometry: BufferGeometry): void {
    const userData = (
      geometry.userData as {
        meshList: Array<{ userData: { joints: number[]; bones: number[][] } }>;
      }
    ).meshList[0].userData;
    _wiggleSystem = new WiggleSystem(userData.joints, userData.bones);
    _wiggleSystem.stiffness = 2;
    _wiggleSystem.damping = 10;
    for (const name in joints) {
      const joint = joints[name];
      const wiggleJoint = _wiggleSystem.joints[joint.index];
      joint.quaternion = wiggleJoint.localAnimatedQuaternion;
      joint.motion = new BrownianMotion();
      joint.motion._enablePositionNoise = false;
      joint.motion._rotationAmplitude = 1;
      joint.motion._rotationFrequency = 1;
    }
    _bearMesh = new Mesh(
      geometry,
      new ShaderMaterial({
        uniforms: {
          u_texture: { value: _bearTexture },
          u_boneDataTexture: { value: _wiggleSystem.dataTexture },
          u_projectionMatrix: { value: _bearCamera.projectionMatrix },
          u_scale: { value: 1 },
        },
        vertexShader: waterBearVert,
        fragmentShader: waterBearFrag,
        defines: { MAX_BONES: userData.joints.length / 3 },
        blending: CustomBlending,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquation: AddEquation,
        blendEquationAlpha: AddEquation,
        blendSrcAlpha: SrcAlphaFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
      }),
    );
    this.container.add(_bearMesh);
    _bearMesh.renderOrder = 110;
    _bearMesh.frustumCulled = false;
    (_bearMesh.material as ShaderMaterial).onBeforeRender = (
      _renderer,
      _scene,
      _camera,
      _geometry,
      object,
    ) => {
      object.modelViewMatrix.multiplyMatrices(_bearCamera.matrixWorldInverse, object.matrixWorld);
      object.normalMatrix.getNormalMatrix(object.modelViewMatrix);
    };
  }

  init(): void {
    _bearTexture = loader.load(settings.TEXTURE_PATH + 'table/WATERBEAR.webp', {
      type: 'texture',
      channel: 1,
      autoMobile: true,
    }).content as Texture;
    loader.load(settings.MODEL_PATH + 'table/water_bear.buf', {
      onLoad: (content) => this._onModelLoaded(content as BufferGeometry),
    });
  }

  resize(width: number, height: number): void {
    _bearCamera.aspect = width / height;
  }

  preUpdate(_dt: number): void {}

  update(dt: number, visible: boolean): void {
    visible = visible && this.isActive;
    this.container.visible = visible;
    if (this.isActive) {
      this.activeRatio = Math.min(1, this.activeRatio + dt);
    } else {
      this.activeRatio = 0;
    }
    if (!visible || !_bearMesh) return;
    for (const name in joints) {
      const joint = joints[name];
      joint.motion!.update(dt * joint.speed);
      joint.quaternion!.copy(joint.motion!._rotation);
    }
    const showRatio = ease.backOut(
      Math.min(tableGripMicro.showRatio * (1 - tableGripMicro.hideRatio), this.activeRatio),
    );
    const scale = (tableGripMicro.rect.w / properties.viewportHeight) * 4;
    const pxToWorld =
      (Math.tan(((_bearCamera.fov * Math.PI) / 180) * 0.5) * _bearCamera.position.z * 2)
      / properties.viewportHeight;
    const rectCenterX =
      tableGripMicro.rect.x + tableGripMicro.rect.z * 0.5 - properties.viewportWidth * 0.5;
    const rectCenterY =
      tableGripMicro.rect.y + tableGripMicro.rect.w * 0.5 - properties.viewportHeight * 0.5;
    _bearCamera.updateMatrixWorld(true);
    _bearCamera.setViewOffset(
      properties.viewportWidth,
      properties.viewportHeight,
      0,
      rectCenterY,
      properties.viewportWidth,
      properties.viewportHeight,
    );
    _bearCamera.updateProjectionMatrix();
    const worldX = rectCenterX * pxToWorld + _localOffset * tableGripMicro.rect.z * 0.25 * pxToWorld;
    const parallax = 0.2;
    const baseY = -0.5;
    this.container.scale.setScalar(scale);
    this.container.rotation.x = mix((-110 / 180) * Math.PI, 0.1, showRatio);
    this.container.position.set(worldX * (1 - parallax), baseY - 0.1, 0);
    _bearMesh.position.set(0, -baseY / scale, 0);
    dt = clamp(dt, 1 / 120, 1 / 45);
    this.time += dt;
    _targetLocalOffset = tableGripMicro.offsetX;
    _localOffset = mix(_localOffset, _targetLocalOffset, 1 - Math.exp(dt * -10));
    rootTargetPosition.x = (worldX * parallax) / scale;
    if (cameraControls.isDeviceReady) {
      rootTargetQuaternion.copy(cameraControls.deviceQuaterion);
    } else {
      let mx = input.mousePixelXY.x - tableGripMicro.rect.x - tableGripMicro.rect.z * 0.5;
      let my =
        properties.viewportHeight
        - input.mousePixelXY.y
        - tableGripMicro.rect.y
        - tableGripMicro.rect.w * 0.5;
      mx = mx / properties.viewportWidth;
      my = my / properties.viewportHeight;
      rootTargetQuaternion.setFromEuler(
        _e.set(-my / 2, mx, -(_targetLocalOffset - _localOffset)),
      );
    }
    _wiggleSystem.setRootTransform(rootTargetPosition, rootTargetQuaternion);
    _wiggleSystem.update(dt, 3);
    (_bearMesh.material as ShaderMaterial).uniforms.u_scale.value = scale;
  }
}

export const tableGripMicroWaterBear = new TableGripMicroWaterBear();

// ---------------------------------------------------------- water bear 2D --

const SPRITE_HEIGHT = 256;
const SPRITE_WIDTHS = [338, 220, 364, 440, 426, 416];
const SPRITE_SCALES = [1.3, 1.5, 1.3, 1, 1, 1];
const SPRITE_COUNT = SPRITE_WIDTHS.length;
const TOTAL_WIDTH = SPRITE_WIDTHS.reduce((sum, w) => sum + w, 0);
const UV_X_START_BY_SPRITE = new Array<number>(SPRITE_COUNT + 1);
UV_X_START_BY_SPRITE[0] = 0;
for (let i = 0; i < SPRITE_COUNT; i++) {
  UV_X_START_BY_SPRITE[i + 1] = UV_X_START_BY_SPRITE[i] + SPRITE_WIDTHS[i];
}
const SPEED_MIN = 0.1;
const SPEED_MAX = 0.3;
const ANGULAR_VEL_MIN = -1.5;
const ANGULAR_VEL_MAX = 1.5;
const PARTICLE_COUNT = 2 * SPRITE_COUNT;
const MOUSE_SPHERE_RADIUS = 0.05;
const MOUSE_VELOCITY_TRANSFER = 0.1;
const SPEED_DECAY_RATE = 2;
const DEFAULT_POSITION_X = 0;
const DEFAULT_POSITION_Y = -0.25;
const _v0 = new Vector2();
const _v1 = new Vector2();
const _v2 = new Vector2();
const _impulse = new Vector2();
let _wasActive = false;

export class TableGripMicroWaterBear2D {
  container = new Object3D();
  isActive = true;
  mesh: Mesh | null = null;
  opacity = 0;
  positionsArray = new Float32Array(PARTICLE_COUNT * 2);
  rotationsArray = new Float32Array(PARTICLE_COUNT);
  directionArray = new Float32Array(PARTICLE_COUNT * 2);
  uvOffsetsArray = new Float32Array(PARTICLE_COUNT * 2);
  spriteAspectArray = new Float32Array(PARTICLE_COUNT);
  speedArray = new Float32Array(PARTICLE_COUNT);
  targetSpeedArray = new Float32Array(PARTICLE_COUNT);
  angularVelocityArray = new Float32Array(PARTICLE_COUNT);
  spriteScalesArray = new Float32Array(PARTICLE_COUNT);
  collisionArray = new Float32Array(PARTICLE_COUNT * 3);
  scale = 0;
  startAnimationRatio = 0;
  defaultScale = 0.12;

  preInit(): void {}

  init(): void {
    const geometry = new InstancedBufferGeometry();
    const plane = new PlaneGeometry(1, 1, 8, 8);
    for (const name in plane.attributes) {
      geometry.setAttribute(name, plane.attributes[name]);
    }
    geometry.setIndex(plane.getIndex());
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const sprite = i % SPRITE_COUNT;
      const uvStart = UV_X_START_BY_SPRITE[sprite] / TOTAL_WIDTH;
      const uvEnd = UV_X_START_BY_SPRITE[sprite + 1] / TOTAL_WIDTH;
      const aspect = SPRITE_WIDTHS[sprite] / SPRITE_HEIGHT;
      this.uvOffsetsArray[i * 2 + 0] = uvStart;
      this.uvOffsetsArray[i * 2 + 1] = uvEnd;
      this.spriteAspectArray[i] = aspect;
      const angle = Math.random() * Math.PI * 2;
      this.positionsArray[i * 2 + 0] = DEFAULT_POSITION_X;
      this.positionsArray[i * 2 + 1] = DEFAULT_POSITION_Y;
      this.directionArray[i * 2 + 0] = Math.cos(angle);
      this.directionArray[i * 2 + 1] = Math.sin(angle);
      this.rotationsArray[i] = angle;
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      this.speedArray[i] = speed;
      this.targetSpeedArray[i] = speed;
      this.angularVelocityArray[i] =
        ANGULAR_VEL_MIN + Math.random() * (ANGULAR_VEL_MAX - ANGULAR_VEL_MIN);
      this.spriteScalesArray[i] = SPRITE_SCALES[sprite];
      this.collisionArray[i * 3 + 0] = 1;
      this.collisionArray[i * 3 + 1] = 1;
      this.collisionArray[i * 3 + 2] = 1;
    }
    geometry.setAttribute('a_instancePosition', new InstancedBufferAttribute(this.positionsArray, 2));
    geometry.setAttribute('a_instanceRotation', new InstancedBufferAttribute(this.rotationsArray, 1));
    geometry.setAttribute('a_instanceDirection', new InstancedBufferAttribute(this.directionArray, 2));
    geometry.setAttribute('a_uvOffsetX', new InstancedBufferAttribute(this.uvOffsetsArray, 2));
    geometry.setAttribute('a_spriteAspect', new InstancedBufferAttribute(this.spriteAspectArray, 1));
    geometry.setAttribute('a_spriteScale', new InstancedBufferAttribute(this.spriteScalesArray, 1));
    geometry.setAttribute('a_collision', new InstancedBufferAttribute(this.collisionArray, 3));
    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        uniforms: {
          u_texture: {
            value: loader.load(settings.TEXTURE_PATH + 'table/WATERBEAR_2.webp', {
              type: 'texture',
              autoMobile: true,
            }).content as Texture,
          },
          u_scale: { value: this.scale },
          u_resolution: properties.sharedUniforms.u_resolution,
          u_opacity: { value: this.opacity },
        },
        vertexShader: waterBear2DVert,
        fragmentShader: waterBear2DFrag,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquationAlpha: AddEquation,
        blendDstAlpha: OneFactor,
        blendSrcAlpha: ZeroFactor,
      }),
    );
    this.mesh.renderOrder = 100;
    this.mesh.frustumCulled = false;
    this.container.add(this.mesh);
  }

  resize(): void {
    this.defaultScale = properties.useMobileLayout ? 0.08 : 0.12;
  }

  preUpdate(_dt: number): void {}

  reset(): void {
    this.startAnimationRatio = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.positionsArray[i * 2 + 0] = DEFAULT_POSITION_X;
      this.positionsArray[i * 2 + 1] = DEFAULT_POSITION_Y;
      this.collisionArray[i * 3 + 0] = 1;
      this.collisionArray[i * 3 + 1] = 1;
      this.collisionArray[i * 3 + 2] = 1;
    }
  }

  update(dt: number, visible: boolean): void {
    if (!this.mesh) return;
    const opacity =
      tableGripMicroWaterBear.activeRatio
      * tableGripMicro.showRatio
      * (1 - tableGripMicro.hideRatio);
    visible = visible && opacity > 0;
    if (!_wasActive && visible) this.reset();
    _wasActive = visible;
    this.container.visible = visible;
    if (!visible) return;
    this.startAnimationRatio = clamp(this.startAnimationRatio + 0.25 * dt, 0, 1);
    this.scale = fit(this.startAnimationRatio, 0, 0.5, 0, this.defaultScale, ease.elasticOut);
    const material = this.mesh.material as ShaderMaterial;
    material.uniforms.u_scale.value = this.scale;
    material.uniforms.u_opacity.value = opacity;
    const aspect = properties.resolution.x / properties.resolution.y;
    const { positionsArray, directionArray, spriteAspectArray } = this;
    const pos = _v0;
    const dir = _v1;
    const toMouse = _v2;
    const mouse = input.mouseXY;
    const speedLerp = 1 - Math.exp(-dt * SPEED_DECAY_RATE);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.speedArray[i] =
        this.speedArray[i] + (this.targetSpeedArray[i] - this.speedArray[i]) * speedLerp;
      this.speedArray[i] = Math.max(SPEED_MIN, this.speedArray[i]);
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos.fromArray(positionsArray, i * 2);
      dir.fromArray(directionArray, i * 2);
      pos.addScaledVector(dir, (this.speedArray[i] + 1 * (1 - this.startAnimationRatio)) * dt);
      pos.toArray(positionsArray, i * 2);
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let bounced = false;
      const spriteScale = this.spriteScalesArray[i] * this.scale;
      const halfH = 0.5 * spriteScale;
      pos.fromArray(positionsArray, i * 2);
      dir.fromArray(directionArray, i * 2);
      const halfW = (0.5 * spriteScale * spriteAspectArray[i]) / aspect;
      const minX = -1 + halfW;
      const maxX = 1 - halfW;
      const minY = -1 + halfH;
      const maxY = 1 - halfH;
      if (pos.x < minX) {
        pos.x = minX;
        dir.x = -dir.x;
        bounced = true;
        _impulse.set(-1, 0);
      }
      if (pos.x > maxX) {
        pos.x = maxX;
        dir.x = -dir.x;
        bounced = true;
        _impulse.set(1, 0);
      }
      if (pos.y < minY) {
        pos.y = minY;
        dir.y = -dir.y;
        bounced = true;
        _impulse.set(0, -1);
      }
      if (pos.y > maxY) {
        pos.y = maxY;
        dir.y = -dir.y;
        bounced = true;
        _impulse.set(0, 1);
      }
      pos.toArray(positionsArray, i * 2);
      dir.toArray(directionArray, i * 2);
      if (bounced) {
        _v0.set(0, 0);
        _impulse.rotateAround(_v0, -this.rotationsArray[i]);
        this.collisionArray[i * 3 + 0] = _impulse.x;
        this.collisionArray[i * 3 + 1] = _impulse.y;
        this.collisionArray[i * 3 + 2] = 0;
      }
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const spriteScale = this.spriteScalesArray[i] * this.scale;
      const halfH = 0.5 * spriteScale;
      const halfW = (0.5 * spriteScale * spriteAspectArray[i]) / aspect;
      const radius = Math.max(halfW, halfH);
      pos.fromArray(positionsArray, i * 2);
      dir.fromArray(directionArray, i * 2);
      toMouse.subVectors(pos, mouse);
      const distance = toMouse.length();
      const hitRadius = MOUSE_SPHERE_RADIUS + radius;
      if (distance < hitRadius && distance > 1e-5) {
        toMouse.divideScalar(distance);
        dir.dot(toMouse);
        const invDt = 1 / Math.max(dt, 1 / 120);
        _impulse.copy(dir).multiplyScalar(this.speedArray[i]);
        _impulse.addScaledVector(input.deltaXY, MOUSE_VELOCITY_TRANSFER * invDt);
        const impulseLength = _impulse.length();
        if (impulseLength > 1e-6) {
          dir.copy(_impulse).divideScalar(impulseLength);
          this.speedArray[i] = Math.max(SPEED_MIN, impulseLength);
        }
        pos.toArray(positionsArray, i * 2);
        dir.toArray(directionArray, i * 2);
        _impulse.set(toMouse.x, toMouse.y);
        _v0.set(0, 0);
        _impulse.rotateAround(_v0, -this.rotationsArray[i]);
        this.collisionArray[i * 3 + 0] = _impulse.x;
        this.collisionArray[i * 3 + 1] = _impulse.y;
        this.collisionArray[i * 3 + 2] = 0;
      }
    }
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.angularVelocityArray[i] = clamp(
        this.angularVelocityArray[i],
        ANGULAR_VEL_MIN,
        ANGULAR_VEL_MAX,
      );
      this.rotationsArray[i] += this.angularVelocityArray[i] * dt;
      this.collisionArray[i * 3 + 2] += 1 * dt;
      this.collisionArray[i * 3 + 2] = clamp(this.collisionArray[i * 3 + 2], 0, 1);
    }
    this.mesh.geometry.attributes.a_instancePosition.needsUpdate = true;
    this.mesh.geometry.attributes.a_instanceDirection.needsUpdate = true;
    this.mesh.geometry.attributes.a_instanceRotation.needsUpdate = true;
    this.mesh.geometry.attributes.a_collision.needsUpdate = true;
  }
}

export const tableGripMicroWaterBear2D = new TableGripMicroWaterBear2D();

// ------------------------------------------------------------------ micro --

let _microMesh: (Mesh & { needsClipping?: boolean }) | null = null;
let _microUniforms: Record<string, IUniform>;
let _offsetAccum = 0;

export class TableGripMicro {
  rect = new DomGLRect();
  container = new Object3D();
  showRatio = 0;
  hideRatio = 0;
  offsetX = 0;
  delayedOffsetX = 0;
  mouseOffset = new Vector2();
  mouseZoom = 0;

  preInit(): void {
    tableGripMicroWaterBear.preInit();
    this.container.add(tableGripMicroWaterBear.container);
    tableGripMicroWaterBear2D.preInit();
    this.container.add(tableGripMicroWaterBear2D.container);
  }

  init(): void {
    _microUniforms = Object.assign(
      {
        u_texture: {
          value: loader.load(settings.TEXTURE_PATH + 'table/microscopic.webp', {
            type: 'texture',
            colorSpace: SRGBColorSpace,
            wrapS: RepeatWrapping,
            autoMobile: true,
          }).content as Texture,
        },
        u_rect: { value: this.rect },
        u_sceneCacheTexture: postprocessing.sharedUniforms.u_sceneCacheTexture,
        u_textureSize: { value: new Vector2(2048, 512) },
        u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
        u_resolution: properties.sharedUniforms.u_resolution,
        u_uvBoxAspect: { value: 2 },
        u_offsetX: { value: 0 },
        u_mouseOffset: { value: this.mouseOffset },
        u_zoom: { value: 1 },
        u_delayedOffsetX: { value: 0 },
        u_brightness: { value: 1 },
        u_opacity: { value: 0 },
      },
      blueNoise.shaderUniforms,
    );
    _microMesh = new Mesh(
      fboHelper.quadGeom,
      fboHelper.createRawShaderMaterial({
        uniforms: _microUniforms,
        vertexShader: gripMicroVert,
        fragmentShader: gripMicroFrag,
        depthTest: false,
        depthWrite: false,
        derivatives: true,
        glslVersion: GLSL3,
        defines: { BLUR_SAMPLE: 16 },
      }),
    );
    _microMesh.frustumCulled = false;
    _microMesh.renderOrder = 101;
    const baseOnBeforeRender = _microMesh.onBeforeRender;
    _microMesh.onBeforeRender = (...args) => {
      postprocessing.cacheScene(true, 0);
      (baseOnBeforeRender as (...a: unknown[]) => void).call(_microMesh, ...args);
    };
    this.container.add(_microMesh);
    tableGripMicroWaterBear.init();
    tableGripMicroWaterBear2D.init();
  }

  resize(width: number, height: number): void {
    tableGripMicroWaterBear.resize(width, height);
    tableGripMicroWaterBear2D.resize();
  }

  preUpdate(dt: number): void {
    tableGripMicroWaterBear.preUpdate(dt);
    tableGripMicroWaterBear2D.preUpdate(dt);
  }

  update(dt: number): void {
    const ratio = this.showRatio * (1 - this.hideRatio);
    const visible = ratio > 0;
    this.container.visible = visible;
    if (_microMesh) {
      this.delayedOffsetX = mix(this.delayedOffsetX, this.offsetX, 1 - Math.exp(dt * -40));
      _microUniforms.u_offsetX.value = this.offsetX;
      _microUniforms.u_delayedOffsetX.value = this.delayedOffsetX;
      _microUniforms.u_opacity.value = ratio;
      _microUniforms.u_brightness.value = fit(this.showRatio, 0.5, 1, 0.3, 1, ease.cubicOut);
      _microUniforms.u_zoom.value = fit(this.showRatio, 0, 1, 0.5, 1, ease.cubicOut) * this.mouseZoom;
      _offsetAccum += Math.abs(this.offsetX);
      if (ratio) tableGripMicroWaterBear.update(dt, visible);
      tableGripMicroWaterBear2D.update(dt, visible);
      _microUniforms.u_brightness.value *= fit(tableGripMicroWaterBear.activeRatio, 0, 1, 1, 0.15);
    }
  }
}

export const tableGripMicro = new TableGripMicro();

// ------------------------------------------------------------------- grip --

export class TableGrip {
  container = new Object3D();
  showRatio = 0;
  hideRatio = 0;

  preInit(): void {
    tableGripOverlay.preInit();
    this.container.add(tableGripOverlay.container);
    tableGripMicro.preInit();
    this.container.add(tableGripMicro.container);
  }

  init(): void {
    tableGripOverlay.init();
    tableGripMicro.init();
  }

  resize(width: number, height: number): void {
    tableGripOverlay.resize();
    tableGripMicro.resize(width, height);
  }

  preUpdate(dt: number): void {
    tableGripOverlay.preUpdate(dt);
    tableGripMicro.preUpdate(dt);
  }

  update(dt: number): void {
    this.container.visible = this.showRatio > 0 && this.hideRatio < 1;
    tableGripOverlay.opacity = fit(this.showRatio, 0, 0.5, 0, 1);
    tableGripOverlay.zoom = fit(this.showRatio, 0, 1, 1, 1.25);
    tableGripOverlay.blurRatio = fit(this.showRatio, 0.5, 0.9, 0, 1);
    tableGripOverlay.brightness = fit(this.showRatio, 0.65, 1, 1, 0.1);
    tableGripOverlay.brightness = fit(this.hideRatio, 0.75, 1, tableGripOverlay.brightness, 0);
    tableGripOverlay.update(dt);
    tableGripMicro.update(dt);
  }
}

export const tableGrip = new TableGrip();