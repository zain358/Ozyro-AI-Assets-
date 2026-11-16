import {
  AddEquation,
  CustomBlending,
  LinearFilter,
  Mesh,
  NearestFilter,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  SrcAlphaFactor,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, IUniform, RawShaderMaterial, Texture, WebGLRenderTarget } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { fboHelper } from '../core/fboHelper';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import {
  coffeeCoverFrag,
  coffeeCupFrag,
  coffeeVert,
  smokeCacheFrag,
  smokeFrag,
  smokeVert,
} from '../glsl';
import { TAAMesh } from '../post/TAAMesh';
import { coaster } from './coaster';
import { thermodynamicOverlay } from './thermodynamicOverlay';

let _smokeBaseTexture: Texture;
let _smokeHarmonics0Texture: Texture;
let _smokeHarmonics1Texture: Texture;
let _smokeRT: WebGLRenderTarget;
let _smokeCacheMaterial: RawShaderMaterial;

type ClippableMesh = Mesh & { needsClipping?: boolean };

export class TableCoffee {
  container = new Object3D();
  ratio = 0;
  cupTime = 0;
  dummyMesh: ClippableMesh | null = null;
  cupMesh: TAAMesh | null = null;
  coverMesh: TAAMesh | null = null;
  labelMesh: TAAMesh | null = null;
  shadowStrength = 0;
  lightPosition = new Vector3(0, 0, 0);
  alphaMultiplier = 1;
  isActive = false;
  smokeMesh!: Mesh;
  smokePosition = new Vector3(-0.0324208, 0.13, -0.0109422);
  sharedUniforms = {
    u_strength: { value: 0.131688 },
    u_freq: { value: new Vector2(1, 2) },
    u_time: { value: 0 },
    u_baseTexture: { value: null as Texture | null },
    u_harmonics0Texture: { value: null as Texture | null },
    u_position: { value: new Vector3() },
    u_alphaMultiplier: { value: 1 },
  };

  preInit(): void {}

  private _loadGeometry(name: 'COVER' | 'CUP' | 'LABEL', texture: Texture | null): void {
    loader.load(settings.MODEL_PATH + `table/COFFEE/${name}.buf`, {
      onLoad: (content) => {
        this._geometryLoad(name, content as BufferGeometry, texture);
      },
    });
  }

  private _geometryLoad(
    name: 'COVER' | 'CUP' | 'LABEL',
    geometry: BufferGeometry,
    texture: Texture | null,
  ): void {
    let fragmentShader: string;
    switch (name) {
      case 'LABEL':
      case 'CUP':
        fragmentShader = coffeeCupFrag;
        break;
      case 'COVER':
        fragmentShader = coffeeCoverFrag;
        geometry.computeBoundingBox();
        break;
    }
    const uniforms: Record<string, IUniform> = Object.assign(
      { u_resolution: properties.sharedUniforms.u_resolution },
      this.sharedUniforms,
      thermodynamicOverlay.sharedUniforms,
      blueNoise.shaderUniforms,
      name === 'COVER'
        ? {
            u_smokePosition: { value: this.smokePosition },
            u_bboxY: {
              value: new Vector2(geometry.boundingBox!.min.y, geometry.boundingBox!.max.y),
            },
          }
        : {},
    );
    const material = new ShaderMaterial({
      vertexShader: coffeeVert,
      fragmentShader,
      uniforms,
    });
    const mesh = new TAAMesh(geometry, material);
    switch (name) {
      case 'CUP':
        (material.defines as Record<string, unknown>).IS_CUP = true;
        this.cupMesh = mesh;
        break;
      case 'COVER': {
        uniforms.u_brdfLut = properties.sharedUniforms.u_brdfLut;
        uniforms.u_specTexture = { value: texture };
        (material.defines as Record<string, unknown>).IS_COVER = true;
        this.coverMesh = mesh;
        const dummy = (this.dummyMesh = new Mesh(
          geometry,
          new ShaderMaterial({
            uniforms: {},
            vertexShader:
              'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
            fragmentShader: 'void main() { gl_FragColor = vec4(1.); }',
          }),
        ));
        cameraControls.initClippingMesh(dummy);
        break;
      }
      case 'LABEL':
        uniforms.u_texture = { value: texture };
        (material.defines as Record<string, unknown>).IS_LABEL = true;
        this.labelMesh = mesh;
        break;
    }
    this.container.add(mesh);
    cameraControls.initClippingMesh(mesh);
  }

