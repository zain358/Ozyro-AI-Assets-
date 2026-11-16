import {
  Color,
  LinearMipMapLinearFilter,
  Matrix2,
  Matrix4,
  Mesh,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, IUniform, Texture, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { ease } from '../core/ease';
import { fboHelper } from '../core/fboHelper';
import { loader } from '../core/Loader';
import { fit } from '../core/math';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { textureHelper } from '../core/textureHelper';
import {
  coasterBlendFrag,
  coasterEncryptionFrag,
  coasterFrag,
  coasterStackFrag,
  coasterVert,
} from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { TAAMesh } from '../post/TAAMesh';
import { bg } from './bg';
import { coasterText } from './coasterText';
import { gobo } from './gobo';
import { tableCoffee } from './tableCoffee';
import { thermodynamicOverlay } from './thermodynamicOverlay';

const _m = new Matrix4();
const _v0 = new Vector3();
let _prevEnvBlendRatio: number | null = null;
let _prevEnvTexture1Uniform: IUniform | null = null;
let _prevEnvTexture2Uniform: IUniform | null = null;

class Coaster {
  container = new Object3D();
  innerContainer = new Object3D();
  position = new Vector3();
  lightPosition = new Vector3(0, 0, 0);
  localLightPosition = new Vector3(0, 0, 0);
  envCombineRT!: WebGLRenderTarget;
  envBlendRatio = 0;
  envTexture1Uniform: IUniform | null = null;
  envTexture2Uniform: IUniform | null = null;
  imgBasedOpacity = 0;
  imgBasedTexture: Texture | null = null;
  imgBasedMVP = new Matrix4();
  wearableBlendingRatio = 0;
  isActive = false;
  areStackMeshesActive = false;
  haloRatio = 0;
  extraBumpScale = 0;
  handSectionHighlightRatio = 0;
  condomSceneRatio = 0;
  coffeeShadowStrength = 0;
  isFeatureEncryptionSectionActive = false;
  featureSectionRatio = 0;
  encryptionSectionTopToFrontRatio = 0;
  encryptionSectionZoomRatio = 0;
  coffeeInvMatrix = new Matrix4();
  stackBlendToImageRatio = 0;
  oryzoProRatio = 0;
  oryzoProMaxRatio = 0;
  coasterGeometry: BufferGeometry | null = null;
  mesh!: TAAMesh;
  meshPro!: TAAMesh;
  meshProMax!: TAAMesh;
  materialDefault!: ShaderMaterial;
  materialEncryption!: ShaderMaterial;
  materialStack!: ShaderMaterial;
  private blendMaterial!: ShaderMaterial;

  stackedSharedUniforms = {
    u_lightPosition: { value: this.lightPosition },
    u_extraLightPosition1: { value: new Vector3(1, -0.1, -0.75) },
    u_extraLightPosition2: { value: new Vector3(0, 1, 0) },
    u_blendEnvRatio: { value: 0 },
    u_haloIntensity: { value: 0 },
  };

  sharedUniforms = {
    u_texture: { value: null as Texture | null },
    u_envTexture: { value: null as Texture | null },
    u_localLightPosition: { value: this.localLightPosition },
    u_resolution: properties.sharedUniforms.u_resolution,
    u_position: { value: this.position },
    u_imgBasedOpacity: { value: 0 },
    u_imgBasedTexture: { value: null as Texture | null },
    u_imgBasedMVP: { value: this.imgBasedMVP },
    u_coffeeShadowStrength: { value: 0 },
    u_condomSceneRatio: { value: 0 },
    u_extraBumpScale: { value: 0 },
    u_textureSize: { value: new Vector2(1024, 1024) },
    u_zoom: { value: 1 },
    u_zoomCenter: { value: new Vector2() },
    u_randomFlipRot: { value: new Matrix2() },
  };

  preInit(): void {
    this.container.add(this.innerContainer);
    this.sharedUniforms.u_texture.value = textureHelper.loadRGBATexture(
      settings.TEXTURE_PATH + 'coaster/DIFF.webp',
      settings.TEXTURE_PATH + 'coaster/HEIGHT.webp',
      {
        minFilter: LinearMipMapLinearFilter,
        wrapS: RepeatWrapping,
        wrapT: RepeatWrapping,
        autoMobile: true,
      },
    );
    this.envCombineRT = fboHelper.createRenderTarget(128, 64, false, true);
    this.blendMaterial = fboHelper.createRawShaderMaterial({
      uniforms: {
        u_texture1: { value: null },
        u_texture2: { value: null },
        u_blendRatio: { value: 0 },
      },
      fragmentShader: coasterBlendFrag,
    }) as unknown as ShaderMaterial;
    loader.add(settings.MODEL_PATH + 'coaster.buf', {
      onLoad: (content) => {
        this._onCoasterLoaded(content as BufferGeometry);
      },
    });
    coasterText.preInit();
  }

  private _onCoasterLoaded(geometry: BufferGeometry): void {
    this.coasterGeometry = geometry;
    this.coasterGeometry.computeBoundingBox();
  }

  init(): void {
    // heroScene imported lazily to break the module cycle (single-scope in source).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { heroScene } = _heroSceneRef;
    this.materialDefault = new ShaderMaterial({
      vertexShader: coasterVert,
      fragmentShader: coasterFrag,
      uniforms: Object.assign(
        {
          u_heroRatio: heroScene.sharedUniforms.u_activeRatio,
          u_highlightRatio: { value: 0 },
          u_brdfLut: properties.sharedUniforms.u_brdfLut,
          u_wearableBlendingRatio: { value: 0 },
          u_lmsTexture: { value: postprocessing.appleEfx.lmsTexture },
          u_time: properties.sharedUniforms.u_time,
        },
        this.sharedUniforms,
        blueNoise.shaderUniforms,
        gobo.sharedUniforms,
      ),
      defines: {
        BLUR_SAMPLE: 6,
        USE_ZOOM: true,
      },
    });
    this.materialEncryption = new ShaderMaterial({
      vertexShader: coasterVert,
      fragmentShader: coasterEncryptionFrag,
      uniforms: Object.assign(
        {
          u_giColor: { value: new Color('#69987c') },
          u_lightPosition: { value: new Vector3(-100, 50, 40) },
          u_zoomRatio: { value: 0 },
          u_coffeeInvMatrix: { value: this.coffeeInvMatrix },
          u_brdfLut: properties.sharedUniforms.u_brdfLut,
          u_textMap: coasterText.sharedUniforms.u_map,
          u_textSize: coasterText.sharedUniforms.u_resolution,
          u_textOpacity: { value: 0 },
        },
        this.sharedUniforms,
        blueNoise.shaderUniforms,
        thermodynamicOverlay.sharedUniforms,
      ),
    });
    this.materialStack = this.getMaterialStack();
    this.mesh = new TAAMesh(this.coasterGeometry!, [
      this.materialDefault,
      this.materialEncryption,
      this.materialStack,
    ]);
    this.meshPro = new TAAMesh(this.coasterGeometry!, this.getMaterialStack());
    this.meshProMax = new TAAMesh(this.coasterGeometry!, this.getMaterialStack());
    cameraControls.initClippingMesh(this.mesh);
    this.innerContainer.add(this.mesh);
    this.innerContainer.add(this.meshPro);
    this.innerContainer.add(this.meshProMax);
    coasterText.init();
  }

  getMaterialStack(): ShaderMaterial {
    return new ShaderMaterial({
      vertexShader: coasterVert,
      fragmentShader: coasterStackFrag,
      uniforms: Object.assign(
        {
          u_opacity: { value: 1 },
          u_neighboorTopAo: { value: 0 },
          u_neighboorBottomAo: { value: 0 },
        },
        this.sharedUniforms,
        this.stackedSharedUniforms,
        bg.sharedUniforms,
        blueNoise.shaderUniforms,
      ),
    });
  }

  resetTransform(): void {
    this.isActive = false;
    this.container.position.set(0, 0, 0);
    this.container.quaternion.set(0, 0, 0, 1);
    this.container.scale.set(1, 1, 1);
    this.innerContainer.position.set(0, 0, 0);
    this.innerContainer.quaternion.set(0, 0, 0, 1);
    this.innerContainer.scale.set(1, 1, 1);
    if (this.mesh) {
      this.mesh.position.set(0, 0, 0);
      this.mesh.quaternion.set(0, 0, 0, 1);
      this.meshPro.position.set(0, 0, 0);
      this.meshPro.quaternion.set(0, 0, 0, 1);
      this.meshProMax.position.set(0, 0, 0);
      this.meshProMax.quaternion.set(0, 0, 0, 1);
    }
    this.imgBasedOpacity = 0;
    this.imgBasedTexture = textureHelper.transparentTexture;
    this.imgBasedMVP.identity();
  }

  updateEncryptionText(text: string): void {
    coasterText.updateText(text);
  }

  update(): void {
    if (!properties.hasInitialized) return;
    this.mesh.material = this.isFeatureEncryptionSectionActive
      ? this.materialEncryption
      : this.materialDefault;
    if (this.areStackMeshesActive) this.mesh.material = this.materialStack;
    this.sharedUniforms.u_extraBumpScale.value = this.extraBumpScale;
    this.materialDefault.uniforms.u_highlightRatio.value = this.handSectionHighlightRatio;
    this.materialDefault.uniforms.u_wearableBlendingRatio.value = this.wearableBlendingRatio;
    this.materialEncryption.uniforms.u_lightPosition.value.copy(this.lightPosition);
    this.materialEncryption.uniforms.u_zoomRatio.value = fit(
      this.encryptionSectionZoomRatio,
      0,
      0.4,
      0,
      1,
    );
    this.sharedUniforms.u_coffeeShadowStrength.value = this.coffeeShadowStrength;
    this.sharedUniforms.u_imgBasedOpacity.value = this.imgBasedOpacity;
    this.sharedUniforms.u_imgBasedTexture.value = this.imgBasedTexture;
    this.sharedUniforms.u_condomSceneRatio.value = this.condomSceneRatio;
    this.container.visible = this.isActive;
    const blendRatio = this.envBlendRatio;
    if (
      _prevEnvBlendRatio !== blendRatio
      || this.envTexture1Uniform !== _prevEnvTexture1Uniform
      || this.envTexture2Uniform !== _prevEnvTexture2Uniform
    ) {
      const uniforms = this.blendMaterial.uniforms as Record<string, IUniform>;
      uniforms.u_texture1 = this.envTexture1Uniform ?? { value: textureHelper.blackTexture };
      uniforms.u_texture2 = this.envTexture2Uniform ?? { value: textureHelper.blackTexture };
      uniforms.u_blendRatio.value = blendRatio;
      fboHelper.render(this.blendMaterial, this.envCombineRT);
      _prevEnvTexture1Uniform = this.envTexture1Uniform;
      _prevEnvTexture2Uniform = this.envTexture2Uniform;
      _prevEnvBlendRatio = blendRatio;
    }
    this.sharedUniforms.u_envTexture.value = this.envCombineRT.texture;
    this.container.updateMatrixWorld(true);
    this.position.setFromMatrixPosition(this.innerContainer.matrixWorld);
    _m.copy(this.innerContainer.matrixWorld).invert();
    this.localLightPosition.copy(this.lightPosition).applyMatrix4(_m);
    this.coffeeInvMatrix.copy(tableCoffee.container.matrixWorld).invert();
    _v0.set(0, 0, 0).applyMatrix4(this.innerContainer.matrixWorld).project(properties.camera);
    (this.sharedUniforms.u_zoomCenter.value as Vector2).set(_v0.x, _v0.y);
    const proIn = ease.quartInOut(this.oryzoProRatio);
    const proOut = ease.quartInOut(1 - this.oryzoProRatio);
    const proMaxIn = ease.quartInOut(this.oryzoProMaxRatio);
    const proMaxOut = ease.quartInOut(1 - this.oryzoProMaxRatio);
    const step = 0.016;
    const gap = 0.005;
    const lift = 0.35;
    this.mesh.position.y += lift * step * proIn;
    this.mesh.position.y += lift * step * proMaxIn;
    this.meshPro.visible = false;
    this.meshProMax.visible = false;
    if (this.areStackMeshesActive) {
      this.meshPro.position.copy(this.mesh.position);
      this.meshPro.position.y -= step;
      this.meshProMax.position.copy(this.mesh.position);
      this.meshProMax.position.y -= 2 * step;
      this.meshPro.visible = this.oryzoProRatio > 0;
      this.meshPro.position.y -= proOut * gap;
      (this.meshPro.material as ShaderMaterial).uniforms.u_opacity.value = proIn;
      (this.mesh.material as ShaderMaterial).uniforms.u_neighboorBottomAo.value = proIn;
      (this.meshPro.material as ShaderMaterial).uniforms.u_neighboorTopAo.value = proIn;
      this.meshProMax.visible = this.oryzoProMaxRatio > 0;
      this.meshProMax.position.y -= proMaxOut * gap;
      (this.meshProMax.material as ShaderMaterial).uniforms.u_opacity.value = proMaxIn;
      (this.meshPro.material as ShaderMaterial).uniforms.u_neighboorBottomAo.value = proMaxIn;
      (this.meshProMax.material as ShaderMaterial).uniforms.u_neighboorTopAo.value = proMaxIn;
    }
    this.materialEncryption.uniforms.u_textOpacity.value = this.isFeatureEncryptionSectionActive
      ? 1
      : 0;
  }
}

export const coaster = new Coaster();

// Late-bound heroScene reference (module cycle: coaster <-> heroScene).
const _heroSceneRef: { heroScene: { sharedUniforms: { u_activeRatio: IUniform } } } = {
  heroScene: { sharedUniforms: { u_activeRatio: { value: 0 } } },
};
export function bindHeroScene(scene: { sharedUniforms: { u_activeRatio: IUniform } }): void {
  _heroSceneRef.heroScene = scene;
}
