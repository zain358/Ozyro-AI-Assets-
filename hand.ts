import {
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { BufferGeometry, DataTexture, Texture } from 'three';
import { blueNoise } from '../core/blueNoise';
import { cameraControls } from '../core/cameraControls';
import { fboHelper } from '../core/fboHelper';
import { input } from '../core/input';
import { loader } from '../core/Loader';
import { clamp, fit } from '../core/math';
import { ease } from '../core/ease';
import { properties } from '../core/properties';
import { SecondOrderDynamicsScalar } from '../core/SecondOrderDynamics';
import * as settings from '../core/settings';
import { handFrag, handVert } from '../glsl';
import { postprocessing } from '../post/postprocessing';
import { TAAMesh } from '../post/TAAMesh';
import { bg } from './bg';
import { coaster } from './coaster';

const _v0 = new Vector3();
const _v1 = new Vector3();
const _q0 = new Quaternion();
const _q1 = new Quaternion();
const _m0 = new Matrix4();
const _m1 = new Matrix4();
// Source ROOT matrix (fromArray + transpose = row-major literal).
const ROOT = new Matrix4()
  .fromArray([
    1.08842, 0, -0.159194, 0, 19082e-22, 1.1, 763278e-23, 0, 0.159194, 0, 1.08842, 0,
    -0.00995603, 0.524108, -0.0576238, 1,
  ])
  .transpose();
const ROOT_INV = new Matrix4().copy(ROOT).invert();
const FINGER_ANGLES = [0.1, 0.25, 0.25, 0.3];
const FINGER_DYNAMICS: SecondOrderDynamicsScalar[] = [];

interface BoneNode extends Object3D {
  index?: number;
  targetId?: number;
  defaultWorldMatrix?: Matrix4;
  defaultWorldMatrixInverse?: Matrix4;
}

class Hand {
  container = new Object3D();
  animationRatio = 0;
  fingersActiveRatio = 0;
  frameCount = 0;
  boneCount = 36;
  textureWidth = 0;
  textureHeight = 0;
  sceneObject: Object3D | null = null;
  fingerWeights = [0, 0, 0, 0];
  opacity = 1;
  highlightRatio = 0;
  handGeometry: BufferGeometry | null = null;
  handMesh: Mesh | null = null;
  private positions!: ArrayLike<number>;
  private orients!: ArrayLike<number>;
  private positionDataArray!: Float32Array;
  private orientDataArray!: Float32Array;
  private skinPositionTexture!: DataTexture;
  private skinOrientTexture!: DataTexture;
  uniforms = {
    u_animationRatio: { value: 0 },
    u_skinPositionTexture: { value: null as DataTexture | null },
    u_skinOrientTexture: { value: null as DataTexture | null },
    u_skinTextureSize: { value: new Vector2() },
    u_uvOffset1: { value: new Vector2() },
    u_uvOffset2: { value: new Vector2() },
    u_uvBlend: { value: 0 },
    u_handTexture: { value: null as Texture | null },
    u_rimColor: bg.sharedUniforms.u_bgColor1,
    u_resolution: properties.sharedUniforms.u_resolution,
    u_fingerWeights: { value: this.fingerWeights },
    u_haloLightStrength: { value: 0 },
    u_opacity: { value: 1 },
    u_highlightRatio: { value: 0 },
  };

  preInit(): void {
    loader.add(settings.MODEL_PATH + 'hand.buf', {
      onLoad: (content) => {
        this.handGeometry = content as BufferGeometry;
      },
    });
    loader.add(settings.MODEL_PATH + 'hand_animation.buf', {
      onLoad: this._onAnimationLoad.bind(this),
    });
    this.uniforms.u_handTexture.value = loader.add(settings.TEXTURE_PATH + 'hero/AI_HAND.webp', {
      type: 'texture',
      colorSpace: SRGBColorSpace,
      autoMobile: true,
    }).content as Texture;
    for (let i = 0; i < 4; i++) FINGER_DYNAMICS[i] = new SecondOrderDynamicsScalar(0, 1.5, 0.5, 3);
  }

  private _onAnimationLoad(content: unknown): void {
    const geometry = content as BufferGeometry;
    this.positions = geometry.getAttribute('position').array;
    this.orients = geometry.getAttribute('orient').array;
    this.frameCount = this.positions.length / this.boneCount / 3;
    this.textureWidth = this.boneCount;
    this.textureHeight = 1;
    this.positionDataArray = new Float32Array(this.textureWidth * this.textureHeight * 4);
    this.orientDataArray = new Float32Array(this.textureWidth * this.textureHeight * 4);
    this.skinPositionTexture = this.uniforms.u_skinPositionTexture.value = fboHelper.createDataTexture(
      this.positionDataArray,
      this.textureWidth,
      this.textureHeight,
      true,
      true,
    );
    this.skinOrientTexture = this.uniforms.u_skinOrientTexture.value = fboHelper.createDataTexture(
      this.orientDataArray,
      this.textureWidth,
      this.textureHeight,
      true,
      true,
    );
    this.uniforms.u_skinTextureSize.value.set(this.textureWidth, this.textureHeight);
    const root = (this.sceneObject = geometry.userData.sceneObject as Object3D);
    root.children[0].removeFromParent();
    root.updateMatrixWorld(true);
    for (let i = 0; i < root.children.length; i++) {
      (root.children[i] as BoneNode).index = i;
    }
    root.traverse((node) => {
      const bone = node as BoneNode;
      bone.defaultWorldMatrix = bone.matrixWorld.clone();
      bone.defaultWorldMatrixInverse = bone.matrixWorld.clone().invert();
      bone.targetId = parseInt(bone.name, 10);
      if (bone.parent && bone.parent !== root) bone.index = (bone.parent as BoneNode).index;
    });
  }

  init(): void {
    this.handMesh = new TAAMesh(
      this.handGeometry!,
      new ShaderMaterial({
        vertexShader: handVert,
        fragmentShader: handFrag,
        uniforms: Object.assign(
          {
            u_lmsTexture: { value: postprocessing.appleEfx.lmsTexture },
            u_time: properties.sharedUniforms.u_time,
          },
          this.uniforms,
          blueNoise.shaderUniforms,
          bg.sharedUniforms,
        ),
      }),
    );
    this.handMesh.frustumCulled = false;
    this.container.add(this.handMesh);
  }

  resize(): void {}

  preUpdate(): void {}

  update(dt: number): void {
    if (!this.handMesh) return;
    const isVisible = this.animationRatio > 0;
    this.container.visible = isVisible;
    if (!isVisible) return;
    const frame = this.animationRatio * (this.frameCount - 1);
    const frameA = Math.floor(frame);
    const frameB = Math.min(frameA + 1, this.frameCount - 1);
    const frameT = frame - frameA;
    const atlasPos = fit(frame, 20, 40, 0, 2, ease.cubicOut.bind(ease));
    let atlasFrom = Math.floor(atlasPos);
    let atlasTo = Math.ceil(atlasPos);
    let atlasBlend = atlasPos - atlasFrom;
    if (this.fingersActiveRatio > 0) {
      atlasFrom = 2;
      atlasTo = 3;
      atlasBlend = 0;
    }
    this.uniforms.u_uvOffset1.value.set((atlasFrom % 2) / 2, (atlasFrom >> 1) / 2);
    this.uniforms.u_uvOffset2.value.set((atlasTo % 2) / 2, (atlasTo >> 1) / 2);
    this.uniforms.u_uvBlend.value = atlasBlend;
    this.handMesh.visible = this.animationRatio > 0;
    this.uniforms.u_animationRatio.value = this.animationRatio;
    this.uniforms.u_haloLightStrength.value = coaster.haloRatio;
    this.uniforms.u_opacity.value = this.opacity;
    this.uniforms.u_highlightRatio.value = this.highlightRatio;
    for (let i = 0; i < 4; i++) {
      // Source pretty 19892: device-orientation virtual mouse drives fingers
      // on mobile, pointer position on desktop.
      let target: number;
      if (cameraControls.isDeviceReady) {
        target =
          1
          - Math.abs(
            fit(clamp(cameraControls.deviceVirtualMouseXY.length(), 0, 1) - i * 0.2, 0, 0.6, 0, 1)
              - 0.5,
          )
            * 2;
      } else {
        target = 1 - Math.abs(fit(input.mouseXY.y, -0.2 - i * 0.1, -0.7 - i * 0.1, 0, 1) - 0.5) * 2;
        target *= fit(Math.abs(input.mouseXY.x), 0.2, 0.3, 1, 0);
      }
      FINGER_DYNAMICS[i].update(dt, target);
      this.fingerWeights[i] = FINGER_DYNAMICS[i].value * this.fingersActiveRatio;
    }
    for (let bone = 0, out = 0; bone < this.boneCount; bone++, out += 4) {
      let idxA = frameA * this.boneCount * 3 + bone * 3;
      let idxB = frameB * this.boneCount * 3 + bone * 3;
      _v0.set(this.positions[idxA + 0], this.positions[idxA + 1], this.positions[idxA + 2]);
      _v1.set(this.positions[idxB + 0], this.positions[idxB + 1], this.positions[idxB + 2]);
      _v0.lerp(_v1, frameT);
      this.positionDataArray[out + 0] = _v0.x;
      this.positionDataArray[out + 1] = _v0.y;
      this.positionDataArray[out + 2] = _v0.z;
      this.positionDataArray[out + 3] = 1;
      idxA = frameA * this.boneCount * 4 + bone * 4;
      idxB = frameB * this.boneCount * 4 + bone * 4;
      _q0.set(this.orients[idxA + 0], this.orients[idxA + 1], this.orients[idxA + 2], this.orients[idxA + 3]);
      _q1.set(this.orients[idxB + 0], this.orients[idxB + 1], this.orients[idxB + 2], this.orients[idxB + 3]);
      _q0.slerp(_q1, frameT);
      this.orientDataArray[out + 0] = _q0.x;
      this.orientDataArray[out + 1] = _q0.y;
      this.orientDataArray[out + 2] = _q0.z;
      this.orientDataArray[out + 3] = _q0.w;
    }
    const root = this.sceneObject!;
    root.traverse((node) => {
      const bone = node as BoneNode;
      if (!bone.parent) return;
      const isTopLevel = bone.parent === root;
      _v0.fromArray(this.positionDataArray, bone.targetId! * 4);
      _q0.fromArray(this.orientDataArray, bone.targetId! * 4);
      _v1.set(1, 1, 1);
      bone.matrixWorld.compose(_v0, _q0, _v1).premultiply(ROOT_INV).multiply(bone.defaultWorldMatrix!);
      if (isTopLevel) {
        const parentIdx = (bone.userData.parentIdx as { value: number }).value;
        _v0.fromArray(this.positionDataArray, parentIdx * 4);
        _q0.fromArray(this.orientDataArray, parentIdx * 4);
        _m1
          .compose(_v0, _q0, _v1)
          .premultiply(ROOT_INV)
          .multiply(_m0.fromArray((bone.userData.parentMatrix as { value: number[] }).value))
          .invert();
      } else {
        _m1.copy((bone.parent as BoneNode).matrixWorld).invert();
      }
      bone.matrix.multiplyMatrices(_m1, bone.matrixWorld).decompose(bone.position, bone.quaternion, _v1);
    });
    root.traverse((node) => {
      const bone = node as BoneNode;
      if (!bone.parent) return;
      const isTopLevel = bone.parent === root;
      ROOT_INV.decompose(_v0, _q1, _v1);
      if (bone.children.length > 0) {
        const weight = this.fingerWeights[bone.index!];
        if (weight && this.animationRatio === 1) {
          const angle = weight * FINGER_ANGLES[bone.index!];
          _q0.setFromAxisAngle(_v0.set(1, 0, 0), angle);
          bone.quaternion.premultiply(_q0);
        }
      }
      bone.matrix.compose(bone.position, bone.quaternion, _v0.set(1, 1, 1));
      if (isTopLevel) {
        const parentIdx = (bone.userData.parentIdx as { value: number }).value;
        _v0.fromArray(this.positionDataArray, parentIdx * 4);
        _q0.fromArray(this.orientDataArray, parentIdx * 4);
        _m1
          .compose(_v0, _q0, _v1)
          .premultiply(ROOT_INV)
          .multiply(_m0.fromArray((bone.userData.parentMatrix as { value: number[] }).value));
        bone.matrixWorld.multiplyMatrices(_m1, bone.matrix);
      } else {
        bone.matrixWorld.multiplyMatrices((bone.parent as BoneNode).matrixWorld, bone.matrix);
      }
      _m0.copy(bone.matrixWorld).multiply(bone.defaultWorldMatrixInverse!).premultiply(ROOT).decompose(_v0, _q0, _v1);
      _v0.toArray(this.positionDataArray, bone.targetId! * 4);
      _q0.toArray(this.orientDataArray, bone.targetId! * 4);
    });
    this.skinPositionTexture.needsUpdate = true;
    this.skinOrientTexture.needsUpdate = true;
  }
}

export const hand = new Hand();
export { clamp as _handClamp };