  init(): void {
    const coverSpec = loader.load(settings.TEXTURE_PATH + 'coffee/cover-specular.webp', {
      type: 'texture',
      colorSpace: SRGBColorSpace,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
    }).content as Texture;
    const labelTexture = loader.load(settings.TEXTURE_PATH + 'coffee/LABEL.webp', {
      type: 'texture',
      channel: 1,
      autoMobile: true,
    }).content as Texture;
    this.sharedUniforms.u_baseTexture.value = loader.load(
      settings.TEXTURE_PATH + 'coffee/BASE_COLOR.webp',
      {
        type: 'texture',
        colorSpace: SRGBColorSpace,
        magFilter: LinearFilter,
        autoMobile: true,
      },
    ).content as Texture;
    this.sharedUniforms.u_harmonics0Texture.value = loader.load(
      settings.TEXTURE_PATH + 'coffee/BASE_HARMONICS_0_MOBILE.png',
      // Source passes mipFilter (a dead option in TextureItem) — only the
      // magFilter takes effect; minFilter stays at the loader default.
      { type: 'texture', magFilter: NearestFilter },
    ).content as Texture;
    this._loadGeometry('COVER', coverSpec);
    this._loadGeometry('CUP', null);
    this._loadGeometry('LABEL', labelTexture);
    _smokeBaseTexture = loader.load(settings.TEXTURE_PATH + 'coffee/smoke/base.webp', {
      type: 'texture',
      magFilter: NearestFilter,
    }).content as Texture;
    _smokeHarmonics0Texture = loader.load(settings.TEXTURE_PATH + 'coffee/smoke/harmonics_0.webp', {
      type: 'texture',
      magFilter: NearestFilter,
    }).content as Texture;
    _smokeHarmonics1Texture = loader.load(settings.TEXTURE_PATH + 'coffee/smoke/harmonics_1.webp', {
      type: 'texture',
      magFilter: NearestFilter,
    }).content as Texture;
    _smokeRT = fboHelper.createRenderTarget(83, 184);
    _smokeCacheMaterial = fboHelper.createRawShaderMaterial({
      fragmentShader: smokeCacheFrag,
      uniforms: Object.assign(
        {
          u_baseTexture: { value: _smokeBaseTexture },
          u_harmonics0Texture: { value: _smokeHarmonics0Texture },
          u_harmonics1Texture: { value: _smokeHarmonics1Texture },
          u_strength: { value: 0.322202 },
          u_time: { value: 0 },
          u_resolution: properties.sharedUniforms.u_resolution,
        },
        thermodynamicOverlay.sharedUniforms,
      ),
    });
    const smokeHeight = 0.15;
    const smokeGeometry = new PlaneGeometry((84 / 184) * smokeHeight, smokeHeight);
    smokeGeometry.translate(0, 0.5 * smokeHeight, 0);
    const smokeMesh = (this.smokeMesh = new Mesh(
      smokeGeometry,
      new ShaderMaterial({
        uniforms: Object.assign(
          {
            u_smokeTexture: { value: _smokeRT.texture },
            u_resolution: properties.sharedUniforms.u_resolution,
          },
          thermodynamicOverlay.sharedUniforms,
        ),
        vertexShader: smokeVert,
        fragmentShader: smokeFrag,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: SrcAlphaFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquationAlpha: AddEquation,
        blendDstAlpha: OneFactor,
        blendSrcAlpha: OneFactor,
        depthWrite: false,
      }),
    ));
    smokeMesh.position.copy(this.smokePosition);
    (smokeMesh.material as ShaderMaterial).onBeforeRender = () => {
      smokeMesh.normalMatrix.invert();
    };
    smokeMesh.renderOrder = 1;
    cameraControls.initClippingMesh(smokeMesh);
    this.container.add(smokeMesh);
  }

  resize(): void {}

  preUpdate(_dt: number): void {}

  update(_dt: number): void {
    if (!this.cupMesh || !this.coverMesh) return;
    this.container.visible = this.isActive;
    this.lightPosition.copy(coaster.lightPosition);
    this.sharedUniforms.u_time.value = this.cupTime * Math.PI * 2;
    if (this.isActive) {
      _smokeCacheMaterial.uniforms.u_time.value = properties.time * 2;
      fboHelper.render(_smokeCacheMaterial, _smokeRT);
      if (this.dummyMesh) {
        this.dummyMesh.position.copy(this.container.position);
        this.dummyMesh.quaternion.copy(this.container.quaternion);
      }
      (this.sharedUniforms.u_position.value as Vector3).copy(this.container.position);
      this.sharedUniforms.u_alphaMultiplier.value = this.alphaMultiplier;
    }
  }

  postUpdate(_dt: number): void {}
}

export const tableCoffee = new TableCoffee();
