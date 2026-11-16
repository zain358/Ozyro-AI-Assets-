// 1:1 port of the source Postprocessing (pretty line 17055-17233), staged:
// the queue currently holds TAA/Fxaa/Smaa/AppleEfx/PostLayer/Final; Bloom,
// Bokeh, BlurBox and ScreenPaintDistortion land with their systems.

import {
  LinearSRGBColorSpace,
  DepthStencilFormat,
  DepthTexture,
  LinearFilter,
  NearestFilter,
  UnsignedInt248Type,
  UnsignedIntType,
  Vector2,
} from 'three';
import type { Camera, Scene, Texture, WebGLRenderTarget } from 'three';
import { blur } from '../core/blur';
import { browser } from '../core/browser';
import { fboHelper } from '../core/fboHelper';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { Bloom } from './Bloom';
import { blurBox } from './BlurBox';
import { Bokeh } from './Bokeh';
import { AppleEfx, Final, Fxaa, PostLayer, Smaa, TAA } from './effects';
import type { PostEffect } from './PostEffect';
import { PostProfile } from './PostProfile';
import { ScreenPaintDistortion } from './ScreenPaintDistortion';

let _usedTAA = false;

export class Postprocessing {
  width = 1;
  height = 1;
  scene: Scene | null = null;
  camera: Camera | null = null;
  resolution = new Vector2(0, 0);
  texelSize = new Vector2(0, 0);
  aspect = new Vector2(1, 1);
  sceneCacheRenderTarget: WebGLRenderTarget | null = null;
  sceneCacheBlurCacheRenderTarget: WebGLRenderTarget | null = null;
  sceneCacheBlurredRenderTarget: WebGLRenderTarget | null = null;
  sceneCacheBlurredTextureSize = new Vector2(0, 0);
  sceneRenderTarget: WebGLRenderTarget | null = null;
  fromRenderTarget: WebGLRenderTarget | null = null;
  toRenderTarget: WebGLRenderTarget | null = null;
  useDepthTexture = true;
  depthTexture: DepthTexture | null = null;
  fromTexture: Texture | null = null;
  toTexture: Texture | null = null;
  sceneTexture: Texture | null = null;
  sceneVelocityTexture: Texture | null = null;
  queue: PostEffect[] = [];
  hasSceneCache = false;
  hasSceneCacheBlurred = false;
  hasSizeChanged = true;
  useMSAA = false;
  postProfile = new PostProfile();
  useFloatTexture = false;
  taa!: TAA;
  fxaa!: Fxaa;
  smaa!: Smaa;
  bokeh: Bokeh | null = null;
  appleEfx!: AppleEfx;
  magazineLayer!: PostLayer;
  bloom!: Bloom;
  screenPaintDistortion!: ScreenPaintDistortion;
  final!: Final;
  sharedUniforms = {
    u_sceneTexture: { value: null as Texture | null },
    u_sceneCacheTexture: { value: null as Texture | null },
    u_sceneCacheBlurredTexture: { value: null as Texture | null },
    u_sceneCacheBlurredTextureSize: { value: this.sceneCacheBlurredTextureSize },
    u_fromTexture: { value: null as Texture | null },
    u_toTexture: { value: null as Texture | null },
    u_sceneDepthTexture: { value: null as Texture | null },
    u_cameraNear: { value: 0 },
    u_cameraFar: { value: 1 },
    u_cameraFovRad: { value: 1 },
    u_resolution: { value: this.resolution },
    u_texelSize: { value: this.texelSize },
    u_aspect: { value: this.aspect },
  };

