import { LinearFilter, NearestFilter, Vector2 } from 'three';
import type { PerspectiveCamera, RawShaderMaterial, Texture, WebGLRenderTarget } from 'three';
import { fboHelper } from '../core/fboHelper';
import {
  bokehBlurFrag,
  bokehCocFrag,
  bokehCompositeFrag,
  bokehSimFrag,
} from '../glsl';
import { PostEffect } from './PostEffect';
import { postprocessing, type Postprocessing } from './postprocessing';

export class Bokeh extends PostEffect {
  amount = 1;
  fNumber = 0.07;
  focusDistance = 5;
  useCameraFov = false;
  focalLength = 0.463;
  kFilmHeight = 36;
  quality = 1;
  private _prevQuality = -1;
  useFloatTexture = false;
  private _prevUseFloatTexture: boolean | null = null;
  useAdditionalBlur = true;
  rt1: WebGLRenderTarget | null = null;
  rt2!: WebGLRenderTarget;
  rt3!: WebGLRenderTarget;
  cocMaterial!: RawShaderMaterial;
  simMaterial!: RawShaderMaterial;
  blurMaterial!: RawShaderMaterial;

  init(options?: Record<string, unknown>): void {
    Object.assign(
      this,
      {
        sharedUniforms: {
          u_depthTexture: { value: null },
          u_texelSize: { value: null },
          u_focusDistance: { value: 0 },
          u_fNumber: { value: 0 },
          u_lensCoeff: { value: 0 },
          u_maxCoC: { value: 0 },
          u_rcpMaxCoC: { value: 0 },
          u_rcpAspect: { value: 0 },
          u_cameraNear: { value: 0 },
          u_cameraFar: { value: 0 },
          u_amount: { value: 0 },
          u_halfTexelSize: { value: new Vector2() },
        },
      },
      options,
    );
    super.init();
    this.rt2 = fboHelper.createRenderTarget(1, 1, false, postprocessing.useFloatTexture);
    this.rt3 = fboHelper.createRenderTarget(1, 1, false, postprocessing.useFloatTexture);
    this.cocMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_hashNoise: { value: 0 },
        u_depthTexture: this.sharedUniforms.u_depthTexture,
        u_texelSize: this.sharedUniforms.u_texelSize,
        u_focusDistance: this.sharedUniforms.u_focusDistance,
        u_lensCoeff: this.sharedUniforms.u_lensCoeff,
        u_maxCoC: this.sharedUniforms.u_maxCoC,
        u_rcpMaxCoC: this.sharedUniforms.u_rcpMaxCoC,
        u_cameraNear: this.sharedUniforms.u_cameraNear,
        u_cameraFar: this.sharedUniforms.u_cameraFar,
      },
      fragmentShader: bokehCocFrag,
    });
    this.simMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_cocTexture: { value: null },
        u_cocTexelSize: this.sharedUniforms.u_halfTexelSize,
        u_rcpAspect: this.sharedUniforms.u_rcpAspect,
        u_maxCoC: this.sharedUniforms.u_maxCoC,
      },
      fragmentShader: bokehSimFrag,
    });
    this.blurMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_bokehTexture: { value: null },
        u_bokehTexelSize: this.sharedUniforms.u_halfTexelSize,
      },
      fragmentShader: bokehBlurFrag,
    });
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_blurTexture: { value: null },
        u_amount: this.sharedUniforms.u_amount,
      },
      fragmentShader: fboHelper.precisionPrefix + bokehCompositeFrag,
    });
  }

  dispose(): void {
    this.rt1?.dispose();
    this.rt2.dispose();
    this.rt3.dispose();
  }

  needsRender(): boolean {
    return this.amount > 0;
  }

  private _calculateFocalLength(fovRad: number, filmHeight: number): number {
    return (0.5 * filmHeight) / Math.tan(0.5 * fovRad);
  }

  private _calculateMaxCoCRadius(height: number, quality: number): number {
    const radiusInPixels = quality * 4 + 6;
    return Math.min(0.05, radiusInPixels / height);
  }

  render(post: Postprocessing, toScreen = false): void {
    const width = post.width;
    const height = post.height;
    const halfW = Math.ceil(width / 2);
    const halfH = Math.ceil(height / 2);
    if (this.rt2.width !== halfW || this.rt2.height !== halfH) {
      this.rt1?.setSize(halfW, halfH);
      this.rt2.setSize(halfW, halfH);
      this.rt3.setSize(halfW, halfH);
      (this.sharedUniforms.u_halfTexelSize.value as Vector2).set(1 / halfW, 1 / halfH);
    }
    const qualityChanged = this._prevQuality !== this.quality;
    const floatChanged = this._prevUseFloatTexture !== this.useFloatTexture;
    const focalLength = this.useCameraFov
      ? this._calculateFocalLength(
          post.sharedUniforms.u_cameraFovRad.value as number,
          (post.camera as PerspectiveCamera).getFilmHeight(),
        )
      : this.focalLength;
    const focusDistance = this.focusDistance;
    const fNumber = this.fNumber;
    const lensCoeff =
      (focalLength * focalLength)
      / (fNumber * (focusDistance - focalLength) * this.kFilmHeight * 2);
    const maxCoC = this._calculateMaxCoCRadius(post.height, this.quality);
    this.sharedUniforms.u_amount.value = this.amount;
    this.sharedUniforms.u_texelSize.value = post.sharedUniforms.u_texelSize.value;
    this.sharedUniforms.u_depthTexture.value = post.sharedUniforms.u_sceneDepthTexture.value;
    this.sharedUniforms.u_cameraNear.value = post.sharedUniforms.u_cameraNear.value;
    this.sharedUniforms.u_cameraFar.value = post.sharedUniforms.u_cameraFar.value;
    this.sharedUniforms.u_focusDistance.value = focusDistance;
    this.sharedUniforms.u_fNumber.value = fNumber;
    this.sharedUniforms.u_lensCoeff.value = lensCoeff;
    this.sharedUniforms.u_maxCoC.value = maxCoC;
    this.sharedUniforms.u_rcpMaxCoC.value = 1 / maxCoC;
    this.sharedUniforms.u_rcpAspect.value = post.height / post.width;
    if (floatChanged) {
      this.rt1?.dispose();
      this.rt1 = fboHelper.createRenderTarget(
        halfW,
        halfH,
        false,
        this.useFloatTexture || post.useFloatTexture,
      );
    }
    const fromTexture = post.fromTexture as Texture;
    fromTexture.minFilter = fromTexture.magFilter = NearestFilter;
    if (floatChanged) {
      (this.cocMaterial.defines as Record<string, unknown>).USE_FLOAT = this.useFloatTexture;
      this.cocMaterial.needsUpdate = true;
    }
    this.cocMaterial.uniforms.u_hashNoise.value =
      ((this.cocMaterial.uniforms.u_hashNoise.value as number) + 1.2415) % 100;
    this.cocMaterial.uniforms.u_texture.value = fromTexture;
    fboHelper.render(this.cocMaterial, this.rt1!);
    fromTexture.minFilter = fromTexture.magFilter = LinearFilter;
    (this.simMaterial.defines as Record<string, unknown>).QUALITY = this.quality;
    this.simMaterial.uniforms.u_cocTexture.value = this.rt1!.texture;
    if (qualityChanged) this.simMaterial.needsUpdate = true;
    if (floatChanged) {
      (this.simMaterial.defines as Record<string, unknown>).USE_FLOAT = this.useFloatTexture;
      this.simMaterial.needsUpdate = true;
    }
    fboHelper.render(this.simMaterial, this.rt2);
    if (this.useAdditionalBlur) {
      this.blurMaterial.uniforms.u_bokehTexture.value = this.rt2.texture;
      fboHelper.render(this.blurMaterial, this.rt3);
    }
    this.material!.uniforms.u_blurTexture.value = this.useAdditionalBlur
      ? this.rt3.texture
      : this.rt2.texture;
    this._prevQuality = this.quality;
    this._prevUseFloatTexture = this.useFloatTexture;
    super.render(post, toScreen);
  }
}
