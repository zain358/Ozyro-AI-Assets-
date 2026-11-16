import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  NearestFilter,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
} from 'three';
import type { BufferGeometry, IUniform, Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { browser } from '../core/browser';
import { ease } from '../core/ease';
import { fit } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { condomFrag, condomVert } from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { TAAMesh } from '../post/TAAMesh';
import { coaster } from './coaster';
import { handScene } from './handScene';

export class WearableCondom {
  container = new Object3D();
  boneCount = 1024;
  frameCount = 32;
  tearRatio = 0;
  opacity = 0;
  textureWidth = this.boneCount * 2;
  textureHeight = this.frameCount * 2;
  frontMesh: TAAMesh | null = null;
  backMesh: TAAMesh | null = null;
  private normalTexture!: Texture;
  private patternTexture!: Texture;
  sharedUniforms = {
    u_animTexture: { value: null as Texture | null },
    u_animTexelSize: { value: new Vector2(1 / this.textureWidth, 1 / this.textureHeight) },
    u_animBlendParams: { value: new Vector3(0, 0, 0) },
    u_boneCount: { value: this.boneCount },
    u_frameCount: { value: this.frameCount },
    u_harmonicsTime: { value: 0 },
    u_opacity: { value: 0 },
    u_offset: { value: 0 },
  };

  preInit(): void {
    this.sharedUniforms.u_animTexture.value = loader.add(
      settings.TEXTURE_PATH + 'wearable/condom/condom_anim.webp',
      { type: 'texture', minFilter: NearestFilter, magFilter: NearestFilter },
    ).content as Texture;
    this.normalTexture = loader.add(settings.TEXTURE_PATH + 'wearable/condom/normal.png', {
      type: 'texture',
    }).content as Texture;
    this.normalTexture.wrapS = this.normalTexture.wrapT = RepeatWrapping;
    this.patternTexture = loader.add(settings.TEXTURE_PATH + 'wearable/condom/pattern.png', {
      type: 'texture',
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      channel: 1,
    }).content as Texture;
    this._load('front');
    this._load('back');
  }

  private _load(side: 'front' | 'back'): void {
    const ext = browser.isMobile || !browser.isSupportAvif ? 'png' : 'avif';
    const base = loader.add(settings.TEXTURE_PATH + `wearable/condom/${side}/base.${ext}`, {
      type: 'texture',
      autoMobile: true,
    }).content as Texture;
    const harmonics0 = loader.add(
      settings.TEXTURE_PATH + `wearable/condom/${side}/harmonics_0.${ext}`,
      { type: 'texture', minFilter: NearestFilter, magFilter: NearestFilter, autoMobile: true },
    ).content as Texture;
    const harmonics1 = loader.add(
      settings.TEXTURE_PATH + `wearable/condom/${side}/harmonics_1.${ext}`,
      { type: 'texture', minFilter: NearestFilter, magFilter: NearestFilter, autoMobile: true },
    ).content as Texture;
    loader.add(settings.MODEL_PATH + `wearable/condom_${side}.buf`, {
      onLoad: (content) =>
        this._onGeometryLoad(side, base, harmonics0, harmonics1, content as BufferGeometry),
    });
  }

  private _onGeometryLoad(
    side: 'front' | 'back',
    base: Texture,
    harmonics0: Texture,
    harmonics1: Texture,
    geometry: BufferGeometry,
  ): void {
    const uniforms: Record<string, IUniform> = Object.assign(
      {
        u_baseTexture: { value: base },
        u_harmonics0Texture: { value: harmonics0 },
        u_harmonics1Texture: { value: harmonics1 },
        u_harmonicsStrength: { value: 0 },
        u_harmonicsFreq: { value: [1, 2, 3, 4, 5] },
        u_uvMap: { value: new Vector4(0, 0, 0, 0) },
        u_pMin: {
          value: new Vector3(-0.3394055962562561, -0.14426785707473755, -0.11583681404590607),
        },
        u_pMax: {
          value: new Vector3(0.24513307213783264, 0.13702133297920227, 0.13621310889720917),
        },
        u_orientMin: {
          value: new Vector4(
            -0.9976852536201477,
            -0.9990588426589966,
            -0.9972358345985413,
            -0.7041476368904114,
          ),
        },
        u_orientMax: {
          value: new Vector4(0.7065264582633972, 0.7041239738464355, 0.7047980427742004, 1),
        },
        u_isBack: { value: side === 'back' ? 1 : 0 },
        u_envTexture: coaster.sharedUniforms.u_envTexture,
        u_specEnvTexture:
          side === 'back'
            ? coaster.sharedUniforms.u_envTexture
            : handScene.sharedUniforms.u_specEnvTexture,
        u_lightPosition: { value: coaster.lightPosition },
        u_color: { value: new Color('#e7691d') },
        u_normalTexture: { value: this.normalTexture },
        u_patternTexture: { value: this.patternTexture },
      },
      this.sharedUniforms,
      blueNoise.shaderUniforms,
    );
    const material = new ShaderMaterial({
      uniforms,
      vertexShader: condomVert,
      fragmentShader: condomFrag,
      side: DoubleSide,
      defines: { BLUR_SAMPLE: 8 },
    });
    const mesh = new TAAMesh(geometry, material);
    this.container.add(mesh);
    if (side === 'front') {
      this.frontMesh = mesh;
      mesh.renderOrder = 1;
      uniforms.u_sceneCacheTexture = postprocessing.sharedUniforms.u_sceneCacheTexture;
      uniforms.u_resolution = postprocessing.sharedUniforms.u_resolution;
      uniforms.u_harmonicsStrength.value = 0.567662;
      this.frontMesh.onBeforeRenderCustom = () => {
        postprocessing.cacheScene(true, 0);
      };
    } else {
      this.backMesh = mesh;
      uniforms.u_harmonicsStrength.value = 0.561381;
      const mat = mesh.material as ShaderMaterial;
      mat.blending = CustomBlending;
      mat.blendEquation = AddEquation;
      mat.blendSrc = SrcAlphaFactor;
      mat.blendDst = OneMinusSrcAlphaFactor;
      mat.blendEquationAlpha = AddEquation;
      mat.blendDstAlpha = OneFactor;
      mat.blendSrcAlpha = ZeroFactor;
      (mat.defines as Record<string, unknown>).IS_BACK = 1;
      mesh.renderOrder = -1;
    }
    const bb = geometry.boundingBox!;
    (uniforms.u_uvMap.value as Vector4).set(
      bb.min.x,
      bb.min.y,
      bb.max.x - bb.min.x,
      bb.max.y - bb.min.y,
    );
  }

  init(): void {}

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    if (!properties.hasInitialized) return;
    this.container.visible = this.opacity > 0;
    const frame = this.tearRatio * (this.frameCount - 1);
    const frameA = Math.floor(frame);
    const frameB = Math.ceil(frame);
    const blend = frame - frameA;
    this.sharedUniforms.u_animBlendParams.value.set(frameA * 2, frameB * 2, blend);
    this.sharedUniforms.u_harmonicsTime.value = fit(frame, 0, 31, 0, Math.PI);
    this.container.position.y = fit(frame, 18, 32, 0, 1, ease.quadIn) * -0.1;
    this.sharedUniforms.u_offset.value = fit(frame, 18, 32, 0, 1) * 0.3;
    this.sharedUniforms.u_opacity.value = this.opacity;
  }
}

export const wearableCondom = new WearableCondom();