  init(scene: Scene, camera: Camera): void {
    this.scene = scene;
    this.camera = camera;
    // Non-MSAA path (source default): 2-attachment MRT (color + velocity).
    this.sceneRenderTarget = fboHelper.createRenderTarget(1, 1, false, this.useFloatTexture, 0, 2);
    this.sceneRenderTarget.textures[0].name = 'color';
    this.sceneRenderTarget.textures[0].minFilter = LinearFilter;
    this.sceneRenderTarget.textures[0].magFilter = LinearFilter;
    this.sceneRenderTarget.textures[1].name = 'velocity';
    this.sceneRenderTarget.textures[1].minFilter = NearestFilter;
    this.sceneRenderTarget.textures[1].magFilter = NearestFilter;
    this.sceneVelocityTexture = this.sceneRenderTarget.textures[1];
    this.sceneRenderTarget.depthBuffer = true;
    this.useMSAA = this.sceneRenderTarget.samples > 0;
    this.fromRenderTarget = fboHelper.createRenderTarget(1, 1, false, this.useFloatTexture);
    this.toRenderTarget = this.fromRenderTarget.clone();
    this.useDepthTexture =
      !!this.useDepthTexture
      && !!fboHelper.renderer
      && (fboHelper.renderer.capabilities.isWebGL2 || !!fboHelper.renderer.extensions.get('WEBGL_depth_texture'));
    this.fromTexture = this.fromRenderTarget.texture;
    this.toTexture = this.toRenderTarget.texture;
    this.sceneTexture = this.sceneRenderTarget.textures[0];
    this.sceneCacheRenderTarget = this.fromRenderTarget.clone();
    this.sceneCacheBlurCacheRenderTarget = this.fromRenderTarget.clone();
    this.sceneCacheBlurredRenderTarget = this.fromRenderTarget.clone();
    this.sharedUniforms.u_sceneCacheTexture.value = this.sceneCacheRenderTarget.texture;
    this.sharedUniforms.u_sceneCacheBlurredTexture.value = this.sceneCacheBlurredRenderTarget.texture;
    if (this.useDepthTexture && fboHelper.renderer) {
      const depth = new DepthTexture(this.resolution.width, this.resolution.height);
      if (fboHelper.renderer.capabilities.isWebGL2) {
        depth.type = UnsignedIntType;
      } else {
        depth.format = DepthStencilFormat as never;
        depth.type = UnsignedInt248Type;
      }
      depth.minFilter = NearestFilter;
      depth.magFilter = NearestFilter;
      this.sceneRenderTarget.depthTexture = depth;
      this.depthTexture = depth;
      this.sharedUniforms.u_sceneDepthTexture.value = depth;
    }
  }

  addQueue(): void {
    if (!this.useMSAA) {
      const taa = (this.taa = new TAA());
      taa.init();
      this.queue.push(taa);
      const fxaa = (this.fxaa = new Fxaa());
      fxaa.init();
      this.queue.push(fxaa);
      const smaa = (this.smaa = new Smaa());
      smaa.init();
      // Source passes live <img> elements; our loader fills bitmaps async, so
      // patch the texture images on load.
      smaa.setTextures(null, null);
      loader.add(settings.TEXTURE_PATH + 'smaa-area.png', {
        weight: 32,
        flip: false,
        onLoad: (content) => {
          const tex = smaa.sharedUniforms.u_areaTexture.value as import('three').Texture;
          tex.image = content as ImageBitmap;
          tex.needsUpdate = true;
        },
      });
      loader.add(settings.TEXTURE_PATH + 'smaa-search.png', {
        weight: 0.1,
        flip: false,
        onLoad: (content) => {
          const tex = smaa.sharedUniforms.u_searchTexture.value as import('three').Texture;
          tex.image = content as ImageBitmap;
          tex.needsUpdate = true;
        },
      });
      this.queue.push(smaa);
    }
    if (this.useDepthTexture) {
      const bokeh = (this.bokeh = new Bokeh());
      bokeh.init();
      bokeh.quality = browser.isMobile ? 0 : 1;
      this.queue.push(bokeh);
    }
    const appleEfx = (this.appleEfx = new AppleEfx());
    appleEfx.init();
    this.queue.push(appleEfx);
    const magazine = (this.magazineLayer = new PostLayer());
    magazine.init();
    this.queue.push(magazine);
    // Source: bloom.USE_CONVOLUTION = false; USE_HD off without float-linear.
    const bloom = (this.bloom = new Bloom());
    bloom.USE_CONVOLUTION = false;
    if (
      !properties.renderer!.extensions.get('OES_texture_float_linear')
      && !properties.renderer!.extensions.get('OES_texture_half_float_linear')
    ) {
      bloom.USE_HD = false;
    }
    bloom.init();
    this.queue.push(bloom);
    blurBox.init();
    this.queue.push(blurBox);
    const screenPaintDistortion = (this.screenPaintDistortion = new ScreenPaintDistortion());
    screenPaintDistortion.init();
    this.queue.push(screenPaintDistortion);
    const final = (this.final = new Final());
    final.init();
    this.queue.push(final);
  }

