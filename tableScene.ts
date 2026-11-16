
import { Euler, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3, Vector4 } from 'three';
import { MinSignal } from '../core/MinSignal';
import { cameraControls } from '../core/cameraControls';
import { ease } from '../core/ease';
import { fit, mix } from '../core/math';
import { loader } from '../core/Loader';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { textureHelper } from '../core/textureHelper';
import { FrameAnimation } from '../FrameAnimation';
import { postprocessing } from '../post/postprocessing';
import { PostProfile } from '../post/PostProfile';
import { Splats } from '../Splats';
import { bg } from './bg';
import { coaster } from './coaster';
import { gobo } from './gobo';
import { tableBase } from './tableBase';
import { tableCoffee } from './tableCoffee';
import { tableGrip } from './tableGrip';
import { thermodynamicOverlay } from './thermodynamicOverlay';
import { WEARABLE_GALLERY_INNER_ROTATION, WEARABLE_GALLERY_INNER_SCALE } from './wearableConstants';
import { wearableScene } from './wearableScene';

const _v0 = new Vector3();
const _v1 = new Vector3();
const _e = new Euler();
const _q = new Quaternion();
const _m = new Matrix4();
const _goboMatrix = new Matrix4();
let _wasFlipped: boolean | undefined;
const POST_PROFILE = new PostProfile({});

type ClippableMesh = { needsClipping?: boolean };

export class TableScene {
  container = new Object3D();
  tableContainer = new Object3D();
  animation = 0;
  prevAnimation = 0;
  keyframe = 0;
  clipScissor = new Vector4();
  fromViewOffsetX = 0;
  fromViewOffsetY = 0;
  toViewOffsetX = 0;
  toViewOffsetY = 0;
  cameraAnimation = new FrameAnimation();
  coasterAnimation = new FrameAnimation();
  coffeeAnimation = new FrameAnimation();
  coasterFlipAnimation = new FrameAnimation();
  encryptionCameraZoom = 1;
  splats: Splats | null = null;
  sharedUniforms = {
    u_envTableTexture: { value: null as unknown },
    u_envGripTexture: { value: null as unknown },
  };
  coasterLightPosition1 = new Vector3(0.346682, 1.00875, 0.168255);
  coasterLightPosition2 = new Vector3(0.346682, 0.13, 0.168255);
  isFlipped = true;
  flipAnimation = 0;
  isFlipReset = true;
  randomFlipAngle = Math.random() * Math.PI * 2;
  onFlipped = new MinSignal<boolean>();

  preInit(): void {
    this.container = new Object3D();
    this.tableContainer = new Object3D();
    this.container.add(this.tableContainer);
    this.container.visible = false;
    tableBase.preInit();
    this.tableContainer.add(tableBase.container);
    tableCoffee.preInit();
    this.tableContainer.add(tableCoffee.container);
    tableGrip.preInit();
    this.container.add(tableGrip.container);
    thermodynamicOverlay.preInit();
    this.tableContainer.add(thermodynamicOverlay.container);
    this.cameraAnimation.preInit(
      cameraControls as never,
      settings.MODEL_PATH + 'featuresAnimations/CAMERA_ANIM.buf',
    );
    this.coasterAnimation.preInit(
      coaster.container,
      settings.MODEL_PATH + 'featuresAnimations/COASTER_ANIM.buf',
    );
    this.coffeeAnimation.preInit(
      tableCoffee.container,
      settings.MODEL_PATH + 'featuresAnimations/COFFEE_ANIM.buf',
    );
    this.coasterFlipAnimation.preInit(
      coaster.innerContainer,
      settings.MODEL_PATH + 'COASTER_FLIP_ANIM.buf',
    );
    this.sharedUniforms.u_envTableTexture.value = textureHelper.loadRGBMTexture(
      settings.TEXTURE_PATH + 'table/env_table.webp',
      { maxRange: 20 },
    );
    this.sharedUniforms.u_envGripTexture.value = textureHelper.loadRGBMTexture(
      settings.TEXTURE_PATH + 'table/env_grip.webp',
      { maxRange: 20 },
    );
    const goboCamera = new PerspectiveCamera(60, 1, 0.01, 20);
    goboCamera.position.set(-0.603634, 0.514833, 0.953714);
    goboCamera.quaternion.set(-0.191836, 0.0352637, 0.391623, 0.899215);
    goboCamera.updateMatrix();
    goboCamera.updateMatrixWorld();
    _goboMatrix.multiplyMatrices(goboCamera.projectionMatrix, goboCamera.matrixWorldInverse);
  }

