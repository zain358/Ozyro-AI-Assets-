import {
  Color,
  LinearFilter,
  NearestFilter,
  NoBlending,
  RawShaderMaterial,
  RepeatWrapping,
  Scene,
  Texture,
  Vector2,
} from 'three';
import type { Camera, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { ease } from '../core/ease';
import { fboHelper } from '../core/fboHelper';
import { fit, saturate } from '../core/math';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import * as settings from '../core/settings';
import {
  appleEfxFrag,
  finalFrag,
  fxaaFrag,
  preloaderFrag,
  smaaBlendFrag,
  smaaBlendVert,
  smaaEdgesFrag,
  smaaEdgesVert,
  smaaWeightsFrag,
  smaaWeightsVert,
  taaResolveFrag,
} from '../glsl';
import { PostEffect } from './PostEffect';
import type { Postprocessing } from './postprocessing';

import { Vector3 } from 'three';

const _v0 = new Vector3();
const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();

export class TAA extends PostEffect {
  historyRt: WebGLRenderTarget | null = null;
  isActive = true;
  isDebugActive = true;
  needsReset = false;

  init(options?: Record<string, unknown>): void {
    Object.assign(this, options);
    super.init();
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: Object.assign(
        {
          u_texture: { value: null },
          u_historyTexture: { value: null },
          u_resolution: properties.sharedUniforms.u_resolution,
          u_velocityTexture: { value: null },
          u_historyWeight: { value: 0.8 },
        },
        blueNoise.shaderUniforms,
      ),
      fragmentShader: taaResolveFrag,
    });
  }

  needsRender(): boolean {
    if (!this.isActive || !this.isDebugActive) this.needsReset = true;
    return this.isActive && this.isDebugActive;
  }

  private _reset(post: Postprocessing): void {
    if (this.historyRt) fboHelper.copy(post.fromTexture!, this.historyRt);
    this.needsReset = false;
  }

  render(post: Postprocessing): void {
    const width = post.toRenderTarget!.width;
    const height = post.toRenderTarget!.height;
    if (this.historyRt) {
      if (this.historyRt.width !== width || this.historyRt.height !== height) {
        this.historyRt.setSize(width, height);
        this.needsReset = true;
      }
    } else {
      this.historyRt = post.toRenderTarget!.clone();
      this.historyRt.setSize(width, height);
      this.needsReset = true;
    }
    if (this.needsReset) {
      this._reset(post);
    } else {
      this.material!.uniforms.u_historyTexture.value = this.historyRt.texture;
      this.material!.uniforms.u_texture.value = post.fromTexture;
      this.material!.uniforms.u_velocityTexture.value = post.sceneVelocityTexture;
      fboHelper.render(this.material!, post.toRenderTarget);
      fboHelper.copy(post.toRenderTarget!.texture, this.historyRt);
      post.swap();
    }
  }
}

export class Fxaa extends PostEffect {
  isActive = true;

  init(options?: Record<string, unknown>): void {
    Object.assign(this, options);
    super.init();
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_texelSize: null as never,
      },
      fragmentShader: fxaaFrag,
    });
    (this.material.defines as Record<string, unknown>).SKIP_ALPHA = 1;
  }

  needsRender(): boolean {
    return this.isActive;
  }

  render(post: Postprocessing, toScreen = false): void {
    (this.material!.uniforms as Record<string, unknown>).u_texelSize = post.sharedUniforms.u_texelSize;
    super.render(post, toScreen);
  }
}

export class Smaa extends PostEffect {
  isActive = true;
  edgesRenderTarget: WebGLRenderTarget | null = null;
  weightsRenderTarget: WebGLRenderTarget | null = null;
  edgesMaterial: RawShaderMaterial | null = null;
  weightsMaterial: RawShaderMaterial | null = null;
  threshold = 0.5;

