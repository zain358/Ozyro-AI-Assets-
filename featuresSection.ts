import { SplitText } from 'gsap/SplitText';
import { Color, Vector4 } from 'three';
import { ease } from '../core/ease';
import { clamp, fit, hash, loop, mix } from '../core/math';
import { input } from '../core/input';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { siteFooter } from '../SiteFooter';
import { siteHeader } from '../SiteHeader';
import * as settings from '../core/settings';
import { sketches } from '../scenes/sketches';
import { tableScene } from '../scenes/tableScene';
import { blurBox } from '../post/BlurBox';

// ---------------------------------------------------- features curve canvas

let _canvas: HTMLCanvasElement;
let _ctx: CanvasRenderingContext2D;
const CIRCLE_BEZIER_OFFSET = ((Math.sqrt(2) - 1) * 4) / 3;
const COASTER_INNER_RADIUS_SCALE = 0.8;
const LOGO_O_INNER_RADIUS_SCALE = 96 / 174;
const LOGO_REF_WIDTH = 1804;
const LOGO_REF_HEIGHT = 388;
let _canvasWidth = 0;
let _canvasHeight = 0;
let _coasterDefaultOuterRadius = 0;
let _logoExpandedOuterRadius = 0;
let _gradientCache: HTMLCanvasElement;
let _quarterCircleCanvas: HTMLCanvasElement;
let _quarterCircleCtx: CanvasRenderingContext2D;
let _needsRedrawQuarterCircle = true;
let _logoExpandRatio = 0;
let _logoRatio = 0;
let _arcRatio = 1;
let _viewWidth = 0;
let _controlCircleRadius = 3;
let _controlSquareOuterHalfSize = 4;
let _controlSquareInnerHalfSize = 3;
let _needsReRender = true;

export class FeaturesCurveCanvas {
  showRatio = 0;
  hideRatio = 0;
  expandRatio = 0;

  get logoExpandRatio(): number {
    return _logoExpandRatio;
  }

  set logoExpandRatio(v: number) {
    if (v !== _logoExpandRatio) {
      _logoExpandRatio = v;
      _needsRedrawQuarterCircle = true;
    }
  }

  get logoRatio(): number {
    return _logoRatio;
  }

  set logoRatio(v: number) {
    if (v !== _logoRatio) {
      _logoRatio = v;
      _needsRedrawQuarterCircle = true;
    }
  }

  get arcRatio(): number {
    return _arcRatio;
  }

  set arcRatio(v: number) {
    if (v !== _arcRatio) {
      _arcRatio = v;
      _needsRedrawQuarterCircle = true;
    }
  }

  get viewWidth(): number {
    return _viewWidth;
  }

  set viewWidth(v: number) {
    if (v !== _viewWidth) {
      _viewWidth = v;
      _needsReRender = true;
    }
  }

