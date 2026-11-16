import {
  AddEquation,
  Color,
  CustomBlending,
  GLSL3,
  Matrix4,
  Mesh,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Quaternion,
  ShaderMaterial,
  SrcAlphaFactor,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, RawShaderMaterial, Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { DomGLRect } from '../core/DomGLRect';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { fit, saturate } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import {
  barkFrag,
  barkVert,
  sustainabilityBgFrag,
  sustainabilityOutlineFrag,
  sustainabilityOutlineVert,
  sustainabilityTextFrag,
  sustainabilityTextVert,
} from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { PostProfile } from '../post/PostProfile';
import { screenPaint } from '../post/ScreenPaint';
import { TAAMesh } from '../post/TAAMesh';
import { coaster } from './coaster';
import { gobo } from './gobo';

// ------------------------------------------------------- sustainability bg

export class SustainabilityBg {
  container = new Object3D();
  color = new Color();
  transitionRatio = 0;
  screenOffsetY = 0;
  mesh!: Mesh;
  sharedUniforms = {
    u_color: { value: this.color },
    u_transitionRatio: { value: this.transitionRatio },
    u_screenOffsetY: { value: 0 },
  };

  preInit(): void {
    this.mesh = new Mesh(
      fboHelper.triGeom,
      fboHelper.createRawShaderMaterial({
        fragmentShader: sustainabilityBgFrag,
        uniforms: Object.assign(
          {
            u_resolution: properties.sharedUniforms.u_resolution,
            u_pealRatio: sustainabilityScene.sharedUniforms.u_pealRatio,
          },
          this.sharedUniforms,
          gobo.sharedUniforms,
          blueNoise.shaderUniforms,
        ),
        defines: { BLUR_SAMPLE: 6 },
      }),
    );
    ((this.mesh.material as RawShaderMaterial).defines as Record<string, unknown>).SAMPLE_COUNT = 16;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -15;
    this.container.add(this.mesh);
  }

  init(): void {}

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    this.sharedUniforms.u_transitionRatio.value = this.transitionRatio;
    this.sharedUniforms.u_screenOffsetY.value = this.screenOffsetY;
  }
}

export const sustainabilityBg = new SustainabilityBg();

// ----------------------------------------------------- sustainability bark

export class SustainabilityBark {
  container = new Object3D();
  animation = 0;
  texture: Texture | null = null;
  mesh: TAAMesh | null = null;

  preInit(): void {}

  private _onGeometryLoaded(geometry: BufferGeometry): void {
    this.mesh = new TAAMesh(
      geometry,
      new ShaderMaterial({
        uniforms: {
          u_texture: { value: this.texture },
          u_showRatio: sustainabilityScene.sharedUniforms.u_showRatio,
          u_pealRatio: sustainabilityScene.sharedUniforms.u_pealRatio,
          u_easedMouse: { value: input.easedMouseDynamics.default.value },
        },
        vertexShader: barkVert,
        fragmentShader: barkFrag,
      }),
    );
    this.mesh.frustumCulled = false;
    this.container.add(this.mesh);
    (this.mesh as unknown as Record<string, unknown>).__isBark = true;
  }

  init(): void {
    this.texture = loader.load(settings.TEXTURE_PATH + 'sustainability/bark.webp', {
      type: 'texture',
      colorSpace: SRGBColorSpace,
      autoMobile: true,
    }).content as Texture;
    loader.load(settings.MODEL_PATH + 'BARK.buf', {
      autoMobile: true,
      onLoad: (content) => this._onGeometryLoaded(content as BufferGeometry),
    });
  }

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    this.container.visible = this.animation < 2;
  }
}

export const sustainabilityBark = new SustainabilityBark();

// ----------------------------------------------------- sustainability text

const rect = new DomGLRect();
let _textMesh: Mesh | null = null;
let _outlineMesh: Mesh | null = null;

export class SustainabilityText {
  rect = rect;
  container = new Object3D();
  size = new Vector2(1, 0.150907);
  color = new Color();
  outlineShowRatio = 0;
  pealRatio = 0;
  pulseRatio = 0;
  transitionRatio = 0;
  sharedUniforms = {
    u_rect: { value: this.rect },
    u_size: { value: this.size },
    u_color: { value: new Color() },
    u_thickness: { value: 1 },
    u_showRatio: { value: 1 },
    u_hideRatio: { value: 1 },
    u_endRatio2: { value: 0 },
    u_pealRatio: { value: 0 },
    u_pulseRatio: { value: 0 },
    u_transitionRatio: { value: 0 },
  };

  preInit(): void {
    loader.add(settings.MODEL_PATH + 'sustainability_text.buf', {
      onLoad: (content) => this._onLoad(content as BufferGeometry),
    });
    loader.add(settings.MODEL_PATH + 'sustainability_text_outline.buf', {
      onLoad: (content) => this._onLoadOutline(content as BufferGeometry),
    });
  }

