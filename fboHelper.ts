// 1:1 port of the source FboHelper (pretty line 13060-13280).

import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoBlending,
  PlaneGeometry,
  RawShaderMaterial,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  UVMapping,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { Material, Texture, TextureDataType, WebGLRenderer } from 'three';
import { browser } from './browser';
import { blitFrag, blitVert, clearFrag, debugVert, uvBlitVert } from '../glsl';

interface ColorState {
  autoClear: boolean;
  autoClearColor: boolean;
  autoClearStencil: boolean;
  autoClearDepth: boolean;
  clearColor: number;
  clearAlpha: number;
}

class FboHelper {
  isWebGL2 = false;
  MAX_VARYING_VECTORS = 8;
  renderer!: WebGLRenderer;
  quadGeom!: PlaneGeometry;
  triGeom!: BufferGeometry;
  floatType!: TextureDataType;
  precisionPrefix = '';
  precisionPrefix2 = '';
  vertexPrefix = '';
  fragmentPrefix = '';
  vertexShader = '';
  copyMaterial!: RawShaderMaterial;
  uvCopyMaterial!: RawShaderMaterial;
  clearMaterial!: RawShaderMaterial;
  private _scene!: Scene;
  private _camera!: Camera;
  private _tri!: Mesh;
  private _debugScene!: Scene;
  private _debugMesh!: Mesh;
  private _debugMaterial!: RawShaderMaterial;