  init(root: Element): void {
    _canvas = root.querySelector('#features-curve-canvas') as HTMLCanvasElement;
    _ctx = _canvas.getContext('2d') as CanvasRenderingContext2D;
    _quarterCircleCanvas = document.createElement('canvas');
    _quarterCircleCtx = _quarterCircleCanvas.getContext('2d') as CanvasRenderingContext2D;
    _gradientCache = document.createElement('canvas');
    const cacheCtx = _gradientCache.getContext('2d') as CanvasRenderingContext2D;
    _gradientCache.width = 255;
    _gradientCache.height = 255;
    const gradient = cacheCtx.createRadialGradient(127.5, 127.5, 0, 127.5, 127.5, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    cacheCtx.fillStyle = gradient;
    cacheCtx.fillRect(0, 0, 255, 255);
  }

  resize(): void {
    const rect = _canvas.getBoundingClientRect();
    _canvasWidth = rect.width;
    _canvasHeight = rect.height;
    if (properties.useMobileLayout) {
      _controlCircleRadius = 2;
      _controlSquareOuterHalfSize = 2;
      _controlSquareInnerHalfSize = 1;
    } else {
      _controlCircleRadius = 3;
      _controlSquareOuterHalfSize = 4;
      _controlSquareInnerHalfSize = 3;
    }
    _coasterDefaultOuterRadius = _canvasHeight / 5 / 2;
    _logoExpandedOuterRadius =
      (((_canvasWidth - properties.paddingX * 2) / LOGO_REF_WIDTH) * LOGO_REF_HEIGHT) / 2;
    const dpr = settings.DPR;
    _canvas.width = Math.ceil(_canvasWidth * dpr);
    _canvas.height = Math.ceil(_canvasHeight * dpr);
    _quarterCircleCanvas.width = _quarterCircleCanvas.height = Math.ceil(
      Math.ceil(_canvasHeight + _controlSquareOuterHalfSize + 2) * dpr,
    );
    _needsRedrawQuarterCircle = true;
    _needsReRender = true;
  }

  private _drawBezierCurve(
    x0: number,
    y0: number,
    cx0: number,
    cy0: number,
    cx1: number,
    cy1: number,
    x1: number,
    y1: number,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const chord = Math.sqrt(dx * dx + dy * dy);
    const d0x = cx0 - x0;
    const d0y = cy0 - y0;
    const d1x = cx1 - x1;
    const d1y = cy1 - y1;
    const controlNet = Math.sqrt(d0x * d0x + d0y * d0y) + Math.sqrt(d1x * d1x + d1y * d1y);
    const approxLength = chord + controlNet * 0.5;
    _quarterCircleCtx.lineDashOffset = -approxLength / 4 + properties.time;
    _quarterCircleCtx.beginPath();
    _quarterCircleCtx.moveTo(x0, y0);
    _quarterCircleCtx.bezierCurveTo(cx0, cy0, cx1, cy1, x1, y1);
    _quarterCircleCtx.stroke();
  }

  private _drawControlLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    circleRadius: number,
    squareHalfSize: number,
  ): void {
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    _quarterCircleCtx.beginPath();
    _quarterCircleCtx.moveTo(midX, midY);
    _quarterCircleCtx.lineTo(x0, y0);
    _quarterCircleCtx.moveTo(midX, midY);
    _quarterCircleCtx.lineTo(x1, y1);
    _quarterCircleCtx.stroke();
    _quarterCircleCtx.beginPath();
    _quarterCircleCtx.arc(x0, y0, circleRadius, 0, Math.PI * 2);
    _quarterCircleCtx.arc(x1, y1, circleRadius, 0, Math.PI * 2);
    _quarterCircleCtx.rect(midX - squareHalfSize, midY - squareHalfSize, squareHalfSize * 2, squareHalfSize * 2);
    _quarterCircleCtx.fill();
  }