  private _onLoad(geometry: BufferGeometry): void {
    _textMesh = new Mesh(
      geometry,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign(
          {
            u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
            u_bgColor: sustainabilityBg.sharedUniforms.u_color,
          },
          this.sharedUniforms,
        ),
        vertexShader: sustainabilityTextVert,
        fragmentShader: sustainabilityTextFrag,
        glslVersion: GLSL3,
        derivatives: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    _textMesh.frustumCulled = false;
    _textMesh.renderOrder = -2;
  }

  private _onLoadOutline(geometry: BufferGeometry): void {
    _outlineMesh = new Mesh(
      geometry,
      fboHelper.createRawShaderMaterial({
        uniforms: Object.assign(
          {
            u_viewportResolution: properties.sharedUniforms.u_viewportResolution,
            u_time: properties.sharedUniforms.u_time,
            u_screenPaintTexture: screenPaint.sharedUniforms.u_currPaintTexture,
            u_resolution: properties.sharedUniforms.u_resolution,
          },
          this.sharedUniforms,
        ),
        vertexShader: sustainabilityOutlineVert,
        fragmentShader: sustainabilityOutlineFrag,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquationAlpha: AddEquation,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
        depthTest: false,
        depthWrite: false,
      }),
    );
    _outlineMesh.frustumCulled = false;
    _outlineMesh.renderOrder = -1;
  }

  init(): void {
    this.container.add(_textMesh!);
    this.container.add(_outlineMesh!);
  }

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    if (_textMesh) {
      (this.sharedUniforms.u_color.value as Color).copy(this.color).convertLinearToSRGB();
      this.sharedUniforms.u_pealRatio.value = this.pealRatio;
      this.sharedUniforms.u_pulseRatio.value = this.pulseRatio;
      this.sharedUniforms.u_transitionRatio.value = this.transitionRatio;
    }
  }
}

export const sustainabilityText = new SustainabilityText();

// ---------------------------------------------------- sustainability scene

const cameraPosition = new Vector3(0, 0.333, 0);
const cameraQuaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const aperture = 41.4214;
const viewPixelWidth = 2048;
const viewPixelHeight = 1024;
const focal = 50;
const _goboMatrix = new Matrix4();
const POST_PROFILE = new PostProfile({
  bloomAmount: 2.5,
  bloomSelectiveStrength: 1.5,
});

export class SustainabilityScene {
  container = new Object3D();
  isActive = false;
  animation = 0;
  sharedUniforms = {
    u_showRatio: { value: 0 },
    u_pealRatio: { value: 0 },
  };

  preInit(): void {
    sustainabilityBg.preInit();
    this.container.add(sustainabilityBg.container);
    sustainabilityText.preInit();
    this.container.add(sustainabilityText.container);
    sustainabilityBark.preInit();
    this.container.add(sustainabilityBark.container);
    const goboCamera = new PerspectiveCamera(60, 1, 0.01, 20);
    goboCamera.position.set(1.27056, 1.04822, 2.05131);
    goboCamera.quaternion.set(-0.284672, 0.0515004, -0.0734331, 0.95442);
    goboCamera.updateMatrix();
    goboCamera.updateMatrixWorld();
    _goboMatrix.multiplyMatrices(goboCamera.projectionMatrix, goboCamera.matrixWorldInverse);
  }

  init(): void {
    sustainabilityBg.init();
    sustainabilityText.init();
    sustainabilityBark.init();
  }

  resize(): void {
    sustainabilityBg.resize();
    sustainabilityText.resize();
    sustainabilityBark.resize();
  }

  preUpdate(dt: number): void {
    const t = this.animation;
    postprocessing.blendProfile(POST_PROFILE, fit(t, 0, 1, 0, 1));
    if (this.isActive) {
      coaster.isActive = false;
      cameraControls.position.copy(cameraPosition);
      cameraControls.quaternion.copy(cameraQuaternion);
      const filmHeight = (viewPixelHeight * aperture) / viewPixelWidth;
      const fov = 2 * Math.atan(filmHeight / 2 / focal) * (180 / Math.PI);
      cameraControls.fov = fov;
      gobo.setTexture('gobo_c');
      gobo.setMatrix(_goboMatrix, 2.2025, 2.82903);
      gobo.opacity = 1;
      gobo.mouseStrength = 0.001;
      this.sharedUniforms.u_showRatio.value = fit(t, 0, 1, 0, 1);
      this.sharedUniforms.u_pealRatio.value = fit(t, 1, 2, 0, 1);
      sustainabilityBg.preUpdate(dt);
      sustainabilityText.pealRatio = fit(this.sharedUniforms.u_pealRatio.value, 0.3, 1, 0, 1);
      const pulsing = t > 1.7 && t < 2.1;
      if (sustainabilityText.pulseRatio > 0 || (t > 1.7 && t < 2.1)) {
        sustainabilityText.pulseRatio = saturate(sustainabilityText.pulseRatio + dt * 0.5);
      }
      if (!pulsing) {
        if (sustainabilityText.pulseRatio >= 1) sustainabilityText.pulseRatio = 0;
      }
      sustainabilityText.preUpdate(dt);
      if (t < 2) {
        cameraControls.viewOffsetY = 0;
        cameraControls.zoom = 1;
      }
      sustainabilityBark.animation = t;
      sustainabilityBark.preUpdate(dt);
    } else {
      sustainabilityText.pulseRatio = 0;
    }
  }

  update(dt: number): void {
    this.container.visible = this.isActive;
    if (this.isActive) {
      sustainabilityBg.update(dt);
      sustainabilityText.update(dt);
      sustainabilityBark.update(dt);
    }
  }
}

export const sustainabilityScene = new SustainabilityScene();