  init(renderer: WebGLRenderer, floatType: TextureDataType): void {
    this.renderer = renderer;
    this.floatType = floatType;
    this.isWebGL2 = this.renderer.capabilities.isWebGL2;
    const gl = this.renderer.getContext();
    this.MAX_VARYING_VECTORS = gl.getParameter(gl.MAX_VARYING_VECTORS) as number;
    this._scene = new Scene();
    this._camera = new Camera();
    this._camera.position.z = 1;
    this.triGeom = new BufferGeometry();
    this.triGeom.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 4, -1, 0, -1, 4, 0]), 3),
    );
    this.quadGeom = new PlaneGeometry(2, 2);
    this._tri = new Mesh(this.triGeom);
    this._tri.frustumCulled = false;
    this._scene.add(this._tri);
    this.precisionPrefix = `precision ${this.renderer.capabilities.precision} float;\n`;
    this.precisionPrefix2 = `
			precision ${this.renderer.capabilities.precision} float;
			precision ${this.renderer.capabilities.precision} int;
			#define IS_WEBGL2 true
		`;
    if (this.isWebGL2) {
      this.vertexPrefix = `${this.precisionPrefix2}
				precision mediump sampler2DArray;
				#define attribute in
				#define varying out
				#define texture2D texture
			`;
      this.fragmentPrefix = `${this.precisionPrefix2}
				#define varying in
				layout(location = 0) out vec4 pc_fragColor;
				#define gl_FragColor pc_fragColor
				#define gl_FragDepthEXT gl_FragDepth
				#define texture2D texture
				#define textureCube texture
				#define texture2DProj textureProj
				#define texture2DLodEXT textureLod
				#define texture2DProjLodEXT textureProjLod
				#define textureCubeLodEXT textureLod
				#define texture2DGradEXT textureGrad
				#define texture2DProjGradEXT textureProjGrad
				#define textureCubeGradEXT textureGrad
			`;
    } else {
      this.vertexPrefix = this.precisionPrefix;
      this.fragmentPrefix = this.precisionPrefix;
    }
    this.renderer.getContext().getExtension('OES_standard_derivatives');
    this.vertexShader = this.precisionPrefix + blitVert;
    this.copyMaterial = new RawShaderMaterial({
      uniforms: { u_texture: { value: null } },
      vertexShader: this.vertexShader,
      fragmentShader: this.precisionPrefix + blitFrag,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.uvCopyMaterial = new RawShaderMaterial({
      uniforms: { u_texture: { value: null } },
      vertexShader: this.precisionPrefix + uvBlitVert,
      fragmentShader: this.precisionPrefix + blitFrag,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this.clearMaterial = new RawShaderMaterial({
      uniforms: { u_color: { value: new Vector4(1, 1, 1, 1) } },
      vertexShader: this.vertexShader,
      fragmentShader: this.precisionPrefix + clearFrag,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    const debugGeom = new PlaneGeometry(1, 1);
    debugGeom.translate(0.5, -0.5, 0);
    this._debugMaterial = new RawShaderMaterial({
      uniforms: {
        u_texture: { value: null },
        u_transform: { value: new Vector4(0, 0, 1, 1) },
      },
      vertexShader: this.precisionPrefix + debugVert,
      fragmentShader: this.precisionPrefix + blitFrag,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    this._debugMesh = new Mesh(debugGeom, this._debugMaterial);
    this._debugScene = new Scene();
    this._debugScene.frustumCulled = false;
    this._debugScene.add(this._debugMesh);
  }

  copy(texture: Texture, rt?: WebGLRenderTarget): void {
    const material = this.copyMaterial;
    if (material) {
      material.uniforms.u_texture.value = texture;
      this.render(material, rt);
    }
  }

  uvCopy(texture: Texture, rt?: WebGLRenderTarget): void {
    const material = this.uvCopyMaterial;
    if (material) {
      material.uniforms.u_texture.value = texture;
      this.render(material, rt);
    }
  }

  render(material: Material, rt?: WebGLRenderTarget | null): void {
    if (this._tri && this.renderer && this._scene && this._camera) {
      this._tri.material = material;
      if (rt) this.renderer.setRenderTarget(rt);
      this.renderer.render(this._scene, this._camera);
      if (rt) this.renderer.setRenderTarget(null);
    }
  }

  renderGeometry(geometry: BufferGeometry, material: Material, rt?: WebGLRenderTarget): void {
    if (this._tri && this.triGeom) {
      this._tri.geometry = geometry;
      this.render(material, rt);
      this._tri.geometry = this.triGeom;
    }
  }

  renderMesh(mesh: import('three').Object3D, rt?: WebGLRenderTarget, camera: Camera = this._camera): void {
    if (this._tri && this.renderer && this._scene && camera) {
      this._tri.visible = false;
      this._scene.add(mesh);
      if (rt) this.renderer.setRenderTarget(rt || null);
      this.renderer.render(this._scene, camera);
      if (rt) this.renderer.setRenderTarget(null);
      this._scene.remove(mesh);
      this._tri.visible = true;
    }
  }

  parseDefines(defines: Record<string, unknown>): string {
    let out = '';
    for (const key in defines) {
      const value = defines[key];
      if (value === true) out += `#define ${key}\n`;
      else out += `#define ${key} ${value}\n`;
    }
    return out;
  }

  clearColor(r: number, g: number, b: number, a: number, rt?: WebGLRenderTarget): void {
    if (this.clearMaterial) {
      (this.clearMaterial.uniforms.u_color.value as Vector4).set(r, g, b, a);
      this.render(this.clearMaterial, rt);
    }
  }

  getColorState(): ColorState {
    if (!this.renderer) {
      return {
        autoClear: true,
        autoClearColor: true,
        autoClearStencil: true,
        autoClearDepth: true,
        clearColor: 0,
        clearAlpha: 1,
      };
    }
    const color = new Color();
    this.renderer.getClearColor(color);
    return {
      autoClear: this.renderer.autoClear,
      autoClearColor: this.renderer.autoClearColor,
      autoClearStencil: this.renderer.autoClearStencil,
      autoClearDepth: this.renderer.autoClearDepth,
      clearColor: color.getHex(),
      clearAlpha: this.renderer.getClearAlpha(),
    };
  }

  setColorState(state: ColorState): void {
    if (this.renderer) {
      this.renderer.setClearColor(state.clearColor, state.clearAlpha);
      this.renderer.autoClear = state.autoClear;
      this.renderer.autoClearColor = state.autoClearColor;
      this.renderer.autoClearStencil = state.autoClearStencil;
      this.renderer.autoClearDepth = state.autoClearDepth;
    }
  }

  createRawShaderMaterial(options: Record<string, unknown>): RawShaderMaterial {
    const opts = Object.assign(
      {
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
        vertexShader: blitVert,
        fragmentShader: blitFrag,
        derivatives: false,
      },
      options,
    ) as Record<string, unknown>;
    opts.vertexShader =
      ((opts.vertexShaderPrefix as string)
        ? (opts.vertexShaderPrefix as string)
        : opts.derivatives
          ? this.vertexPrefix
          : this.precisionPrefix) + (opts.vertexShader as string);
    opts.fragmentShader =
      ((opts.fragmentShaderPrefix as string)
        ? (opts.fragmentShaderPrefix as string)
        : opts.derivatives
          ? this.fragmentPrefix
          : this.precisionPrefix) + (opts.fragmentShader as string);
    delete opts.vertexShaderPrefix;
    delete opts.fragmentShaderPrefix;
    delete opts.derivatives;
    return new RawShaderMaterial(opts);
  }

  createDataTexture(
    data: BufferSource | ImageBitmap | null,
    width: number,
    height: number,
    isFloat = false,
    isNearest = true,
  ): DataTexture {
    const tex = new DataTexture(
      data as never,
      width,
      height,
      RGBAFormat,
      isFloat ? FloatType : UnsignedByteType,
      UVMapping,
      ClampToEdgeWrapping,
      ClampToEdgeWrapping,
      isNearest ? NearestFilter : LinearFilter,
      isNearest ? NearestFilter : LinearFilter,
      0,
    );
    tex.needsUpdate = true;
    return tex;
  }

  /** Source (pretty 13267-13276): resolve an MSAA RT's samples down before sampling it. */
  clearMultisampleRenderTargetState(rt?: WebGLRenderTarget | null): void {
    rt = rt || (this.renderer.getRenderTarget() as WebGLRenderTarget | null);
    if (rt && rt.samples > 0) {
      const rtProps = this.renderer.properties.get(rt) as {
        __webglMultisampledFramebuffer: WebGLFramebuffer;
        __webglFramebuffer: WebGLFramebuffer;
      };
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rtProps.__webglMultisampledFramebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rtProps.__webglFramebuffer);
      const w = rt.width;
      const h = rt.height;
      let mask = gl.COLOR_BUFFER_BIT;
      if (rt.depthBuffer) mask |= gl.DEPTH_BUFFER_BIT;
      if (rt.stencilBuffer) mask |= gl.STENCIL_BUFFER_BIT;
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, mask, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, rtProps.__webglMultisampledFramebuffer);
    }
  }

  createRenderTarget(
    width: number,
    height: number,
    isNearest = false,
    isFloat: boolean | TextureDataType = false,
    samples = 0,
    count = 1,
  ): WebGLRenderTarget {
    return new WebGLRenderTarget(width, height, {
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      magFilter: isNearest ? NearestFilter : LinearFilter,
      minFilter: isNearest ? NearestFilter : LinearFilter,
      type: isFloat === true ? this.floatType : isFloat || UnsignedByteType,
      anisotropy: 0,
      depthBuffer: false,
      stencilBuffer: false,
      samples: browser.isSupportMSAA ? samples : 0,
      count,
    });
  }
}

export const fboHelper = new FboHelper();
export type { ColorState };