  update(_dt: number): void {
    const opacity = this.showRatio * (1 - this.hideRatio);
    const visible = opacity > 0;
    _canvas.style.visibility = visible ? 'visible' : 'hidden';
    _canvas.style.opacity = String(opacity);
    if (visible && (_needsRedrawQuarterCircle || _needsReRender)) {
      _needsReRender = false;
      const viewportHeight = properties.viewportHeight;
      const outerExpand = fit(this.logoExpandRatio, 0.1, 1, 0, 1, ease.backInOut);
      const innerExpand = fit(this.logoExpandRatio, 0, 0.9, 0, 1, ease.backInOut);
      const logoRatio = ease.expoInOut(this.logoRatio);
      const dpr = settings.DPR;
      _ctx.save();
      _ctx.scale(dpr, dpr);
      _ctx.clearRect(0, 0, _canvasWidth, _canvasHeight);
      _ctx.lineWidth = 1;
      const centerX = properties.useMobileLayout
        ? properties.viewportWidth / 2
        : properties.viewportWidth - this.viewWidth / 2;
      _ctx.translate(centerX, _canvasHeight / 2 - 2);
      _ctx.setLineDash([3, 3]);
      const arc = this.arcRatio;
      const outerRadius = fit(outerExpand, 0, 1, _coasterDefaultOuterRadius, _logoExpandedOuterRadius);
      const innerRadius = fit(
        innerExpand,
        0,
        1,
        _coasterDefaultOuterRadius * COASTER_INNER_RADIUS_SCALE,
        _logoExpandedOuterRadius * LOGO_O_INNER_RADIUS_SCALE,
      );
      if (_needsRedrawQuarterCircle) {
        _needsRedrawQuarterCircle = false;
        _quarterCircleCtx.clearRect(0, 0, _quarterCircleCanvas.width, _quarterCircleCanvas.height);
        _quarterCircleCtx.setLineDash([3, 3]);
        _quarterCircleCtx.save();
        _quarterCircleCtx.scale(dpr, dpr);
        _quarterCircleCtx.strokeStyle = '#fff';
        const outerHandle = outerRadius * CIRCLE_BEZIER_OFFSET * arc;
        const innerHandle = innerRadius * CIRCLE_BEZIER_OFFSET * arc;
        this._drawBezierCurve(outerRadius, 0, outerRadius, outerHandle, outerHandle, outerRadius, 0, outerRadius);
        this._drawBezierCurve(innerRadius, 0, innerRadius, innerHandle, innerHandle, innerRadius, 0, innerRadius);
        _quarterCircleCtx.strokeStyle = '#FF8539';
        _quarterCircleCtx.fillStyle = '#FF8539';
        this._drawControlLine(outerRadius, -outerHandle, outerRadius, outerHandle, _controlCircleRadius, _controlSquareOuterHalfSize);
        this._drawControlLine(outerHandle, outerRadius, -outerHandle, outerRadius, _controlCircleRadius, _controlSquareOuterHalfSize);
        this._drawControlLine(innerRadius, -innerHandle, innerRadius, innerHandle, _controlCircleRadius, _controlSquareInnerHalfSize);
        this._drawControlLine(innerHandle, innerRadius, -innerHandle, innerRadius, _controlCircleRadius, _controlSquareInnerHalfSize);
        _quarterCircleCtx.restore();
      }
      const guide = viewportHeight / 2;
      if (this.logoRatio < 1) {
        _ctx.strokeStyle = '#fff';
        _ctx.beginPath();
        _ctx.moveTo(-outerRadius, -guide);
        _ctx.lineTo(-outerRadius, guide);
        _ctx.moveTo(-innerRadius, -guide);
        _ctx.lineTo(-innerRadius, guide);
        _ctx.moveTo(innerRadius, -guide);
        _ctx.lineTo(innerRadius, guide);
        _ctx.moveTo(outerRadius, -guide);
        _ctx.lineTo(outerRadius, guide);
        _ctx.moveTo(-guide, -outerRadius);
        _ctx.lineTo(guide, -outerRadius);
        _ctx.moveTo(-guide, -innerRadius);
        _ctx.lineTo(guide, -innerRadius);
        _ctx.moveTo(-guide, innerRadius);
        _ctx.lineTo(guide, innerRadius);
        _ctx.moveTo(-guide, outerRadius);
        _ctx.lineTo(guide, outerRadius);
        _ctx.stroke();
        _ctx.globalCompositeOperation = 'source-in';
        _ctx.globalAlpha = 1 - this.logoRatio;
        _ctx.drawImage(_gradientCache, -viewportHeight / 2, -viewportHeight / 2, viewportHeight, viewportHeight);
        _ctx.globalCompositeOperation = 'source-over';
        _ctx.globalAlpha = 1;
      }
      const circleCount = this.logoRatio > 0 ? 2 : 1;
      const spread = fit(logoRatio, 0, 1, 0, this.viewWidth / 2 - outerRadius - properties.paddingX + 2);
      for (let c = 0; c < circleCount; c++) {
        _ctx.save();
        _ctx.globalAlpha = c === 0 ? 1 : this.logoRatio;
        _ctx.translate(spread * (c * 2 - 1), 0);
        for (let q = 0; q < 4; q++) {
          _ctx.save();
          _ctx.rotate((Math.PI / 2) * q);
          _ctx.scale(1 / dpr, 1 / dpr);
          _ctx.drawImage(_quarterCircleCanvas, -0.25, -0.25);
          _ctx.restore();
        }
        _ctx.restore();
      }
      _ctx.restore();
    }
  }
}

export const featuresSectionCurveCanvas = new FeaturesCurveCanvas();

// -------------------------------------------------- features section curve

let _logoEndScale = 1;
let _logoEndOffsetY = 0;
const _logoColor = new Color();
const _logoColorTo = new Color('#4d3e36');
let _sketchTime = 0;
let _sketchShowRatio = 0;
const _sketchOrders = [0, 3, 1, 4, 2, 5];

export class FeaturesSectionCurve {
  domContainer!: Element;
  domLogoWrapper!: Element;
  domLogo!: HTMLElement;
  animation = 0;
  ratio = 0;