  init(options?: Record<string, unknown>): void {
    Object.assign(this, {
      sharedUniforms: {
        u_areaTexture: { value: null },
        u_searchTexture: { value: null },
      },
    }, options);
    super.init();
    this.weightsRenderTarget = fboHelper.createRenderTarget(1, 1);
    this.edgesRenderTarget = fboHelper.createRenderTarget(1, 1);
    this.edgesMaterial = new RawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_texelSize: null as never,
        u_thresholds: { value: new Vector2() },
      },
      vertexShader: fboHelper.precisionPrefix + smaaEdgesVert,
      fragmentShader: fboHelper.precisionPrefix + smaaEdgesFrag,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.weightsMaterial = new RawShaderMaterial({
      uniforms: {
        u_edgesTexture: { value: this.edgesRenderTarget.texture },
        u_areaTexture: this.sharedUniforms.u_areaTexture,
        u_searchTexture: this.sharedUniforms.u_searchTexture,
        u_texelSize: null as never,
      },
      vertexShader: fboHelper.precisionPrefix + smaaWeightsVert,
      fragmentShader: fboHelper.precisionPrefix + smaaWeightsFrag,
      defines: {
        SMAA_MAX_SEARCH_STEPS: '8',
        SMAA_AREATEX_MAX_DISTANCE: '16',
        SMAA_AREATEX_PIXEL_SIZE: '( 1.0 / vec2( 160.0, 560.0 ) )',
        SMAA_AREATEX_SUBTEX_SIZE: '( 1.0 / 7.0 )',
      },
      transparent: true,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_weightsTexture: { value: this.weightsRenderTarget.texture },
        u_texelSize: null as never,
      },
      vertexShader: fboHelper.precisionPrefix + smaaBlendVert,
      fragmentShader: fboHelper.precisionPrefix + smaaBlendFrag,
    });
  }

  setTextures(area: unknown, search: unknown): void {
    const areaTex = (this.sharedUniforms.u_areaTexture.value = this._createTexture(area));
    areaTex.minFilter = LinearFilter;
    const searchTex = (this.sharedUniforms.u_searchTexture.value = this._createTexture(search));
    searchTex.magFilter = NearestFilter;
    searchTex.minFilter = NearestFilter;
  }

  updateTextures(): void {
    (this.sharedUniforms.u_areaTexture.value as Texture).needsUpdate = true;
    (this.sharedUniforms.u_searchTexture.value as Texture).needsUpdate = true;
  }

  needsRender(): boolean {
    return this.isActive ? !(this.sharedUniforms.u_areaTexture.value as Texture).needsUpdate : false;
  }

  render(post: Postprocessing, toScreen = false): void {
    const width = post.width;
    const height = post.height;
    this.edgesRenderTarget!.setSize(width, height);
    this.weightsRenderTarget!.setSize(width, height);
    const state = fboHelper.getColorState();
    if (!this.sharedUniforms.u_searchTexture.value) {
      console.warn('You need to use Smaa.setImages() to set the smaa textures manually and assign to this class.');
    }
    const renderer = fboHelper.renderer;
    if (renderer) {
      renderer.autoClear = true;
      renderer.setClearColor(0, 0);
    }
    (this.edgesMaterial!.uniforms.u_thresholds.value as Vector2).setScalar(this.threshold);
    (this.edgesMaterial!.uniforms as Record<string, unknown>).u_texelSize =
      (this.weightsMaterial!.uniforms as Record<string, unknown>).u_texelSize =
      (this.material!.uniforms as Record<string, unknown>).u_texelSize =
        post.sharedUniforms.u_texelSize;
    this.edgesMaterial!.uniforms.u_texture.value = post.fromTexture;
    fboHelper.render(this.edgesMaterial!, this.edgesRenderTarget!);
    fboHelper.render(this.weightsMaterial!, this.weightsRenderTarget!);
    fboHelper.setColorState(state);
    this.material!.uniforms.u_texture.value = post.fromTexture;
    super.render(post, toScreen);
  }

  private _createTexture(image: unknown): Texture {
    const tex = new Texture(image as never);
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    return tex;
  }
}

export class AppleEfx extends PostEffect {
  amount = 0;
  wasActive = false;
  pulseCenter = new Vector2();
  colors = [
    new Color('#ff9cff').convertSRGBToLinear(),
    new Color('#ff9638').convertSRGBToLinear(),
    new Color('#ffff22').convertSRGBToLinear(),
    new Color('#54ffff').convertSRGBToLinear(),
  ];
  lmsData!: Float32Array;
  lmsTexture: Texture | null = null;
  pulse = 0;

  private toLms(array: Float32Array, offset: number, color: Color): void {
    _v0.set(color.r, color.g, color.b).toArray(array, offset);
  }

  init(options?: Record<string, unknown>): void {
    Object.assign(this, options);
    super.init();
    this.lmsData = new Float32Array(6 * 4);
    this.toLms(this.lmsData, 0, this.colors[0]);
    this.toLms(this.lmsData, 4, this.colors[1]);
    this.toLms(this.lmsData, 8, this.colors[2]);
    this.toLms(this.lmsData, 12, this.colors[3]);
    this.toLms(this.lmsData, 16, this.colors[0]);
    _v0.fromArray(this.lmsData, 0);
    _v1.fromArray(this.lmsData, 4);
    _v2.fromArray(this.lmsData, 8);
    _v3.fromArray(this.lmsData, 12);
    _v0.lerp(_v1, 0.5);
    _v2.lerp(_v3, 0.5);
    _v0.lerp(_v2, 0.5);
    _v0.toArray(this.lmsData, 20);
    this.lmsTexture = fboHelper.createDataTexture(this.lmsData, 6, 1, true, true);
    this.lmsTexture.wrapS = RepeatWrapping;
    this.lmsTexture.wrapT = RepeatWrapping;
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: Object.assign(
        {
          u_texture: { value: null },
          u_resolution: { value: new Vector2(1, 1) },
          u_amount: { value: 1 },
          u_coverAspect: { value: new Vector2(1, 1) },
          u_padding: { value: 100 },
          u_time: properties.sharedUniforms.u_time,
          u_lmsTexture: { value: this.lmsTexture },
          u_pulse: { value: this.pulse },
          u_pulseCenter: { value: this.pulseCenter },
        },
        blueNoise.shaderUniforms,
      ),
      fragmentShader: appleEfxFrag,
    });
  }

  needsRender(): boolean {
    const active = this.amount > 0 || this.pulse < 1;
    if (active && !this.wasActive) this.pulse = 0;
    this.wasActive = active;
    return active;
  }

  render(post: Postprocessing, toScreen = false): void {
    this.pulse += properties.deltaTime * 0.5;
    this.pulse = saturate(this.pulse);
    this.material!.uniforms.u_pulse.value = this.pulse;
    (this.material!.uniforms.u_pulseCenter.value as Vector2).set(1.001, 1 - scrollManager.scrollBarCenter);
    this.material!.uniforms.u_amount.value = ease.sineIn(this.amount);
    (this.material!.uniforms.u_resolution.value as Vector2).copy(
      post.sharedUniforms.u_resolution.value as Vector2,
    );
    this.material!.uniforms.u_padding.value = Math.min(
      50,
      Math.min(properties.width, properties.height) * 0.1,
    );
    const aspectScale =
      (Math.min(properties.height / properties.width, 1)
        / Math.sqrt(properties.width * properties.width + properties.height * properties.height))
      * Math.max(properties.width, properties.height);
    (this.material!.uniforms.u_coverAspect.value as Vector2).set(
      (properties.width / properties.height) * aspectScale,
      aspectScale,
    );
    super.render(post, toScreen);
  }
}