  init(): void {
    this.splats = new Splats('/splats/props.sog', {
      preload: false,
      onLoad: () => {
        this.splats!.mesh!.renderOrder = -2;
        cameraControls.initClippingMesh(this.splats!.mesh as never);
      },
    });
    this.tableContainer.add(this.splats);
    tableBase.init();
    tableCoffee.init();
    tableGrip.init();
    thermodynamicOverlay.init();
  }

  resize(width: number, height: number): void {
    tableBase.resize(width, height);
    tableCoffee.resize();
    tableGrip.resize(width, height);
    thermodynamicOverlay.resize();
  }

  preUpdate(dt: number): void {
    const t = this.animation;
    const isActive = t > 0 && t < 10 && !(t >= 6 && t < 6.75);
    bg.opacity = fit(t, 3.5, 4, bg.opacity, 0);
    if (t > 5.5) {
      bg.opacity = fit(t, 5.5, 6, bg.opacity, 1);
      bg.opacity = fit(t, 6.75, 7, bg.opacity, 0, ease.cubicOut);
      bg.renderOrder = 1;
    }
    if (isActive) {
      tableGrip.showRatio = fit(t, 8.5, 9, 0, 1);
      tableGrip.hideRatio = fit(t, 9, 10, 0, 1);
      tableGrip.preUpdate(dt);
    }
    const tableVisible = isActive && (tableGrip.showRatio < 1 || tableGrip.hideRatio === 1);
    const thermalShow = fit(t, 4.5, 4.6, 0, 1);
    const thermalHide = fit(t, 5.4, 5.5, 0, 1);
    thermodynamicOverlay.showRatio = thermalShow;
    thermodynamicOverlay.hideRatio = thermalHide;
    const thermalRatio = thermalShow * (1 - thermalHide);
    const encryptionPulse = fit(t, 5.5, 6, 0, 1) * fit(t, 6, 6.5, 1, 0);
    POST_PROFILE.bloomAmount = fit(t, 2, 3, 1, 0);
    POST_PROFILE.bloomSelectiveStrength = fit(t, 2, 3, 2, 0);
    POST_PROFILE.bloomSaturation = fit(t, 2, 3, 2, 1);
    POST_PROFILE.bloomAmount = fit(thermalRatio, 0, 1, POST_PROFILE.bloomAmount, 2);
    POST_PROFILE.bloomSelectiveStrength = fit(
      thermalRatio,
      0,
      1,
      POST_PROFILE.bloomSelectiveStrength,
      1,
    );
    POST_PROFILE.bloomSaturation = fit(thermalRatio, 0, 1, POST_PROFILE.bloomSaturation, 1.45);
    POST_PROFILE.bloomAmount = fit(encryptionPulse, 0, 1, POST_PROFILE.bloomAmount, 5);
    POST_PROFILE.bloomSelectiveStrength = fit(
      encryptionPulse,
      0,
      1,
      POST_PROFILE.bloomSelectiveStrength,
      1,
    );
    POST_PROFILE.bloomSaturation = fit(encryptionPulse, 0, 1, POST_PROFILE.bloomSaturation, 1.45);
    postprocessing.blendProfile(POST_PROFILE, fit(t, 0, 1, 0, 1));
    if (!tableVisible) return;
    gobo.setTexture('gobo_b');
    gobo.setMatrix(_goboMatrix, 0.817675, 1.42218);
    gobo.opacity = 1;
    coaster.envBlendRatio = 0;
    let frame = fit(t, 1.5, 3, 0, 44);
    frame = fit(t, 3, 4, frame, 89);
    frame = fit(t, 5, 5.5, frame, 209);
    tableCoffee.shadowStrength = fit(frame, 68, 80, 0, 1);
    tableCoffee.alphaMultiplier = fit(frame, 30, 60, 0.1, 1);
    coaster.coffeeShadowStrength = fit(frame, 45, 80, 0, 1) * fit(frame, 181, 187, 1, 0);
    tableBase.preUpdate(dt);
    tableCoffee.preUpdate(dt);
    if (t >= 6.5) {
      frame = fit(t, 7.5, 8, 239, 269);
      frame = fit(t, 8, 8.5, frame, 319);
      cameraControls.zoom = fit(t, 8, 8.5, this.encryptionCameraZoom, 0.8);
      cameraControls.zoom = fit(t, 8.5, 9, cameraControls.zoom, 1);
    } else {
      cameraControls.zoom = fit(t, 5, 5.5, cameraControls.zoom, 1);
    }
    if (t > 0) {
      coaster.isActive = true;
      this.cameraAnimation.applyTransform(frame);
      this.coasterAnimation.applyTransform(frame);
      this.coffeeAnimation.applyTransform(frame);
      if (t < 1) {
        const enter = fit(t, 0.1, 0.9, 0, 1, ease.sineInOut);
        cameraControls.zoom =
          fit(enter, 0, 1, WEARABLE_GALLERY_INNER_SCALE, 1) * wearableScene.frameZoom;
        _q.setFromEuler(_e.set(0, 0, -WEARABLE_GALLERY_INNER_ROTATION * (1 - enter)));
        cameraControls.quaternion.multiply(_q);
      }
    }
    tableCoffee.cupTime = fit(frame, 45, 87, 0, 1);
    tableCoffee.isActive = frame < 195;
    tableBase.hdTextureShift = fit(t, 8.5, 8.55, 0, 1);
    let lookStrength = properties.cameraLookStrength;
    lookStrength = fit(t, 2, 3, lookStrength, 0.05);
    lookStrength = fit(t, 6.5, 6.75, lookStrength, 0);
    lookStrength = fit(t, 7, 7.5, lookStrength, 0.05);
    properties.cameraLookStrength = fit(t, 8, 8.5, lookStrength, 0);
    const focusDistance = _v0
      .set(0, 0, -1)
      .applyQuaternion(cameraControls.quaternion)
      .dot(_v1.copy(coaster.container.position).sub(cameraControls.position));
    properties.cameraDistance = fit(t, 0, 1, properties.cameraDistance, focusDistance);
    const viewportWidth = properties.viewportWidth;
    const viewportHeight = properties.viewportHeight;
    coaster.envTexture1Uniform = this.sharedUniforms.u_envTableTexture as never;
    coaster.envTexture2Uniform = this.sharedUniforms.u_envGripTexture as never;
    coaster.envBlendRatio = fit(t, 8, 8.5, 0, 1);
    const offsetBlend = fit(t, 3, 3.5, 0, 1);
    const mobileOffsetY = properties.useMobileLayout
      ? fit(t, 1, 3, 0, 1) * fit(t, 5, 5.5, 1, 0) * -0.05
      : 0;
    cameraControls.viewOffsetX = mix(this.fromViewOffsetX, this.toViewOffsetX, offsetBlend);
    cameraControls.viewOffsetY =
      mix(this.fromViewOffsetY, this.toViewOffsetY, offsetBlend) + mobileOffsetY;
    if (t > 6) cameraControls.viewOffsetX = 0;
    if (t < 4) {
      cameraControls.needsClipping = true;
      if (this.splats && this.splats.mesh) this.splats.mesh.needsClipping = true;
      for (let i = 0; i < tableBase.container.children.length; i++) {
        (tableBase.container.children[i] as ClippableMesh).needsClipping = true;
      }
      for (let i = 0; i < tableCoffee.container.children.length; i++) {
        (tableCoffee.container.children[i] as ClippableMesh).needsClipping = true;
      }
      (coaster.mesh as ClippableMesh).needsClipping = true;
      let scissorX = this.clipScissor.x;
      let scissorY = this.clipScissor.y;
      let scissorW = this.clipScissor.width;
      const scissorH = this.clipScissor.height;
      scissorX = scissorX + mix(0, this.toViewOffsetX * viewportWidth, offsetBlend);
      scissorY = scissorY + mix(0, this.toViewOffsetY * viewportHeight, offsetBlend);
      scissorW = Math.max(1, scissorW);
      const maxX = Math.max(
        Math.abs(viewportWidth - scissorX),
        viewportWidth - Math.abs(viewportWidth - scissorX),
      );
      const maxY = Math.max(
        Math.abs(viewportHeight - scissorY),
        viewportHeight - Math.abs(viewportHeight - scissorY),
      );
      let grow = Math.max(maxX / Math.max(1, scissorW), maxY / scissorH) * 2;
      grow = fit(offsetBlend, 0, 1, 1, grow);
      const scaleX = properties.width / viewportWidth;
      const scaleY = properties.height / viewportHeight;
      scissorX = (scissorX - (scissorW / 2) * grow) * scaleX;
      scissorY = (scissorY - (scissorH / 2) * grow) * scaleY;
      scissorW = scissorW * scaleX * grow;
      const scaledH = scissorH * scaleY * grow;
      cameraControls.clipScissor.set(
        scissorX,
        properties.height - (scissorY + scaledH),
        scissorW,
        scaledH,
      );
    }
    coaster.lightPosition.lerp(this.coasterLightPosition1, t > 0 ? 1 : 0);
    coaster.lightPosition.lerp(this.coasterLightPosition2, fit(t, 8.25, 8.5, 0, 1));
  }