  preInit(root: Element): void {
    this.domContainer = root.querySelector('.features-item[data-class="curve"]') as Element;
    this.domLogoWrapper = root.querySelector('#features-circular-logo-wrapper') as Element;
    this.domLogo = root.querySelector('#features-circular-logo') as HTMLElement;
    featuresSectionCurveCanvas.init(root);
  }

  init(): void {}

  resize(): void {
    featuresSectionCurveCanvas.resize();
    const wrapperHeight = this.domLogoWrapper.getBoundingClientRect().height;
    _logoEndScale = (properties.viewportHeight * 0.027) / wrapperHeight;
    _logoEndOffsetY = (5.75 * 1080) / properties.viewportHeight;
  }

  update(dt: number): void {
    const t = this.animation;
    const range = scrollManager.getDomRange(this.domContainer);
    featuresSectionCurveCanvas.showRatio = fit(t, 0, 1, 0, 1);
    featuresSectionCurveCanvas.viewWidth = fit(
      t,
      1,
      1.5,
      properties.viewportWidth - range.width,
      properties.viewportWidth,
    );
    featuresSectionCurveCanvas.expandRatio = fit(t, 1, 2, 0, 0);
    featuresSectionCurveCanvas.logoExpandRatio = fit(t, 1.5, 2.5, 0, 1);
    featuresSectionCurveCanvas.logoRatio = fit(t, 2.25, 3, 0, 1);
    featuresSectionCurveCanvas.hideRatio = fit(t, 3, 3.5, 0, 1);
    featuresSectionCurveCanvas.arcRatio =
      1
      + (Math.sin(properties.time * 5) * 0.5 + 0.5)
        * 0.4
        * fit(t, 0.5, 0.75, 0, 1)
        * fit(t, 1.25, 1.5, 1, 0);
    featuresSectionCurveCanvas.update(dt);
    let logoOpacity = fit(t, 2.5, 3, 0, 0.1);
    logoOpacity = fit(t, 3.5, 4, logoOpacity, 0.3);
    logoOpacity = fit(t, 4, 5, logoOpacity, 0);
    const logoOffsetY = fit(t, 3.75, 4, 0, _logoEndOffsetY - 4, ease.cubicOut);
    const logoScale = fit(t, 3.5, 4, 1, _logoEndScale, ease.cubicOut);
    tableScene.encryptionCameraZoom = logoScale / _logoEndScale;
    _logoColor.setStyle('#ffedd7').lerp(_logoColorTo, fit(t, 3.5, 4, 0, 1));
    this.domLogo.style.opacity = String(logoOpacity);
    this.domLogo.style.transform = `translateY(${logoOffsetY}px) scale(${logoScale})`;
    this.domLogo.style.color = _logoColor.getStyle();
    if (this.animation > 0.75 && this.animation < 2.25) {
      const useMobileLayout = properties.useMobileLayout;
      const cycle = 4;
      _sketchTime += dt;
      _sketchShowRatio = Math.min(_sketchShowRatio + dt * 0.75, 1);
      sketches.isActive = true;
      sketches.offsetX = useMobileLayout
        ? 0
        : -(
            ((properties.viewportWidth - featuresSectionCurveCanvas.viewWidth / 2)
              / properties.viewportWidth)
              * 2
            - 1
          );
      sketches.offsetY = 0;
      const mouseX =
        (properties.viewportWidth / properties.viewportHeight)
        * (input.easedMouseDynamics.default.value as { x: number }).x;
      const mouseY = (input.easedMouseDynamics.default.value as { y: number }).y + sketches.offsetY;
      const radiusScale = useMobileLayout ? 0.5 : 1;
      const sizeScale = useMobileLayout ? 0.6 : 1;
      const exitRatio = fit(this.animation, 2, 2.25, 0, 1);
      const showAlpha = fit(this.animation, 0.75, 1, 0, 1) * (1 - exitRatio);
      const meshes = sketches.list;
      for (let i = 0; i < meshes.length; i++) {
        const itemRatio = i / (meshes.length - 1);
        const itemShow = fit(_sketchShowRatio, itemRatio * 0.15, 0.85 + itemRatio * 0.15, 0, 1);
        const mesh = meshes[i];
        const order = _sketchOrders[i];
        const cycled = loop(_sketchTime + i, 0, meshes.length);
        const angle =
          (order * Math.PI * 2) / meshes.length
          + _sketchTime * 0.2
          - fit(itemShow, 0, 1, 5, 0, ease.expoOut);
        const radius = (0.65 * fit(itemShow, 0, 1, 0.1, 1, ease.backOut) + exitRatio * 0.7) * radiusScale;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const toMouseX = mouseX - x;
        const toMouseY = mouseY - y;
        const mouseDistance = Math.sqrt(toMouseX * toMouseX + toMouseY * toMouseY);
        const repel = fit(mouseDistance, 1.3, 0.3, 0, 1);
        mesh.position.set(x - toMouseX * repel * 0.1, y - toMouseY * repel * 0.1, 0);
        mesh.opacity = fit(Math.abs(cycled - cycle / 2), cycle / 2, 0, 0.05, 0.3) * showAlpha;
        mesh.blur = fit(Math.abs(cycled - cycle / 2), cycle / 2, (cycle / 2) * 0.25, 1, 1 - showAlpha);
        mesh.rotation.z =
          (Math.sin(hash(order + 0.4213) * Math.PI * 2 + _sketchTime * 0.2) - 0.5) * 0
          + repel * toMouseX * 0.1;
        mesh.scale.setScalar(
          (0.3333 * fit(itemShow, 0, 1, 0.1, 1, ease.backOut) + exitRatio * 0.4) * sizeScale,
        );
      }
    } else {
      sketches.isActive = false;
      _sketchShowRatio = 0;
    }
  }
}

