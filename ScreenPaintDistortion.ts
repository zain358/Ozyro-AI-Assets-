// 1:1 port of the source ScreenPaintDistortion (pretty line 16714-16757):
// smears the frame along the ScreenPaint velocity field with an RGB-shift
// shade, 9-tap directional blur.

import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Camera } from 'three';
import { blueNoise } from '../core/blueNoise';
import { fboHelper } from '../core/fboHelper';
import { screenPaintDistortionFrag } from '../glsl';
import { PostEffect } from './PostEffect';
import type { Postprocessing } from './postprocessing';
import { screenPaint } from './ScreenPaint';

export class ScreenPaintDistortion extends PostEffect {
  amount = 20;
  rgbShift = 1;
  multiplier = 1.25;
  colorMultiplier = 1;
  shade = 1.25;
  renderOrder = 10;
  needsSync = false;
  private _position = new Vector3();
  private _quaternion = new Quaternion();
  private _scale = new Vector3();
  projectionViewMatrix = new Matrix4();
  projectionViewInverseMatrix = new Matrix4();
  prevProjectionViewMatrix = new Matrix4();

  init(options?: Record<string, unknown>): void {
    Object.assign(this, options);
    super.init();
    this.material = fboHelper.createRawShaderMaterial({
      uniforms: Object.assign(
        {
          u_texture: { value: null },
          u_screenPaintTexture: screenPaint.sharedUniforms.u_currPaintTexture,
          u_screenPaintTexelSize: screenPaint.sharedUniforms.u_paintTexelSize,
          u_amount: { value: 0 },
          u_rgbShift: { value: 0 },
          u_multiplier: { value: 0 },
          u_colorMultiplier: { value: 0 },
          u_shade: { value: 0 },
        },
        blueNoise.shaderUniforms,
      ),
      fragmentShader: screenPaintDistortionFrag,
    });
  }

  needsRender(): boolean {
    return this.amount > 0;
  }

  syncCamera(camera?: Camera): void {
    this.needsSync = true;
    if (camera) {
      camera.matrixWorldInverse.decompose(this._position, this._quaternion, this._scale);
      this.projectionViewMatrix.multiplyMatrices(
        (camera as Camera & { projectionMatrix: Matrix4 }).projectionMatrix,
        camera.matrixWorldInverse,
      );
      this.projectionViewInverseMatrix.copy(this.projectionViewMatrix).invert();
    }
    this.prevProjectionViewMatrix.copy(this.projectionViewMatrix);
  }

  render(post: Postprocessing, toScreen = false): void {
    this.material!.uniforms.u_amount.value = this.amount;
    this.material!.uniforms.u_rgbShift.value = this.rgbShift;
    this.material!.uniforms.u_multiplier.value = this.multiplier;
    this.material!.uniforms.u_colorMultiplier.value = this.colorMultiplier;
    this.material!.uniforms.u_shade.value = this.shade;
    super.render(post, toScreen);
  }
}