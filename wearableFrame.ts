import { Color, GLSL3, LinearFilter, Mesh, Object3D, SRGBColorSpace, Vector2 } from 'three';
import type { RawShaderMaterial, Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { DomGLRect } from '../core/DomGLRect';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { fit, saturate } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { wearableFrameFrag, wearableFrameVert } from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { coaster } from './coaster';
import { WEARABLE_GALLERY_INNER_ROTATION, WEARABLE_GALLERY_INNER_SCALE } from './wearableConstants';

let _mesh: (Mesh & { needsClipping?: boolean }) | null = null;
const _pinPixelRange = 4;
const _pinRawSize = new Vector2(214, 220);
const _pinTextureSize = new Vector2(384, 384);
const pinContainScale = Math.min(
  (_pinTextureSize.x - _pinPixelRange) / _pinRawSize.x,
  (_pinTextureSize.y - _pinPixelRange) / _pinRawSize.y,
);
const _scaleFix = new Vector2(
  (_pinRawSize.x * pinContainScale) / _pinTextureSize.x,
  (_pinRawSize.y * pinContainScale) / _pinTextureSize.y,
);

export class WearableFrame {
  isActive = false;
  container = new Object3D();
  rect = new DomGLRect();
  showRatio = 0;
  hideRatio = 1;
  pinShowRatio = 0;

  preInit(): void {
    _mesh = new Mesh(
      fboHelper.quadGeom,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign(
          {
            u_texture: {
              value: loader.add(settings.TEXTURE_PATH + 'wearable/1.webp', {
                type: 'texture',
                colorSpace: SRGBColorSpace,
                autoMobile: true,
              }).content as Texture,
            },
            u_clipTexture: {
              value: loader.add(settings.TEXTURE_PATH + 'wearable/1_clip.webp', {
                type: 'texture',
                colorSpace: SRGBColorSpace,
                autoMobile: true,
              }).content as Texture,
            },
            u_sceneCacheTexture: postprocessing.sharedUniforms.u_sceneCacheTexture,
            u_rect: { value: this.rect },
            u_textureSize: { value: new Vector2(850, 1100) },
            u_pinTexture: {
              value: loader.add(settings.TEXTURE_PATH + 'wearable/pin.webp', {
                type: 'texture',
                minFilter: LinearFilter,
              }).content as Texture,
            },
            u_pinTextureSize: { value: _pinTextureSize },
            u_pinScaleFix: { value: _scaleFix },
            u_pinColor: { value: new Color(7730926).convertSRGBToLinear() },
            u_pinPixelRange: { value: _pinPixelRange },
            u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
            u_resolution: properties.sharedUniforms.u_resolution,
            u_showRatio: { value: 0 },
            u_pinShowRatio: { value: 0 },
            u_opacity: { value: 0 },
            u_zoom: coaster.sharedUniforms.u_zoom,
            u_zoomCenter: { value: new Vector2(-75596e-8, 0.286256857) },
            u_time: properties.sharedUniforms.u_time,
            u_easedMouse: { value: input.easedMouseDynamics.default.value },
            u_rotation: { value: 0 },
            u_scale: { value: 1 },
          },
          blueNoise.shaderUniforms,
        ),
        defines: { BLUR_SAMPLE: 6 },
        depthTest: false,
        depthWrite: false,
        vertexShader: wearableFrameVert,
        fragmentShader: wearableFrameFrag,
        derivatives: true,
        glslVersion: GLSL3,
      }),
    );
    _mesh.frustumCulled = false;
    _mesh.renderOrder = -1.5;
    this.container.add(_mesh);
    _mesh.onBeforeRender = () => {
      postprocessing.cacheScene(true, 0);
    };
    cameraControls.initClippingMesh(_mesh);
  }

  init(): void {}

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(dt: number): void {
    this.container.visible = this.isActive;
    if (_mesh) {
      const material = _mesh.material as RawShaderMaterial;
      material.uniforms.u_showRatio.value = this.showRatio;
      material.uniforms.u_opacity.value = fit(this.showRatio, 0, 0.3, 0, 1);
      _mesh.needsClipping = true;
      this.pinShowRatio = saturate(
        this.pinShowRatio + (this.showRatio > 0.95 ? dt * 2 : -dt * 4),
      );
      material.uniforms.u_pinShowRatio.value = this.pinShowRatio;
      const rotation = fit(this.hideRatio, 0, 1, 0, WEARABLE_GALLERY_INNER_ROTATION);
      const scale = fit(this.hideRatio, 0, 1, 1, WEARABLE_GALLERY_INNER_SCALE);
      material.uniforms.u_rotation.value = rotation;
      material.uniforms.u_scale.value = scale;
    }
  }
}

export const wearableFrame = new WearableFrame();