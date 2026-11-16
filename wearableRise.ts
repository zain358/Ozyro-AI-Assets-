import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  GLSL3,
  Mesh,
  Object3D,
  OneFactor,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
} from 'three';
import type { RawShaderMaterial, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { DomGLRect } from '../core/DomGLRect';
import { fboHelper } from '../core/fboHelper';
import { fit } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import * as settings from '../core/settings';
import {
  wearableRiseColorPassFrag,
  wearableRiseColorPassVert,
  wearableRiseFrag,
  wearableRiseVert,
} from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { screenPaint } from '../post/ScreenPaint';
import { tableCoffee } from './tableCoffee';
import { WearableGalleryItem } from './wearableGallery';

import { LinearFilter } from 'three';

type ClippableMesh = Mesh & { needsClipping?: boolean };

const rect = new DomGLRect();
const _pixelRange = 4;
const _rawSize = new Vector2(755, 269);
const _textureSize = new Vector2(256, 92);
const containScale = Math.min(
  (_textureSize.x - _pixelRange) / _rawSize.x,
  (_textureSize.y - _pixelRange) / _rawSize.y,
);
const _scaleFix = new Vector2(
  (_rawSize.x * containScale) / _textureSize.x,
  (_rawSize.y * containScale) / _textureSize.y,
);
const _v = new Vector3();
const _v4 = new Vector4();
const colorPassRect = new DomGLRect();
let _cupCoverRT: WebGLRenderTarget;
let _colorPassMesh: ClippableMesh;
let _mesh: ClippableMesh;

export class WearablesRise {
  container = new Object3D();
  rect = rect;
  colorPassRect = colorPassRect;
  showRatio = 0;
  hideRatio = 0;
  pulseRatio = 0;
  isActive = false;

  preInit(): void {
    _cupCoverRT = fboHelper.createRenderTarget(1, 1);
    // 4 strips at these normalized x cuts, one id per strip.
    const cuts = [0, 0.305, 0.468, 0.74, 1];
    const geometry = new BufferGeometry();
    const positions = new Float32Array((cuts.length - 1) * 12);
    const ids = new Uint8Array((cuts.length - 1) * 4);
    const indices = new Uint8Array((cuts.length - 1) * 6);
    for (let i = 0, v = 0, idx = 0, p = 0; i < cuts.length - 1; i++, v += 4, idx += 6, p += 12) {
      const x0 = cuts[i] * 2 - 1;
      const x1 = cuts[i + 1] * 2 - 1;
      positions[p] = x0;
      positions[p + 1] = -1;
      positions[p + 2] = 0;
      positions[p + 3] = x0;
      positions[p + 4] = 1;
      positions[p + 5] = 0;
      positions[p + 6] = x1;
      positions[p + 7] = -1;
      positions[p + 8] = 0;
      positions[p + 9] = x1;
      positions[p + 10] = 1;
      positions[p + 11] = 0;
      ids[v] = i;
      ids[v + 1] = i;
      ids[v + 2] = i;
      ids[v + 3] = i;
      indices[idx] = v;
      indices[idx + 1] = v + 3;
      indices[idx + 2] = v + 1;
      indices[idx + 3] = v;
      indices[idx + 4] = v + 2;
      indices[idx + 5] = v + 3;
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('id', new BufferAttribute(ids, 1));
    geometry.setIndex(new BufferAttribute(indices, 1));
    _mesh = new Mesh(
      geometry,
      fboHelper.createRawShaderMaterial({
        uniforms: {
          u_texture: {
            value: loader.add(settings.TEXTURE_PATH + 'wearable/rise.webp', {
              type: 'texture',
              minFilter: LinearFilter,
            }).content,
          },
          u_rect: { value: rect },
          u_scaleFix: { value: _scaleFix },
          u_textureSize: { value: _textureSize },
          u_color: { value: new Color('#ffedd7').convertLinearToSRGB() },
          u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
          u_resolution: properties.sharedUniforms.u_resolution,
          u_pixelRange: { value: _pixelRange },
          u_rotation: { value: 0 },
          u_scale: { value: 1 },
          u_depth: { value: 0 },
          u_cupCoverTexture: { value: _cupCoverRT.texture },
          u_baseTexture: postprocessing.sharedUniforms.u_toTexture,
          u_hideRatio: { value: 0 },
          u_pulseRatio: { value: 0 },
          u_screenPaintTexture: screenPaint.sharedUniforms.u_currPaintTexture,
        },
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: ZeroFactor,
        blendEquationAlpha: AddEquation,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: ZeroFactor,
        derivatives: true,
        vertexShader: wearableRiseVert,
        fragmentShader: wearableRiseFrag,
        glslVersion: GLSL3,
        depthTest: true,
        depthWrite: true,
      }),
    );
    _mesh.frustumCulled = false;
    _mesh.renderOrder = 1;
    cameraControls.initClippingMesh(_mesh);
    const baseOnBeforeRender = _mesh.onBeforeRender;
    _colorPassMesh = new Mesh(
      fboHelper.quadGeom,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign(
          {
            u_texture: postprocessing.sharedUniforms.u_fromTexture,
            u_rect: { value: colorPassRect },
            u_resolution: properties.sharedUniforms.u_resolution,
            u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
            u_activeRatio: { value: 1 },
          },
          blueNoise.shaderUniforms,
        ),
        vertexShader: wearableRiseColorPassVert,
        fragmentShader: wearableRiseColorPassFrag,
        defines: { BLUR_SAMPLE: 6 },
      }),
    );
    const fxaaMesh: ClippableMesh = new Mesh(fboHelper.quadGeom, postprocessing.fxaa.material);
    cameraControls.initClippingMesh(fxaaMesh);
    fxaaMesh.frustumCulled = false;
    _mesh.onBeforeRender = (...args) => {
      let needsCupRender = scrollManager.isScrolling;
      if (properties.width !== _cupCoverRT.width || properties.height !== _cupCoverRT.height) {
        _cupCoverRT.setSize(properties.width, properties.height);
        needsCupRender = true;
      }
      const colorState = fboHelper.getColorState();
      const renderer = fboHelper.renderer;
      const prevRT = renderer.getRenderTarget();
      renderer.autoClear = true;
      renderer.setClearColor(0, 1);
      if (tableCoffee.dummyMesh && needsCupRender) {
        (tableCoffee.dummyMesh as ClippableMesh).needsClipping = true;
        fxaaMesh.needsClipping = true;
        fboHelper.renderMesh(
          tableCoffee.dummyMesh,
          postprocessing.toRenderTarget!,
          properties.camera,
        );
        const fxaa = postprocessing.fxaa;
        fxaa.material.uniforms.u_texture.value = postprocessing.toTexture;
        fboHelper.renderMesh(fxaaMesh, _cupCoverRT, properties.camera);
      }
      renderer.autoClear = true;
      fboHelper.copy(postprocessing.fromTexture!, postprocessing.toRenderTarget!);
      renderer.autoClear = false;
      _colorPassMesh.needsClipping = true;
      fboHelper.renderMesh(_colorPassMesh, postprocessing.toRenderTarget!, properties.camera);
      fboHelper.copy(postprocessing.toTexture!, postprocessing.fromRenderTarget!);
      renderer.setRenderTarget(prevRT);
      fboHelper.setColorState(colorState);
      baseOnBeforeRender.apply(_mesh, args as never);
    };
    _colorPassMesh.frustumCulled = false;
    cameraControls.initClippingMesh(_colorPassMesh);
    this.container.add(_mesh);
  }

  init(): void {}

  resize(_width?: number, _height?: number): void {}

  preUpdate(_dt: number): void {
    this.container.visible = this.isActive;
    _mesh.needsClipping = true;
  }

  update(_dt: number): void {
    if (!this.isActive) return;
    const material = _mesh.material as RawShaderMaterial;
    material.uniforms.u_rotation.value = -fit(
      this.showRatio,
      0,
      1,
      WearableGalleryItem.INNER_ROTATION,
      0,
    );
    material.uniforms.u_scale.value = fit(this.showRatio, 0, 1, WearableGalleryItem.INNER_SCALE, 1);
    material.uniforms.u_hideRatio.value = fit(this.hideRatio, 0.25, 1, 0, 1);
    material.uniforms.u_pulseRatio.value = this.pulseRatio;
    tableCoffee.container.updateMatrix();
    tableCoffee.container.updateMatrixWorld(true);
    _v.copy(tableCoffee.smokePosition).applyMatrix4(tableCoffee.container.matrixWorld);
    _v4.set(_v.x, _v.y, _v.z, 1);
    _v4.applyMatrix4(properties.camera.matrixWorldInverse);
    _v4.applyMatrix4(properties.camera.projectionMatrix);
    material.uniforms.u_depth.value = _v4.z / _v4.w;
    (_colorPassMesh.material as RawShaderMaterial).uniforms.u_activeRatio.value = fit(
      this.hideRatio,
      0.5,
      1,
      1,
      0,
    );
  }
}

export const wearableRise = new WearablesRise();