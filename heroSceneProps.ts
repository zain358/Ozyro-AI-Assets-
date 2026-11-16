import {
  AddEquation,
  CustomBlending,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  ZeroFactor,
} from 'three';
import type { Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { input } from '../core/input';
import { clamp, fit } from '../core/math';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { textureHelper } from '../core/textureHelper';
import { propFrag, propVert } from '../glsl';
import { bg } from './bg';
import { gobo } from './gobo';
import type { HeroSceneShared } from './heroScene';

const _propAxis = new Vector2();
const _perpVelocity = new Vector2();
const _pa = new Vector2();

export const DEFAULT_PHYSICS = {
  damping: 2,
  collisionRadiusMultiplier: 0.25,
  translationForce: 1,
  rotationForce: 0.01,
  minStrength: 0.001,
  maxDisplacementMultiplier: 0.5,
  oscillationStiffness: 0,
  oscillationDamping: 10,
  oscillationSnap: 0,
  angularRGBRange: 15,
};

export interface PropData {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  needPlainShadow: boolean;
  needBlurredShadow: boolean;
  needsAngularRGB: boolean;
  startX: number;
  startY: number;
  startRot: number;
  maxRotation?: number;
  rotationMultiplier?: number;
  physics?: Partial<typeof DEFAULT_PHYSICS>;
}

export const heroScenePropsData: Record<string, PropData> = {
  pencil: {
    x: 500, y: 1106, width: 128, height: 1320, angle: 52,
    needPlainShadow: false, needBlurredShadow: true, needsAngularRGB: true,
    startX: -600, startY: -780, startRot: 0.3,
    physics: {
      damping: 11, translationForce: 20, rotationForce: 0.12,
      oscillationStiffness: 700, oscillationDamping: 2, oscillationSnap: 4,
      angularRGBRange: 8,
    },
  },
  eraser: {
    x: 924.24, y: 1186.49, width: 180, height: 280, angle: 30.68,
    needPlainShadow: false, needBlurredShadow: true, needsAngularRGB: true,
    startX: -300, startY: -400, startRot: 3,
    physics: {
      damping: 15, translationForce: 20, rotationForce: 0.01,
      oscillationStiffness: 0, angularRGBRange: 5,
    },
  },
  cutter: {
    x: 2574.44, y: 1200.85, width: 192, height: 1024, angle: -55.61,
    needPlainShadow: false, needBlurredShadow: true, needsAngularRGB: true,
    startX: 300, startY: -550, startRot: 1,
    physics: {
      damping: 15, translationForce: 20, rotationForce: 0.1,
      oscillationStiffness: 500, oscillationDamping: 2, oscillationSnap: 0,
      angularRGBRange: 15,
    },
  },
  pen: {
    x: 2040.69, y: 220.92, width: 136, height: 960, angle: -35,
    needPlainShadow: false, needBlurredShadow: true, needsAngularRGB: true,
    startX: 300, startY: 550, startRot: -2,
    physics: {
      damping: 8, translationForce: 20, rotationForce: 0.1,
      oscillationStiffness: 50, oscillationDamping: 2, oscillationSnap: 0,
      angularRGBRange: 10,
    },
  },
  paperclip1: {
    x: 677.11, y: 458.27, width: 100, height: 234, angle: -40.78,
    needPlainShadow: true, needBlurredShadow: false, needsAngularRGB: true,
    startX: 300, startY: 750, startRot: -5,
    physics: { damping: 15, translationForce: 30, rotationForce: 2, oscillationStiffness: 0 },
  },
  paperclip2: {
    x: 350, y: 646.79, width: 100, height: 234, angle: 47.75,
    needPlainShadow: true, needBlurredShadow: false, needsAngularRGB: true,
    startX: -300, startY: -200, startRot: 4,
    physics: { damping: 15, translationForce: 30, rotationForce: 2, oscillationStiffness: 0 },
  },
  paperclip3: {
    x: 450, y: 396, width: 100, height: 234, angle: 111.54,
    needPlainShadow: true, needBlurredShadow: false, needsAngularRGB: true,
    startX: -400, startY: 400, startRot: 4,
    physics: { damping: 15, translationForce: 30, rotationForce: 2, oscillationStiffness: 0 },
  },
};

interface Interaction {
  h: number;
  strength: number;
  forceDir: Vector2;
}

export class HeroSceneProp {
  id: string;
  needsAngularRGB = false;
  needBlurredShadow = false;
  needPlainShadow = false;
  width = 0;
  height = 0;
  x = 0;
  y = 0;
  angle = 0;
  startX = 0;
  startY = 0;
  startRot = 0;
  propTexture!: Texture;
  material!: ShaderMaterial;
  shadowMaterial!: ShaderMaterial;
  mesh!: Mesh;
  startPosition = new Vector2();
  startRotation = 0;
  topPosition = new Vector2();
  bottomPosition = new Vector2();
  centerPosition = new Vector2();
  defaultPosition = new Vector2();
  position = new Vector2();
  positionDisplacement = new Vector2();
  velocity = new Vector2();
  shadowPosition = new Vector2();
  shadowDisplacement = -20;
  plainShadowDisplacement = -3;
  defaultRotation = 0;
  rotation = 0;
  rotationDisplacement = 0;
  angularVelocity = 0;
  oscillationPosition = 0;
  oscillationVelocity = 0;
  oscillationDisplacement = new Vector2();
  isVisible = false;
  maxRotation = 0.1 * Math.PI;
  maxDisplacement = 100;
  rotationMultiplier = 1;
  physics = { ...DEFAULT_PHYSICS };
  mouse = new Vector2();
  mousePrev = new Vector2();
  mouseVelocity = new Vector2();
  private hero: HeroSceneShared;

  constructor(id: string, data: PropData, hero: HeroSceneShared) {
    this.id = id;
    this.hero = hero;
    this.initializeFromData(data);
  }

  initializeFromData(data: PropData): void {
    Object.assign(this, {
      needsAngularRGB: data.needsAngularRGB,
      needBlurredShadow: data.needBlurredShadow,
      needPlainShadow: data.needPlainShadow,
      width: data.width,
      height: data.height,
      x: data.x,
      y: data.y,
      angle: data.angle,
      maxRotation: data.maxRotation !== undefined ? data.maxRotation : this.maxRotation,
      rotationMultiplier:
        data.rotationMultiplier !== undefined ? data.rotationMultiplier : this.rotationMultiplier,
      startX: data.startX,
      startY: data.startY,
      startRot: data.startRot,
    });
    if (data.physics) Object.assign(this.physics, data.physics);
  }

  preInit(expandedViewPixelWidth: number, expandedViewPixelHeight: number): void {
    this.propTexture = textureHelper.loadRGBATexture(
      `${settings.TEXTURE_PATH}hero/${this.id}_color.webp`,
      `${settings.TEXTURE_PATH}hero/${this.id}_alpha.webp`,
      { uvScaleXAlpha: this.needsAngularRGB ? 4 : 1 },
    );
    const uniforms = {
      u_texture: { value: this.propTexture },
      u_uvScale: { value: new Vector2(this.needsAngularRGB ? 1 / 4 : 1, 1) },
      u_uvHeightBias: { value: 3 },
      u_height: { value: 0.01 },
      u_resolution: properties.sharedUniforms.u_resolution,
      u_planeResolution: this.hero.sharedUniforms.u_planeResolution,
      u_screenToWorld: this.hero.sharedUniforms.u_screenToWorld,
      u_zoom: this.hero.sharedUniforms.u_zoom,
      u_cameraMVP: properties.sharedUniforms.u_cameraMVP,
      u_2DlightPos: this.hero.sharedUniforms.u_2DlightPos,
      u_activeRatio: this.hero.sharedUniforms.u_activeRatio,
    };
    this.material = new ShaderMaterial({
      uniforms: Object.assign({}, uniforms, blueNoise.shaderUniforms, bg.sharedUniforms, gobo.sharedUniforms),
      vertexShader: propVert,
      fragmentShader: propFrag,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendEquationAlpha: AddEquation,
      blendDstAlpha: OneFactor,
      blendSrcAlpha: ZeroFactor,
      defines: { BLUR_SAMPLE: 6 },
    });
    this.shadowMaterial = new ShaderMaterial({
      uniforms: {
        u_texture: this.material.uniforms.u_texture,
        u_uvScale: this.material.uniforms.u_uvScale,
        u_shadowOpacity: { value: this.needPlainShadow ? 0.7 : 1 },
      },
      vertexShader: propVert,
      fragmentShader: propFrag,
      defines: { IS_SHADOW: '1' },
    });
    if (this.needsAngularRGB) {
      (this.material.defines as Record<string, unknown>).NEEDS_ANGULAR_RGB = true;
      const angular = { u_angleInfo: { value: new Vector3(0, 0, 0) } };
      Object.assign(this.material.uniforms, angular);
      Object.assign(this.shadowMaterial.uniforms, angular);
    }
    this.mesh = new Mesh(new PlaneGeometry(this.width, this.height), this.material);
    const px = -expandedViewPixelWidth / 2 + this.x;
    const py = expandedViewPixelHeight / 2 - this.y;
    this.mesh.position.set(px, py, 0);
    this.mesh.rotation.z = (-this.angle / 180) * Math.PI;
    this.initializePhysics(expandedViewPixelWidth, expandedViewPixelHeight);
  }

  private initializePhysics(expandedViewPixelWidth: number, expandedViewPixelHeight: number): void {
    this.defaultPosition.set(this.mesh.position.x, this.mesh.position.y);
    this.defaultRotation = this.mesh.rotation.z;
    this.maxDisplacement = this.width * this.physics.maxDisplacementMultiplier;
    this.centerPosition.copy(this.defaultPosition);
    this.topPosition
      .set(-expandedViewPixelWidth / 2 + this.x, expandedViewPixelHeight / 2 - this.y + this.height * 0.5)
      .rotateAround(this.centerPosition, this.defaultRotation);
    this.bottomPosition
      .set(-expandedViewPixelWidth / 2 + this.x, expandedViewPixelHeight / 2 - this.y - this.height * 0.5)
      .rotateAround(this.centerPosition, this.defaultRotation);
  }

  updateForBlurredShadow(lightDir: Vector2): void {
    this.mesh.visible = !!this.needBlurredShadow;
    this.mesh.material = this.shadowMaterial;
    this.shadowPosition
      .copy(this.position)
      .add(this.startPosition)
      .addScaledVector(lightDir, this.shadowDisplacement);
    this.mesh.position.set(
      this.shadowPosition.x + this.oscillationDisplacement.x,
      this.shadowPosition.y + this.oscillationDisplacement.y,
      0,
    );
    this.mesh.rotation.z = this.rotation + this.startRotation;
  }

  updateForPlainShadow(lightDir: Vector2): void {
    this.mesh.visible = !!this.needPlainShadow;
    this.shadowPosition
      .copy(this.position)
      .add(this.startPosition)
      .addScaledVector(lightDir, this.plainShadowDisplacement);
    this.mesh.position.set(
      this.shadowPosition.x + this.oscillationDisplacement.x,
      this.shadowPosition.y + this.oscillationDisplacement.y,
      0,
    );
    this.mesh.rotation.z = this.rotation + this.startRotation;
  }

  updateForColorRender(): void {
    this.mesh.visible = true;
    this.mesh.position.set(
      this.position.x + this.startPosition.x + this.oscillationDisplacement.x,
      this.position.y + this.startPosition.y + this.oscillationDisplacement.y,
      0,
    );
    this.mesh.rotation.z = this.rotation + this.startRotation;
    this.mesh.material = this.material;
    if (this.needsAngularRGB) this.updateAngularRGB();
  }

  private updateAngularRGB(): void {
    const { angularRGBRange } = this.physics;
    const t = fit(this.oscillationPosition, -angularRGBRange, angularRGBRange, -1, 1);
    const idx = clamp(t + 1, 0, 2);
    const frac = idx % 1;
    const from = Math.floor(idx);
    const to = Math.min(from + 1, 2);
    ((this.mesh.material as ShaderMaterial).uniforms.u_angleInfo.value as Vector3).set(from, to, frac);
  }

  update(dt: number): void {
    if (this.id === 'coaster') return;
    this.mousePrev.copy(this.mouse);
    const eased = input.easedMouseDynamics.default.value;
    this.mouse.set(eased.x * this.hero.camera2D.right, eased.y * this.hero.camera2D.top);
    this.mouseVelocity.copy(this.mouse).sub(this.mousePrev).divideScalar(dt);
    const interaction = this.getInteraction();
    if (interaction) this.applyForces(dt, interaction);
    this.integrate(dt);
    this.updateCoords();
  }

  private getInteraction(): Interaction | null {
    const { collisionRadiusMultiplier, minStrength } = this.physics;
    _propAxis.copy(this.bottomPosition).sub(this.topPosition);
    const axisLength = _propAxis.length();
    _propAxis.divideScalar(axisLength);
    _pa.copy(this.mouse).sub(this.topPosition);
    const h = clamp(_pa.dot(_propAxis) / axisLength, 0, 1);
    const cx = this.topPosition.x + _propAxis.x * axisLength * h;
    const cy = this.topPosition.y + _propAxis.y * axisLength * h;
    const dist = Math.sqrt(Math.pow(this.mouse.x - cx, 2) + Math.pow(this.mouse.y - cy, 2));
    const radius = this.width * collisionRadiusMultiplier;
    if (dist > radius) return null;
    const alongVel = this.mouseVelocity.dot(_propAxis);
    _perpVelocity.copy(this.mouseVelocity).addScaledVector(_propAxis, -alongVel);
    const perpSpeed = _perpVelocity.length();
    const strength = fit(dist, 0, radius, 1, 0) * perpSpeed;
    if (strength < minStrength) return null;
    const forceDir =
      perpSpeed > minStrength
        ? _perpVelocity.clone().divideScalar(perpSpeed)
        : this.mouseVelocity.clone().normalize();
    return { h, strength, forceDir };
  }

  private applyForces(dt: number, { h, strength, forceDir }: Interaction): void {
    const { damping, translationForce, rotationForce, oscillationStiffness } = this.physics;
    const decay = Math.exp(-dt * damping);
    const edgeness = Math.abs(h - 0.5) * 2;
    const centerness = 1 - edgeness;
    this.velocity.multiplyScalar(decay);
    this.velocity.addScaledVector(forceDir, strength * centerness * translationForce * dt);
    const lever = h - 0.5;
    const torque = (_propAxis.x * forceDir.y - _propAxis.y * forceDir.x) * lever;
    this.angularVelocity *= decay;
    this.angularVelocity += torque * strength * edgeness * rotationForce * this.rotationMultiplier * dt;
    if (oscillationStiffness > 0) {
      const perp = forceDir.x * -_propAxis.y + forceDir.y * _propAxis.x;
      this.oscillationVelocity += perp * strength * dt;
    }
  }

  private integrate(dt: number): void {
    const { damping } = this.physics;
    const decay = Math.exp(-dt * damping);
    this.positionDisplacement.addScaledVector(this.velocity, dt);
    this.positionDisplacement.multiplyScalar(decay);
    const displacement = this.positionDisplacement.length();
    if (displacement > this.maxDisplacement) {
      this.positionDisplacement.multiplyScalar(this.maxDisplacement / displacement);
    }
    this.position.copy(this.defaultPosition).add(this.positionDisplacement);
    this.rotationDisplacement += this.angularVelocity * dt;
    this.rotationDisplacement *= decay;
    this.rotationDisplacement = clamp(this.rotationDisplacement, -this.maxRotation, this.maxRotation);
    this.rotation = this.defaultRotation + this.rotationDisplacement;
    this.updateOscillation(dt);
  }

  private updateOscillation(dt: number): void {
    const { oscillationStiffness, oscillationDamping, oscillationSnap } = this.physics;
    if (oscillationStiffness <= 0) {
      this.oscillationDisplacement.set(0, 0);
      return;
    }
    const force = -oscillationStiffness * this.oscillationPosition - oscillationDamping * this.oscillationVelocity;
    this.oscillationVelocity += force * dt;
    this.oscillationPosition += this.oscillationVelocity * dt;
    let snapped = this.oscillationPosition;
    if (oscillationSnap > 0) snapped = Math.round(snapped * oscillationSnap) / oscillationSnap;
    this.oscillationDisplacement.set(-_propAxis.y * snapped, _propAxis.x * snapped);
  }

  private updateCoords(): void {
    this.centerPosition.set(
      this.position.x + this.oscillationDisplacement.x,
      this.position.y + this.oscillationDisplacement.y,
    );
    this.topPosition
      .set(this.centerPosition.x, this.centerPosition.y + this.height * 0.5)
      .rotateAround(this.centerPosition, this.rotation);
    this.bottomPosition
      .set(this.centerPosition.x, this.centerPosition.y - this.height * 0.5)
      .rotateAround(this.centerPosition, this.rotation);
  }
}