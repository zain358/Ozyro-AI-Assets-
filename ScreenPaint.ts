import { RawShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { Texture, WebGLRenderTarget } from 'three';
import { blur } from '../core/blur';
import { browser } from '../core/browser';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { fit } from '../core/math';
import { properties } from '../core/properties';
import { screenPaintFrag } from '../glsl';

const _v = new Vector2();

export class ScreenPaint {
  private _lowRenderTarget!: WebGLRenderTarget;
  private _lowBlurRenderTarget!: WebGLRenderTarget;
  private _prevPaintRenderTarget!: WebGLRenderTarget;
  private _currPaintRenderTarget!: WebGLRenderTarget;
  private _material!: RawShaderMaterial;
  private _fromDrawData!: Vector4;
  private _toDrawData!: Vector4;
  drawEnabled = true;
  needsMouseDown = false;
  enabled = true;
  minRadius = 0;
  maxRadius = 100;
  radiusDistanceRange = 100;
  pushStrength = 25;
  accelerationDissipation = 0.8;
  velocityDissipation = 0.985;
  weight1Dissipation = 0.985;
  weight2Dissipation = 0.75;
  useNoise = true;
  curlScale = 0.06;
  curlStrength = 1.75;
  private _prevUseNoise: boolean | null = null;
  sharedUniforms = {
    u_paintTexelSize: { value: new Vector2() },
    u_prevPaintTexture: { value: null as Texture | null },
    u_currPaintTexture: { value: null as Texture | null },
    u_lowPaintTexture: { value: null as Texture | null },
  };

  init(): void {
    this._lowRenderTarget = fboHelper.createRenderTarget(1, 1);
    this._lowBlurRenderTarget = fboHelper.createRenderTarget(1, 1);
    this._prevPaintRenderTarget = fboHelper.createRenderTarget(1, 1);
    this._currPaintRenderTarget = fboHelper.createRenderTarget(1, 1);
    this.sharedUniforms.u_lowPaintTexture.value = this._lowRenderTarget.texture;
    this._material = new RawShaderMaterial({
      uniforms: {
        u_lowPaintTexture: { value: this._lowRenderTarget.texture },
        u_prevPaintTexture: this.sharedUniforms.u_prevPaintTexture,
        u_paintTexelSize: this.sharedUniforms.u_paintTexelSize,
        u_drawFrom: { value: (this._fromDrawData = new Vector4(0, 0, 0, 0)) },
        u_drawTo: { value: (this._toDrawData = new Vector4(0, 0, 0, 0)) },
        u_pushStrength: { value: 0 },
        u_curlScale: { value: 0 },
        u_curlStrength: { value: 0 },
        u_vel: { value: new Vector2() },
        u_dissipations: { value: new Vector3() },
      },
      vertexShader: fboHelper.vertexShader,
      fragmentShader: fboHelper.precisionPrefix + screenPaintFrag,
    });
  }

  resize(width: number, height: number): void {
    const w = width >> 2;
    const h = height >> 2;
    const lowW = width >> 4;
    const lowH = height >> 4;
    if (w !== this._currPaintRenderTarget.width || h !== this._currPaintRenderTarget.height) {
      this._currPaintRenderTarget.setSize(w, h);
      this._prevPaintRenderTarget.setSize(w, h);
      this._lowRenderTarget.setSize(lowW, lowH);
      this._lowBlurRenderTarget.setSize(lowW, lowH);
      this.sharedUniforms.u_paintTexelSize.value.set(1 / w, 1 / h);
      this.clear();
    }
  }

  clear = (): void => {
    fboHelper.clearColor(0.5, 0.5, 0, 0, this._lowRenderTarget);
    fboHelper.clearColor(0.5, 0.5, 0, 0, this._lowBlurRenderTarget);
    fboHelper.clearColor(0.5, 0.5, 0, 0, this._currPaintRenderTarget);
    (this._material.uniforms.u_vel.value as Vector2).set(0, 0);
  };

  update(dt: number): void {
    if (!this.enabled) return;
    if (this.useNoise !== this._prevUseNoise) {
      (this._material.defines as Record<string, unknown>).USE_NOISE = this.useNoise;
      this._material.needsUpdate = true;
      this._prevUseNoise = this.useNoise;
    }
    const w = this._currPaintRenderTarget.width;
    const h = this._currPaintRenderTarget.height;
    const prev = this._prevPaintRenderTarget;
    this._prevPaintRenderTarget = this._currPaintRenderTarget;
    this._currPaintRenderTarget = prev;
    this.sharedUniforms.u_prevPaintTexture.value = this._prevPaintRenderTarget.texture;
    this.sharedUniforms.u_currPaintTexture.value = this._currPaintRenderTarget.texture;
    this._material.uniforms.u_drawFrom.value.z = this._material.uniforms.u_drawTo.value.z;
    const moveDistance = input.mousePixelXY.distanceTo(input.prevMousePixelXY);
    let radius = fit(moveDistance, 0, this.radiusDistanceRange, this.minRadius, this.maxRadius);
    if (
      !input.hadMoved
      || !this.drawEnabled
      || ((this.needsMouseDown || browser.isMobile) && (!input.isDown || !input.wasDown))
    ) {
      radius = 0;
    }
    radius = (radius / properties.viewportHeight) * h;
    this._material.uniforms.u_pushStrength.value = this.pushStrength;
    this._material.uniforms.u_curlScale.value = this.curlScale;
    this._material.uniforms.u_curlStrength.value = this.curlStrength;
    (this._material.uniforms.u_dissipations.value as Vector3).set(
      this.velocityDissipation,
      this.weight1Dissipation,
      this.weight2Dissipation,
    );
    this._fromDrawData.copy(this._toDrawData);
    this._toDrawData.set(
      ((input.mouseXY.x + 1) * w) / 2,
      ((input.mouseXY.y + 1) * h) / 2,
      radius,
      1,
    );
    _v.set(
      this._toDrawData.x - this._fromDrawData.x,
      this._toDrawData.y - this._fromDrawData.y,
    ).multiplyScalar(dt * 0.8);
    (this._material.uniforms.u_vel.value as Vector2)
      .multiplyScalar(this.accelerationDissipation)
      .add(_v);
    fboHelper.render(this._material, this._currPaintRenderTarget);
    fboHelper.copy(this._currPaintRenderTarget.texture, this._lowRenderTarget);
    blur.blur(4, 1, this._lowRenderTarget, this._lowBlurRenderTarget);
  }
}

export const screenPaint = new ScreenPaint();