  flipCoaster(): void {
    if (this.canFlip) this.isFlipped = !this.isFlipped;
  }

  updateMsdfMessage(message: string): void {
    coaster.updateEncryptionText(message);
  }

  get _isCurrFlipped(): boolean {
    return this.flipAnimation === 0 || this.flipAnimation > 1;
  }

  get canFlip(): boolean {
    return this.animation < 8.1;
  }

  update(dt: number): void {
    const t = this.animation;
    const isActive = t > 0 && t < 10 && !(t >= 6 && t < 6.75);
    this.container.visible = isActive;
    coaster.isFeatureEncryptionSectionActive = isActive;
    coaster.featureSectionRatio = fit(t, 3, 6, 0, 1);
    coaster.encryptionSectionTopToFrontRatio = fit(t, 6.75, 8, 0, 1);
    coaster.encryptionSectionZoomRatio = fit(t, 8, 9, 0, 1);
    const prevFlip = this.flipAnimation;
    let flip = this.flipAnimation;
    const flipSpeed = 1.25;
    if (t < 6.75) {
      this.isFlipped = true;
      this.flipAnimation = 0;
      this.isFlipReset = true;
    } else if (t < 7.5 && this.isFlipped && this.prevAnimation > t) {
      this.isFlipped = false;
    } else if (t >= 8.5) {
      this.isFlipped = false;
      this.flipAnimation = 1;
    } else {
      if (this.isFlipReset && t >= 7.75) {
        this.isFlipped = false;
        this.isFlipReset = false;
      }
      if (t > 8.1) this.isFlipped = false;
      if (this.isFlipped !== this._isCurrFlipped || flip % 1 !== 0) {
        if (prevFlip === 1) this.randomFlipAngle = Math.random() * Math.PI * 2;
        flip += Math.min(0.999, dt * flipSpeed * fit(t, 8.1, 8.5, 1, 4));
        if (~~flip !== ~~prevFlip) flip = ~~flip % 2;
      }
      this.flipAnimation = flip;
    }
    const tableVisible = isActive && (tableGrip.showRatio < 1 || tableGrip.hideRatio === 1);
    this.tableContainer.visible = tableVisible;
    if (tableVisible) {
      if (this.splats) {
        this.splats.parent!.parent!.parent!.updateMatrixWorld(true);
        this.splats.update(dt);
      }
      if (t >= 6.75) {
        let flipFrame = fit(flip, 0, 1, 31, 63);
        if (flip > 1) flipFrame = fit(flip, 1, 2, 0, 31);
        this.coasterFlipAnimation.applyTransform(flipFrame);
        _m.makeRotationY(this.randomFlipAngle);
        coaster.innerContainer.updateMatrix();
        coaster.innerContainer.matrix.premultiply(_m);
        _m.invert();
        coaster.innerContainer.matrix.multiply(_m);
        coaster.innerContainer.matrix.decompose(
          coaster.innerContainer.position,
          coaster.innerContainer.quaternion,
          coaster.innerContainer.scale,
        );
        const flipRot = -this.randomFlipAngle * 2 + Math.PI / 2;
        const s = Math.sin(flipRot);
        const c = Math.cos(flipRot);
        (coaster.sharedUniforms.u_randomFlipRot.value as { set(a: number, b: number, cc: number, d: number): void }).set(
          c,
          s,
          -s,
          c,
        );
      }
      tableBase.update(dt);
      tableCoffee.ratio = 0;
      tableCoffee.update(dt);
      thermodynamicOverlay.update(dt);
    }
    tableGrip.update(dt);
    this.prevAnimation = t;
    if (_wasFlipped !== this.isFlipped) {
      this.onFlipped.dispatch(this.isFlipped);
      _wasFlipped = this.isFlipped;
    }
  }

  postUpdate(dt: number): void {
    tableBase.postUpdate(dt);
    tableCoffee.postUpdate(dt);
  }
}

export const tableScene = new TableScene();