  updateSmaaTextures(): void {
    if (!this.useMSAA) this.smaa.updateTextures();
  }

  checkTAARenderTarget(): void {
    if (!this.useMSAA) {
      this.fxaa.isActive = false;
      this.smaa.isActive = false;
      if (this.taa.isActive) this.fxaa.isActive = true;
      else this.smaa.isActive = true;
    }
  }

  syncProfile(): void {
    const profile = this.postProfile;
    const final = this.final;
    const bloom = this.bloom;
    bloom.amount = profile.bloomAmount;
    bloom.radius = profile.bloomRadius;
    bloom.threshold = profile.bloomThreshold;
    bloom.smoothWidth = profile.bloomSmoothWidth;
    bloom.lumaStrength = profile.bloomLumaStrength;
    bloom.selectiveStrength = profile.bloomSelectiveStrength;
    bloom.saturation = profile.bloomSaturation;
    bloom.haloWidth = profile.haloWidth;
    bloom.haloRGBShift = profile.haloRGBShift;
    bloom.haloLeftColorHex = profile.haloLeftColorHex;
    bloom.haloMidColorHex = profile.haloMidColorHex;
    bloom.haloRightColorHex = profile.haloRightColorHex;
    bloom.haloStrength = profile.haloStrength;
    bloom.haloMaskInner = profile.haloMaskInner;
    bloom.haloMaskOuter = profile.haloMaskOuter;
    const screenPaintDistortion = this.screenPaintDistortion;
    screenPaintDistortion.amount = profile.screenPaintDistortionAmount;
    screenPaintDistortion.rgbShift = profile.screenPaintDistortionRGBShift;
    screenPaintDistortion.colorMultiplier = profile.screenPaintDistortionColorMultiplier;
    screenPaintDistortion.multiplier = profile.screenPaintDistortionMultiplier;
    if (this.smaa) this.smaa.threshold = profile.smaaThreshold;
    final.vignetteFrom = profile.vignetteFrom;
    final.vignetteTo = profile.vignetteTo;
    final.vignetteColor.setStyle(profile.vignetteColorHex);
    final.saturation = profile.saturation;
    final.contrast = profile.contrast;
    final.brightness = profile.brightness;
    final.tintColor.setStyle(profile.tintColorHex);
    final.tintOpacity = profile.tintOpacity;
    const bokeh = this.bokeh;
    if (bokeh) {
      bokeh.amount = profile.bokehAmount;
      bokeh.fNumber = profile.bokehFNumber;
      bokeh.focusDistance = profile.bokehFocusDistance;
      bokeh.focalLength = profile.bokehFocalLength;
      bokeh.kFilmHeight = profile.bokehKFilmHeight;
    }
    final.opacity = properties.opacity;
    final.bgColor.setStyle(properties.bgColorHex, LinearSRGBColorSpace);
  }

  swap(): void {
    const from = this.fromRenderTarget!;
    this.fromRenderTarget = this.toRenderTarget;
    this.toRenderTarget = from;
    this.fromTexture = this.fromRenderTarget!.texture;
    this.toTexture = this.toRenderTarget.texture;
    this.sharedUniforms.u_fromTexture.value = this.fromTexture;
    this.sharedUniforms.u_toTexture.value = this.toTexture;
  }