export const featuresSectionCurve = new FeaturesSectionCurve();

// --------------------------------------------------------- features section

let _domContainer: HTMLElement;
let _domInner: Element;
let _domItemListWrapper: Element;
let _domItemList: NodeListOf<HTMLElement>;
let _domExtraItemList: NodeListOf<HTMLElement>;
let _domTopList: NodeListOf<HTMLElement>;
let _domIconList: NodeListOf<HTMLElement>;
let _domTaglineList: NodeListOf<HTMLElement & { __splitText?: SplitText }>;
let _domDashlineList: NodeListOf<HTMLElement>;
let _domTitleList: NodeListOf<HTMLElement & { __splitText?: SplitText }>;
let _domDescList: NodeListOf<HTMLElement & { __splitText?: SplitText }>;
const _titleDescRectList: Vector4[] = [];
const _topRectList: Vector4[] = [];
let _temperatureSlider: HTMLElement;

export class FeaturesSection {
  preInit(root: Element): void {
    _domContainer = root.querySelector('#features') as HTMLElement;
    _domInner = _domContainer.querySelector('.section__inner') as Element;
    _domItemListWrapper = _domContainer.querySelector('#features-items') as Element;
    _domItemList = _domContainer.querySelectorAll('.features-item');
    _domExtraItemList = _domContainer.querySelectorAll('.features-extra-item');
    _domTopList = _domContainer.querySelectorAll('.features-item-top');
    _domIconList = _domContainer.querySelectorAll('.features-item-icon');
    _domTaglineList = _domContainer.querySelectorAll('.features-item-tagline');
    _domDashlineList = _domContainer.querySelectorAll('.o-dashline');
    _domTitleList = _domContainer.querySelectorAll('.features-item-title');
    _domDescList = _domContainer.querySelectorAll('.features-item-desc');
    for (let i = 0; i < _domIconList.length; i++) {
      _domTaglineList[i].__splitText = SplitText.create(_domTaglineList[i], {
        type: 'chars',
        autoSplit: false,
      });
      _domTitleList[i].__splitText = SplitText.create(_domTitleList[i], {
        type: 'lines,chars',
        autoSplit: false,
        mask: 'chars',
      });
      _domDescList[i].__splitText = SplitText.create(_domDescList[i], {
        type: 'lines',
        autoSplit: false,
        mask: 'lines',
      });
    }
    _temperatureSlider = _domContainer.querySelector('#features-temperature-slider') as HTMLElement;
    featuresSectionCurve.preInit(root);
    for (let i = 0; i < _domTitleList.length; i++) {
      _titleDescRectList.push(new Vector4());
      _topRectList.push(new Vector4());
    }
  }

  init(): void {
    featuresSectionCurve.init();
  }

