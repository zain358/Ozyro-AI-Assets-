import {
  CanvasTexture,
  LinearFilter,
  Matrix4,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import type { IUniform, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { blur } from '../core/blur';
import { browser } from '../core/browser';
import { cameraControls } from '../core/cameraControls';
import { ease } from '../core/ease';
import { fboHelper } from '../core/fboHelper';
import { fit, hash2 } from '../core/math';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { textureHelper } from '../core/textureHelper';
import { outFrag, outVert, propsBlurFrag } from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { PostProfile } from '../post/PostProfile';
import { coaster } from './coaster';
import { gobo } from './gobo';
import { heroSceneBase } from './heroSceneBase';
import { heroSceneDeskPad } from './heroSceneDeskPad';
import { HeroSceneProp, heroScenePropsData } from './heroSceneProps';

// Source constants (pretty line 20737-20745).
export const focalLength = 50;
export const aperture = 41.4;
export const viewPixelWidth = 2240;
export const viewPixelHeight = 1260;
export const expandedViewPixelWidth = 3296;
export const expandedViewPixelHeight = 1460;
const apy = (viewPixelHeight * aperture) / viewPixelWidth;
export const fov = 2 * Math.atan(apy / 2 / focalLength) * (180 / Math.PI);

const v4 = new Vector4();
const _goboMatrix = new Matrix4();
// Source POST_PROFILE$3 (pretty line 20748-20756).
const POST_PROFILE = new PostProfile({
  bloomAmount: 2,
  bloomLumaStrength: 0.2,
  bloomSaturation: 1.5,
  vignetteFrom: 0.5,
  vignetteTo: 1.3,
  tintColorHex: '#ef009d',
  tintOpacity: 0.015,
});

export interface HeroSceneShared {
  sharedUniforms: {
    u_2DlightPos: IUniform;
    u_planeResolution: IUniform;
    u_screenToWorld: IUniform;
    u_screenTableNDCDepth: IUniform;
    u_activeRatio: IUniform;
    u_zoom: IUniform;
    u_envTexture: IUniform;
  };
  camera2D: OrthographicCamera;
  shadowRT: WebGLRenderTarget;
  canvasTexture: CanvasTexture | null;
  activeRatio: number;
}

class HeroScene implements HeroSceneShared {
  container = new Object3D();
  scene2D!: Object3D;
  camera2D!: OrthographicCamera;
  screenToWorld = new Matrix4();
  rt!: WebGLRenderTarget;
  blurCacheRT!: WebGLRenderTarget;
  shadowRT!: WebGLRenderTarget;
  shadowCacheRT!: WebGLRenderTarget;
  props: HeroSceneProp[] = [];
  outMesh!: Mesh;
  lightPos = new Vector2(0, 0);
  lightDir = new Vector2();
  activeRatio = 1;
  isActive = false;
  coasterLightPosition = new Vector3(0.346682, 1.00875, -0.368255);
  useProps = !browser.isMobile;
  canvasTexture: CanvasTexture | null = null;
  private blurMaterial!: RawShaderMaterial;
  sharedUniforms = {
    u_2DlightPos: { value: this.lightPos },
    u_planeResolution: { value: new Vector2(expandedViewPixelWidth, expandedViewPixelHeight) },
    u_screenToWorld: { value: this.screenToWorld },
    u_screenTableNDCDepth: { value: 0 },
    u_activeRatio: { value: 0 },
    u_zoom: { value: 1 },
    u_envTexture: { value: null as unknown },
  };

  preInit(): void {
    heroSceneDeskPad.preInit();
    this.rt = fboHelper.createRenderTarget(1, 1);
    this.blurCacheRT = this.rt.clone();
    this.shadowRT = this.rt.clone();
    this.shadowCacheRT = this.rt.clone();
    this.scene2D = new Object3D();
    this.camera2D = new OrthographicCamera(-1, 1, 1, -1, 1, 3);
    this.camera2D.position.z = 2;
    this.sharedUniforms.u_envTexture.value = textureHelper.loadRGBMTexture(
      settings.TEXTURE_PATH + 'hero/env_hero.webp',
      { maxRange: 20 },
    );
    heroSceneBase.preInit(this, viewPixelWidth, viewPixelHeight);
    this.scene2D.add(heroSceneBase.mesh);
    if (this.useProps) {
      for (const id in heroScenePropsData) {
        const prop = new HeroSceneProp(id, heroScenePropsData[id], this);
        prop.preInit(expandedViewPixelWidth, expandedViewPixelHeight);
        this.props.push(prop);
        this.scene2D.add(prop.mesh);
      }
      this.blurMaterial = new RawShaderMaterial({
        uniforms: Object.assign(
          {
            u_texture: { value: null },
            u_texelSize: { value: new Vector2() },
            u_blurRadius: { value: 1 },
          },
          blueNoise.shaderUniforms,
        ),
        vertexShader: fboHelper.vertexShader,
        fragmentShader: fboHelper.precisionPrefix + propsBlurFrag,
        depthWrite: false,
        depthTest: false,
        defines: { BLUR_SAMPLE: 10 },
      });
    }
    const goboCamera = new PerspectiveCamera(60, 1, 0.01, 20);
    goboCamera.position.set(0.466854, 0.992917, -0.252766);
    goboCamera.quaternion.set(0.16182, -0.776664, -0.221667, -0.566984);
    goboCamera.updateMatrix();
    goboCamera.updateMatrixWorld();
    _goboMatrix.multiplyMatrices(goboCamera.projectionMatrix, goboCamera.matrixWorldInverse);
  }

  init(): void {
    heroSceneBase.init();
    this.outMesh = new Mesh(
      fboHelper.triGeom,
      new ShaderMaterial({
        vertexShader: outVert,
        fragmentShader: outFrag,
        uniforms: { u_texture: { value: this.rt.texture } },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.outMesh.frustumCulled = false;
    this.outMesh.renderOrder = -1;
    this.container.add(this.outMesh);
    heroSceneDeskPad.init();
  }

  resize(width: number, height: number): void {
    heroSceneBase.resize();
    this.rt.setSize(width, height);
    this.blurCacheRT.setSize(width, height);
    this.shadowRT.setSize(width >> 1, height >> 1);
    this.shadowCacheRT.setSize(width >> 1, height >> 1);
    const orthoHeight = viewPixelHeight;
    const orthoWidth = (orthoHeight / height) * width;
    this.camera2D.left = -orthoWidth / 2;
    this.camera2D.right = orthoWidth / 2;
    this.camera2D.top = orthoHeight / 2;
    this.camera2D.bottom = -orthoHeight / 2;
    this.camera2D.updateProjectionMatrix();
    heroSceneDeskPad.resize();
    heroSceneDeskPad.update();
    this.canvasTexture?.dispose();
    this.canvasTexture = new CanvasTexture(heroSceneDeskPad.canvas!);
    this.canvasTexture.minFilter = LinearFilter;
    this.canvasTexture.magFilter = LinearFilter;
    this.canvasTexture.generateMipmaps = false;
    this.canvasTexture.needsUpdate = true;
    this.lightPos.set(width, height);
  }

  /** Source HeroScene.preUpdate: fixed hero camera pose + gobo + env binding. */
  preUpdate(): void {
    properties.cameraLookStrength = 0;
    properties.cameraShakePositionStrength = 0;
    properties.cameraShakeRotationStrength = 0;
    properties.camera.fov = fov;
    cameraControls.position.set(-0.0105761, 1.22526, -0.0485146);
    cameraControls.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    cameraControls.fov = fov;
    if (properties.useMobileLayout) {
      cameraControls.zoom = 0.72;
      cameraControls.viewOffsetY = 0.03;
    }
    coaster.envTexture1Uniform = this.sharedUniforms.u_envTexture as IUniform;
    coaster.envBlendRatio = 0;
    coaster.lightPosition.copy(this.coasterLightPosition);
    if (this.activeRatio > 0) {
      gobo.setTexture('gobo_c');
      gobo.setMatrix(_goboMatrix, 0.372991, 0.79059);
    }
    gobo.opacity = fit(this.activeRatio, 0, 0.5, 0, 1);
    postprocessing.blendProfile(POST_PROFILE, 1);
  }

  update(dt: number): void {
    this.sharedUniforms.u_activeRatio.value = this.activeRatio;
    this.container.visible = this.isActive;
    this.camera2D.zoom = fit(this.activeRatio, 1, 0, 1, 0.95, ease.cubicIn.bind(ease));
    this.camera2D.updateProjectionMatrix();
    this.camera2D.rotation.z = properties.camera.rotation.z;
    this.sharedUniforms.u_zoom.value = this.camera2D.zoom * cameraControls.zoom;
    v4.set(-0.0105761, 0.7471, -0.0485146, 1);
    v4.applyMatrix4(properties.camera.mvp);
    this.sharedUniforms.u_screenTableNDCDepth.value = v4.z / v4.w;
    this.screenToWorld
      .multiplyMatrices(properties.camera.projectionMatrix, properties.camera.matrixWorldInverse)
      .invert();
    if (!this.isActive) return;
    heroSceneBase.update(this);
    this.lightDir.copy(this.lightPos).normalize();
    if (!properties.hasInitialized) return;
    const startTime = properties.startTime;
    if (this.useProps) {
      this.props.forEach((prop, i) => {
        prop.update(dt);
        const delay = hash2(i, 5.213) * 0.3;
        prop.startPosition.set(
          fit(startTime, 0.5 + delay, 0.5 + 1 + delay, prop.startX, 0, ease.cubicOut.bind(ease)),
          fit(startTime, 0.5 + delay, 0.5 + 1 + delay, prop.startY, 0, ease.cubicOut.bind(ease)),
        );
        prop.startRotation = fit(
          startTime,
          0.5 + delay,
          0.5 + 1 + delay,
          prop.startRot,
          0,
          ease.cubicOut.bind(ease),
        );
      });
      if (this.activeRatio <= 0) {
        this.outMesh.visible = false;
        return;
      }
      this.outMesh.visible = true;
      heroSceneBase.mesh.visible = false;
      this.props.forEach((prop) => prop.updateForBlurredShadow(this.lightDir));
      const colorState = fboHelper.getColorState();
      fboHelper.renderer.autoClear = true;
      fboHelper.renderMesh(this.scene2D as never, this.shadowCacheRT, this.camera2D);
      this.blurMaterial.uniforms.u_texture.value = this.shadowCacheRT.texture;
      (this.blurMaterial.uniforms.u_texelSize.value as Vector2).set(
        1 / this.shadowCacheRT.width,
        1 / this.shadowCacheRT.height,
      );
      this.blurMaterial.uniforms.u_blurRadius.value = 0.01 * this.shadowCacheRT.height;
      fboHelper.render(this.blurMaterial, this.shadowRT);
      this.props.forEach((prop) => prop.updateForPlainShadow(this.lightDir));
      fboHelper.renderer.autoClear = false;
      fboHelper.renderer.autoClearColor = false;
      fboHelper.renderer.autoClearDepth = false;
      fboHelper.renderMesh(this.scene2D as never, this.shadowRT, this.camera2D);
      fboHelper.setColorState(colorState);
      this.props.forEach((prop) => prop.updateForColorRender());
    }
    heroSceneBase.mesh.visible = true;
    fboHelper.renderMesh(this.scene2D as never, this.rt, this.camera2D);
    if (Math.abs(this.camera2D.zoom - 1) > 1e-5) {
      blur.blur(Math.abs(this.camera2D.zoom - 1) * 100, 1, this.rt, this.blurCacheRT, this.rt, true);
    }
  }
}

export const heroScene = new HeroScene();