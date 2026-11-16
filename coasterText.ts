import { MSDFTextGeometry } from 'three-msdf-text-utils';
import { Color, Mesh, OrthographicCamera, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { Texture, WebGLRenderTarget } from 'three';
import { fboHelper } from '../core/fboHelper';
import { loader } from '../core/Loader';
import { coasterTextFrag, coasterTextVert } from '../glsl';

const clearColor = new Color('#000000');
const ASPECT_RATIO = 8;
const RT_WIDTH = 1024;
const RT_HEIGHT = Math.floor(RT_WIDTH / ASPECT_RATIO);
const ZOOM_RATIO = 5.5;

class CoasterText {
  text = '';
  camera2D = new OrthographicCamera(-RT_WIDTH, RT_WIDTH, -RT_HEIGHT, RT_HEIGHT, 0.1, 2);
  rt!: WebGLRenderTarget;
  fontData: { content: unknown } | null = null;
  fontTexture: Texture | null = null;
  msdfGeometry!: MSDFTextGeometry;
  msdfMaterial!: ShaderMaterial;
  msdfMesh: Mesh | null = null;
  sharedUniforms = {
    u_resolution: { value: new Vector2(RT_WIDTH, RT_HEIGHT) },
    u_map: { value: null as Texture | null },
  };

  constructor() {
    this.camera2D.position.z = 2;
    this.camera2D.zoom = ZOOM_RATIO;
    this.camera2D.updateProjectionMatrix();
  }

  preInit(): void {
    this.rt = fboHelper.createRenderTarget(RT_WIDTH, RT_HEIGHT, false, false);
    this.fontData = loader.add('/fonts/msdf/Inter.json', { type: 'json' });
    this.fontTexture = loader.add('/fonts/msdf/Inter.webp', { type: 'texture' })
      .content as Texture;
  }

  init(): void {
    this.msdfGeometry = new MSDFTextGeometry({
      font: this.fontData!.content,
      text: this.text,
      letterSpacing: -0.25,
    });
    this.msdfMaterial = new ShaderMaterial({
      vertexShader: coasterTextVert,
      fragmentShader: coasterTextFrag,
      uniforms: {
        uOpacity: { value: 1 },
        uColor: { value: new Color('#ffffff') },
        uMap: { value: this.fontTexture },
        uThreshold: { value: 0.2 },
        uAlphaTest: { value: 0.1 },
        uStrokeColor: { value: new Color('#FFF') },
        uStrokeOutsetWidth: { value: 0 },
        uStrokeInsetWidth: { value: 0.3 },
        u_resolution: this.sharedUniforms.u_resolution,
      },
      side: 2,
      transparent: true,
      defines: { IS_SMALL: false },
    });
    this.msdfMesh = new Mesh(this.msdfGeometry, this.msdfMaterial);
    this.msdfMesh.frustumCulled = false;
    this.updateText(this.text);
  }

  updateText(text: string): void {
    this.text = text;
    if (!this.msdfMesh) return;
    this.msdfGeometry.update({ text: this.text });
    this.msdfGeometry.computeBoundingBox();
    const center = new Vector3();
    this.msdfGeometry.boundingBox!.getCenter(center);
    this.msdfMesh.position.set(-center.x, -center.y, 1);
    fboHelper.renderer.getClearColor(clearColor);
    fboHelper.renderer.setClearColor('#000000');
    fboHelper.renderer.setRenderTarget(this.rt);
    fboHelper.renderer.clear();
    fboHelper.renderMesh(this.msdfMesh, this.rt, this.camera2D);
    fboHelper.renderer.setClearColor(clearColor);
    this.sharedUniforms.u_map.value = this.rt.texture;
  }
}

export const coasterText = new CoasterText();