  resize(): void {
    featuresSectionCurve.resize();
    const wrapperWidth = _domItemListWrapper.getBoundingClientRect().width;
    if (properties.useMobileLayout) {
      tableScene.toViewOffsetX = 0;
    } else {
      tableScene.toViewOffsetX =
        ((properties.viewportWidth - wrapperWidth) / 2 + wrapperWidth) / properties.viewportWidth
        - 0.5;
    }
    tableScene.toViewOffsetY = 0;
    for (let i = 0; i < _domIconList.length; i++) {
      _domTaglineList[i].__splitText!.split({ type: 'chars', autoSplit: false });
      _domTitleList[i].__splitText!.split({ type: 'lines,chars', autoSplit: false, mask: 'chars' });
      _domDescList[i].__splitText!.split({ type: 'lines', autoSplit: false, mask: 'lines' });
    }
    for (let i = 0; i < _domTitleList.length; i++) {
      const topRect = _domTopList[i].getBoundingClientRect();
      const titleRect = _domTitleList[i].getBoundingClientRect();
      const descRect = _domDescList[i].getBoundingClientRect();
      _topRectList[i].set(topRect.x, topRect.y, topRect.width, topRect.height);
      _titleDescRectList[i].set(
        titleRect.x,
        titleRect.y,
        titleRect.width,
        titleRect.height + descRect.height,
      );
    }
  }