  setSize(width: number, height: number): void {
    if (this.width !== width || this.height !== height) {
      this.hasSizeChanged = true;
      this.width = width;
      this.height = height;
      this.resolution.set(width, height);
      this.texelSize.set(1 / width, 1 / height);
      const aspect = (height / Math.sqrt(width * width + height * height)) * 2;
      this.aspect.set((width / height) * aspect, aspect);
      this.sceneRenderTarget!.setSize(width, height);
      this.fromRenderTarget!.setSize(width, height);
      this.toRenderTarget!.setSize(width, height);
      const halfW = width >> 1;
      const halfH = height >> 1;
      this.sceneCacheRenderTarget!.setSize(width, height);
      this.sceneCacheBlurCacheRenderTarget!.setSize(halfW, halfH);
      this.sceneCacheBlurredRenderTarget!.setSize(halfW, halfH);
    }
  }

  blendProfile(profile: Partial<PostProfile>, t = 0): void {
    this.postProfile.blend(profile, t);
  }

  /** Source cacheScene (pretty 17207-17211): snapshot the scene RT (and an
   *  optionally blurred half-res copy) for materials that refract it. */
  cacheScene(copy: boolean, blurRadius = 4): void {
    const renderer = fboHelper.renderer;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.sceneRenderTarget);
    fboHelper.clearMultisampleRenderTargetState();
    if (copy) {
      fboHelper.copy(this.sceneRenderTarget!.textures[0], this.sceneCacheRenderTarget!);
      this.hasSceneCache = true;
    }
    if (blurRadius) {
      blur.blur(
        blurRadius,
        0.5,
        this.sceneRenderTarget!,
        this.sceneCacheBlurCacheRenderTarget!,
        this.sceneCacheBlurredRenderTarget!,
        true,
      );
      this.sceneCacheBlurredTextureSize.set(
        this.sceneCacheBlurredRenderTarget!.width,
        this.sceneCacheBlurredRenderTarget!.height,
      );
      this.hasSceneCacheBlurred = true;
    }
    renderer.setRenderTarget(prevRT);
  }

  private _filterQueue(effect: PostEffect): boolean {
    return effect.enabled && effect.needRender();
  }

  render(scene: Scene, camera: Camera & { near: number; far: number; fov: number }, toScreen: boolean): void {
    if (!fboHelper.renderer) return;
    this.scene = scene;
    this.camera = camera;
    const u = this.sharedUniforms;
    u.u_sceneTexture.value = this.sceneRenderTarget!.textures[0];
    u.u_cameraNear.value = camera.near;
    u.u_cameraFar.value = camera.far;
    u.u_cameraFovRad.value = (camera.fov / 180) * Math.PI;
    fboHelper.renderer.autoClear = false;
    fboHelper.renderer.setClearColor(properties.bgColor, 0);
    fboHelper.renderer.setRenderTarget(this.sceneRenderTarget);
    fboHelper.renderer.clear();
    const gl = fboHelper.renderer.getContext() as WebGL2RenderingContext;
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearBufferfv(gl.COLOR, 1, new Float32Array([127 / 255, 128 / 255, 127 / 255, 128 / 255]));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    this.taa.isActive = false;
    fboHelper.renderer.render(scene, camera);
    fboHelper.renderer.setRenderTarget(null);
    const taaActive = this.taa.isActive;
    if (taaActive && !_usedTAA) this.taa.needsReset = true;
    _usedTAA = taaActive;
    this.checkTAARenderTarget();
    const queue = this.queue.filter(this._filterQueue);
    queue.sort((a, b) => (a.renderOrder === b.renderOrder ? 0 : a.renderOrder - b.renderOrder));
    fboHelper.copy(this.sceneRenderTarget!.textures[0], this.fromRenderTarget!);
    for (let i = 0, count = queue.length; i < count; i++) {
      const isLast = i === count - 1 && toScreen;
      queue[i].render(this, isLast);
    }
    this.hasSizeChanged = false;
  }
}

export const postprocessing = new Postprocessing();