export class Final extends PostEffect {
  vignetteFrom = 0.6;
  vignetteTo = 1.6;
  vignetteAspect = new Vector2();
  vignetteColor = new Color();
  saturation = 1;
  contrast = 0;
  brightness = 1;
  tintColor = new Color();
  tintOpacity = 1;
  bgColor = new Color();
  opacity = 1;
  debugAlpha = false;
  preloaderMaterial!: RawShaderMaterial;

  init(options?: Record<string, unknown>): void {
    Object.assign(this, options);
    super.init();
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_vignetteFrom: { value: 0 },
        u_vignetteTo: { value: 0 },
        u_vignetteAspect: { value: this.vignetteAspect },
        u_vignetteColor: { value: this.vignetteColor },
        u_saturation: { value: 0 },
        u_contrast: { value: 0 },
        u_brightness: { value: 0 },
        u_tintColor: { value: this.tintColor },
        u_tintOpacity: { value: 0 },
        u_bgColor: { value: this.bgColor },
        u_opacity: { value: 0 },
        u_ditherSeed: { value: 0 },
        u_debugAlpha: { value: 0 },
      },
      fragmentShader: finalFrag,
    });
    this.preloaderMaterial = fboHelper.createRawShaderMaterial({
      uniforms: Object.assign(
        {
          u_texture: { value: null },
          u_resolution: properties.sharedUniforms.u_resolution,
          u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
          u_hideRatio: { value: 0 },
          u_maskRatio: { value: 0 },
        },
        blueNoise.shaderUniforms,
      ),
      fragmentShader: preloaderFrag,
      defines: { BLUR_SAMPLE: 6 },
    });
  }

  render(post: Postprocessing, toScreen = false): void {
    const width = post.width;
    const height = post.height;
    const u = this.material!.uniforms;
    u.u_vignetteFrom.value = this.vignetteFrom;
    u.u_vignetteTo.value = this.vignetteTo;
    const aspect = height / Math.sqrt(width * width + height * height);
    this.vignetteAspect.set((width / height) * aspect, aspect);
    u.u_saturation.value = this.saturation - 1;
    u.u_contrast.value = this.contrast;
    u.u_brightness.value = this.brightness - 1;
    u.u_tintOpacity.value = this.tintOpacity;
    u.u_opacity.value = this.opacity;
    u.u_debugAlpha.value = this.debugAlpha ? 1 : 0;
    u.u_ditherSeed.value = Math.random() * 1e3;
    u.u_texture.value = post.fromTexture;
    const startRatio = settings.SKIP_ANIMATION ? 1 : fit(properties.startTime, 0, 1, 0, 1);
    if (startRatio === 1) {
      fboHelper.render(this.material!, toScreen ? null : post.toRenderTarget);
      post.swap();
    } else {
      fboHelper.render(this.material!, post.toRenderTarget);
      post.swap();
      this.preloaderMaterial.uniforms.u_texture.value = post.fromTexture;
      this.preloaderMaterial.uniforms.u_hideRatio.value = startRatio;
      this.preloaderMaterial.uniforms.u_maskRatio.value = fit(startRatio, 0, 0.5, 0, 1);
      fboHelper.render(this.preloaderMaterial, toScreen ? null : post.toRenderTarget);
      post.swap();
    }
  }
}

export class PostLayer extends PostEffect {
  scene!: Scene;
  camera: Camera | null = null;
  enabled = false;
  sharedUniforms = { u_fromTexture: { value: null as unknown } };

  init(): void {
    this.scene = new Scene();
  }

  render(post: Postprocessing): void {
    const camera = this.camera || (post.camera as Camera);
    const state = fboHelper.getColorState();
    const renderer = properties.renderer!;
    renderer.setRenderTarget(post.fromRenderTarget);
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(null);
    fboHelper.setColorState(state);
  }
}