  private _updateItem(index: number, show: number, hide: number): void {
    const item = _domItemList[index];
    const extra = _domExtraItemList[index];
    const alpha = fit(show, 0, 0.5, 0, 1) * fit(hide, 0.5, 1, 1, 0);
    item.style.opacity = String(alpha);
    item.style.visibility = alpha > 0 ? 'visible' : 'hidden';
    const tagline = _domTaglineList[index].__splitText!;
    for (let c = 0; c < tagline.chars.length; c++) {
      const ratio = c / (tagline.chars.length - 1);
      const inverse = 1 - ratio;
      const char = tagline.chars[c] as HTMLElement;
      const slide = fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 1, 0, ease.cubicOut);
      char.style.transform = `translate3d(${slide}em, 0,0)`;
      char.style.opacity = String(
        fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 0, 1, ease.cubicOut)
          * fit(hide, inverse * 0.4, inverse * 0.4 + 0.6, 1, 0),
      );
    }
    const title = _domTitleList[index].__splitText!;
    for (let c = 0; c < title.chars.length; c++) {
      const ratio = c / (title.chars.length - 1);
      const char = title.chars[c] as HTMLElement;
      const slide = fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 1, 0, ease.cubicOut);
      char.style.transform = `translate3d(0,${slide}em, 0)`;
      char.style.opacity = String(
        fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 0, 1, ease.cubicOut)
          * fit(hide, ratio * 0.4, ratio * 0.4 + 0.6, 1, 0),
      );
    }
    const desc = _domDescList[index].__splitText!;
    for (let l = 0; l < desc.lines.length; l++) {
      const ratio = l / (desc.lines.length - 1);
      const inverse = 1 - ratio;
      const line = desc.lines[l] as HTMLElement;
      const slide = fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 1, 0, ease.cubicOut);
      line.style.transform = `translate3d(0,${slide}em, 0)`;
      line.style.opacity = String(
        fit(show, ratio * 0.4, ratio * 0.4 + 0.6, 0, 1, ease.cubicOut)
          * fit(hide, inverse * 0.4, inverse * 0.4 + 0.6, 1, 0),
      );
    }
    const dashline = _domDashlineList[index];
    dashline.style.width = fit(show, 0, 1, 0, 100, ease.cubicOut) + '%';
    dashline.style.opacity = String(fit(hide, 0, 1, 1, 0));
    extra.style.opacity = String(alpha);
    extra.style.visibility = alpha > 0 ? 'visible' : 'hidden';
  }

  update(dt: number): void {
    const useMobileLayout = properties.useMobileLayout;
    const containerRange = scrollManager.getDomRange(_domContainer);
    const innerRange = scrollManager.getDomRange(_domInner);
    const wrapperRange = scrollManager.getDomRange(_domItemListWrapper);
    const a = containerRange.showScreenOffset;
    const isVisible = a > 0 && a < 10.6;
    _domContainer.style.visibility = isVisible ? 'visible' : 'hidden';
    if (a > 0.5) siteHeader.changeNav('features');
    if (a > 7) {
      const scrollRatio = fit(a, 7, 8, 0, 1);
      if (useMobileLayout) siteFooter.setScroll('right', 0, scrollRatio);
      else siteFooter.setScroll('center', 0, scrollRatio);
    }
    if (isVisible) {
      let show: number;
      let hide: number;
      let activeIndex = 0;
      show = fit(a, 0.5, 1.125, 0, 1);
      hide = fit(a, 1.875, 2.5, 0, 1);
      this._updateItem(0, show, hide);
      const firstShow = show;
      show = fit(a, 2.5, 3.125, 0, 1);
      hide = fit(a, 3.875, 4.5, 0, 1);
      this._updateItem(1, show, hide);
      if (show > 0 && hide <= 1) activeIndex = 1;
      _temperatureSlider.style.opacity = String(show * (1 - hide));
      show = fit(a, 4.5, 5.125, 0, 1);
      hide = fit(a, 5.875, 6.5, 0, 1);
      this._updateItem(2, show, hide);
      if (show > 0 && hide <= 1) activeIndex = 2;
      const lastHide = hide;
      const A = fit(firstShow * 1.5, 0, 1, 0, 1);
      const M = fit(firstShow * 1.5, 0.5, 1.5, 0, 1);
      const T = fit(lastHide * 1.5, 0.5, 1.5, 0, 1);
      const D = fit(lastHide * 1.5, 0, 1, 0, 1);
      const boxWidth = wrapperRange.width * firstShow;
      blurBox.anchor(wrapperRange);
      const alphaBase = 0.15;
      const radiusBase = 0.08;
      if (useMobileLayout) {
        blurBox.useExtra = true;
        const titleRect = _titleDescRectList[activeIndex];
        blurBox.x = titleRect.x;
        blurBox.y = titleRect.y;
        blurBox.width = titleRect.z;
        blurBox.height = titleRect.w;
        blurBox.posB.set(0, titleRect.w);
        blurBox.outline = 1;
        const topRect = _topRectList[activeIndex];
        blurBox.extra.x = topRect.x;
        blurBox.extra.y = topRect.y;
        blurBox.extra.width = topRect.z;
        blurBox.extra.height = topRect.w;
        blurBox.extra.posA.set(0, 0);
        blurBox.extra.posB.set(0, topRect.w);
        blurBox.extra.outline = 1;
      } else {
        blurBox.x = fit(firstShow * (1 - lastHide), 0, 1, -wrapperRange.width * 0.2, 0, ease.cubicOut);
        blurBox.y = wrapperRange.screenY - innerRange.screenY;
        blurBox.posB.set(boxWidth, 0);
      }
      blurBox.color.setStyle('#687952');
      blurBox.colorAlphaA = alphaBase * fit(A, 0, 0.75, 0, 1) * fit(T, 0, 0.75, 1, 0);
      blurBox.colorAlphaB = alphaBase * fit(M, 0, 0.75, 0, 1) * fit(D, 0, 0.75, 1, 0);
      blurBox.blurRadiusA = radiusBase * fit(A, 0.25, 1, 0, 1) * fit(T, 0.25, 1, 1, 0);
      blurBox.blurRadiusB = radiusBase * fit(M, 0.25, 1, 0, 0.2) * fit(D, 0.25, 1, 1, 0);
      if (useMobileLayout) {
        blurBox.extra.color.copy(blurBox.color);
        blurBox.extra.colorAlphaA = blurBox.colorAlphaA;
        blurBox.extra.colorAlphaB = blurBox.colorAlphaB;
        blurBox.extra.blurRadiusA = blurBox.blurRadiusA;
        blurBox.extra.blurRadiusB = blurBox.blurRadiusB;
      }
    } else {
      for (let i = 0; i < _domItemList.length; i++) this._updateItem(i, 0, 0);
    }
    let animation = fit(a, 0, 1.45, tableScene.animation, 4);
    animation = fit(a, 1.55, 3.45, animation, 5);
    animation = fit(a, 3.55, 5, animation, 6);
    tableScene.animation = animation;
    let curve = fit(a, 4.5, 5.125, 0, 1);
    curve = fit(a, 5.875, 7, curve, 2);
    curve = fit(a, 7, 8.5, curve, 3);
    curve = fit(a, 8.5, 10.5, curve, 4);
    curve = fit(a, 10.5, 10.6, curve, 5);
    featuresSectionCurve.animation = curve;
    featuresSectionCurve.update(dt);
  }
}

export const featuresSection = new FeaturesSection();