import { ease } from './ease';
import { clamp, fit, mix, saturate, unClampedFit } from './math';
import { input } from './input';
import { properties } from './properties';

let uuidHash = 1;

export class ScrollDomRange {
  refDomFrom: Element;
  refDomTo: Element;
  isVertical: boolean;
  needsUpdate = true;
  screenX = 0;
  screenY = 0;
  /** -1..0 while entering from below, 0..1 while leaving above; 0 = fully in view range. */
  ratio = 0;
  /** -1 (below viewport) .. 1 (above viewport), continuous. */
  screenRatio = 0;
  isActive = false;
  left = 0;
  right = 0;
  top = 0;
  bottom = 0;
  width = 0;
  height = 0;
  showScreenOffset = 0;
  hideScreenOffset = 0;
  viewSize = 0;
  private _left = 0;
  private _right = 0;
  private _top = 0;
  private _bottom = 0;

  constructor(ref: Element | [Element, Element], isVertical: boolean) {
    const isPair = Array.isArray(ref);
    this.refDomFrom = isPair ? ref[0] : ref;
    this.refDomTo = isPair ? ref[1] : ref;
    this.isVertical = isVertical;
  }

  update(scrollPixel: number, viewSizePixel: number, offset: number, force: boolean): void {
    if (force || this.needsUpdate) {
      const a = this.refDomFrom.getBoundingClientRect();
      const b = this.refDomFrom === this.refDomTo ? a : this.refDomTo.getBoundingClientRect();
      this.needsUpdate = false;
      this._left = a.left;
      this._right = b.right;
      this._top = a.top;
      this._bottom = b.bottom;
      this.width = b.right - a.left;
      this.height = b.bottom - a.top;
      // Convert viewport-relative rect to document-absolute.
      if (this.isVertical) {
        this._top += scrollPixel;
        this._bottom += scrollPixel;
      } else {
        this._left += scrollPixel;
        this._right += scrollPixel;
      }
    }
    this.left = this._left;
    this.right = this._right;
    this.top = this._top;
    this.bottom = this._bottom;
    if (this.isVertical) {
      this.top += offset;
      this.bottom += offset;
    } else {
      this.left += offset;
      this.right += offset;
    }
    this.screenX = this.left;
    this.screenY = this.top;
    let pos: number;
    if (this.isVertical) pos = this.screenY -= scrollPixel;
    else pos = this.screenX -= scrollPixel;
    const size = this.isVertical ? this.height : this.width;
    this.viewSize = size / viewSizePixel;
    this.ratio = Math.min(0, unClampedFit(pos, viewSizePixel, viewSizePixel - size, -1, 0));
    this.ratio += Math.max(0, unClampedFit(pos, 0, -size, 0, 1));
    this.screenRatio = fit(pos, viewSizePixel, -size, -1, 1);
    this.showScreenOffset = -(pos - viewSizePixel) / viewSizePixel;
    this.hideScreenOffset = -(pos + size) / viewSizePixel;
    this.isActive = this.ratio >= -1 && this.ratio <= 1;
  }
}

export class ScrollPane {
  viewDom: Window | Element = window;
  contentDom: HTMLElement | null = null;
  isVertical = true;
  targetScrollPixel = 0;
  scrollViewDelta = 0;
  viewWidthPixel = 0;
  viewHeightPixel = 0;
  contentSize = 0;
  contentSizePixel = 0;
  scrollView = 0;
  progress = 0;
  minScrollPixel = 0.1;
  viewSizePixel = 1;
  domRanges = new Map<string | number, ScrollDomRange>();
  useResizeObserver = true;
  tick = -1;
  lastResizeTick = -1;
  resizeObserveTick = -1;
  hasResizeObserved = false;
  dragHistory: Array<{ time: number; deltaTime: number; deltaPixel: number }> = [];
  dragHistoryMaxTime = 0.1;
  isWheelScrolling = false;
  frictionCoeffFrom = 2.1;
  frictionCoeffTo = 1.9;
  frictionCoeffWeightDivisor = 5;
  minVelocity = -1;
  wheelEaseCoeff = 12;
  scrollPixel = 0;
  velocityPixel = 0;
  isScrolling = false;
  isActive = false;
  lockOnDirection = false;
  private _skipNativeScroll = false;
  private lastWrittenScroll = -1;

  init(options: Partial<ScrollPane> = {}): void {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    Object.assign(this, options);
    if (this.contentDom) {
      this.contentDom.style.position = 'relative';
      this.contentDom.style.transform = 'none';
      if (this.useResizeObserver && window.ResizeObserver) {
        new ResizeObserver(this._onResizeObserve.bind(this)).observe(this.contentDom);
      }
    }
    window.addEventListener('scroll', this._onNativeScroll.bind(this), { passive: true });
    document.documentElement.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') this.scrollToPixel(this.scrollPixel - 100);
      else if (e.key === 'ArrowDown') this.scrollToPixel(this.scrollPixel + 100);
      else if (e.key === 'PageUp') this.scrollToPixel(this.scrollPixel - this.viewSizePixel);
      else if (e.key === 'PageDown') this.scrollToPixel(this.scrollPixel + this.viewSizePixel);
    });
  }

  private _onNativeScroll(): void {
    if (this._skipNativeScroll) {
      this._skipNativeScroll = false;
      return;
    }
    const pos = this.isVertical ? window.scrollY : window.scrollX;
    this.scrollPixel = pos;
    this.targetScrollPixel = pos;
    this.velocityPixel = 0;
  }

  private _onResizeObserve(): void {
    this.hasResizeObserved = true;
    this.resizeObserveTick = this.tick;
  }

  getDomRange(ref: Element | [Element, Element], offset = 0, force = false): ScrollDomRange {
    type Keyed = { __uuid?: number };
    const isPair = Array.isArray(ref);
    if (isPair) {
      (ref[0] as Keyed).__uuid = (ref[0] as Keyed).__uuid || uuidHash++;
      (ref[1] as Keyed).__uuid = (ref[1] as Keyed).__uuid || uuidHash++;
    } else {
      (ref as Keyed).__uuid = (ref as Keyed).__uuid || uuidHash++;
    }
    const key = isPair
      ? `${(ref[0] as Keyed).__uuid}_${(ref[1] as Keyed).__uuid}`
      : (ref as Keyed).__uuid!;
    let range = this.domRanges.get(key);
    if (!range) {
      range = new ScrollDomRange(ref, this.isVertical);
      this.domRanges.set(key, range);
    }
    range.update(this.scrollPixel, this.viewSizePixel, offset, force);
    return range;
  }

  scrollTo(target: string | Element, offset = 0, immediate = false): void {
    const elem = typeof target === 'string'
      ? document.getElementById(target) || document.getElementById(target.replace('-section', ''))
      : target;
    if (elem) {
      const range = this.getDomRange(elem);
      this.scrollToPixel(range.top + offset * this.viewSizePixel, immediate);
    }
  }

  scrollToPixel(pixel = 0, immediate = false): void {
    pixel = this._clampScrollPixel(pixel);
    if (immediate) {
      this.resetScroll(pixel);
      this.progress = this.contentSize > 0 ? pixel / this.contentSizePixel : 0;
    } else {
      this.resetScroll(this.scrollPixel);
      this.targetScrollPixel = pixel;
      this.isWheelScrolling = true;
    }
    this.syncDom();
  }

  resize(width: number, height: number): void {
    this.domRanges.forEach((r) => {
      r.needsUpdate = true;
    });
    if (this.viewDom === window) {
      width = window.innerWidth;
      height = window.innerHeight;
    } else {
      const rect = (this.viewDom as Element).getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    this.viewWidthPixel = width;
    this.viewHeightPixel = height;
    const viewSize = this.isVertical ? height : width;
    if (this.contentDom) {
      const rect = this.contentDom.getBoundingClientRect();
      this.contentSizePixel = this.isVertical ? rect.height : rect.width;
      this.contentSize = Math.max(0, this.contentSizePixel / viewSize - 1);
      if (this.isVertical) {
        document.body.style.height = `${this.contentSizePixel}px`;
        document.body.style.width = '';
      } else {
        document.body.style.width = `${this.contentSizePixel}px`;
        document.body.style.height = '';
      }
    }
    this.targetScrollPixel = this.contentSizePixel * this.progress;
    this.resetScroll(this.targetScrollPixel);
    this.viewSizePixel = viewSize;
    this.lastResizeTick = this.tick;
    this.syncDom();
  }

  private _clampScrollPixel(pixel: number): number {
    const max = this.contentSizePixel - this.viewSizePixel;
    return clamp(pixel, 0, Math.max(0, max));
  }

  resetScroll(pixel: number): void {
    this.targetScrollPixel = this.scrollPixel = pixel;
    this.velocityPixel = 0;
    this.dragHistory.length = 0;
  }

  update(dt: number): void {
    if (this.hasResizeObserved) {
      this.hasResizeObserved = false;
      if (this.resizeObserveTick !== this.lastResizeTick) {
        this.resize(this.viewWidthPixel, this.viewHeightPixel);
      }
    }
    const prevScrollView = this.scrollView;
    const prevScrollPixel = this.scrollPixel;
    const isDragging = input.isDown
      && ((!this.lockOnDirection && (input.isDragScrollingY || input.isDragScrollingX))
        || (this.isVertical && input.isDragScrollingY)
        || (!this.isVertical && input.isDragScrollingX));
    let moveDelta = 0;

    if (input.isDown && !input.wasDown) this.dragHistory.length = 0;

    if (this.isMoveable) {
      let delta = 0;
      if (this.isVertical) {
        if (input.isWheelScrolling || input.isDragScrollingY) delta = input.deltaScrollY;
        else if (!this.lockOnDirection && input.isDragScrollingX) {
          delta = -input.deltaPixelXY.y + input.deltaWheel;
        }
      } else if (input.isWheelScrolling || input.isDragScrollingX) {
        delta = input.deltaScrollX;
      } else if (!this.lockOnDirection && input.isDragScrollingY) {
        delta = -input.deltaPixelXY.x + input.deltaWheel;
      }
      if (input.isWheelScrolling) this.isWheelScrolling = true;

      const now = properties.time;
      if (isDragging) {
        this.dragHistory.push({ time: now, deltaTime: dt, deltaPixel: delta });
        while (this.dragHistory.length > 0 && now - this.dragHistory[0].time > this.dragHistoryMaxTime) {
          this.dragHistory.shift();
        }
        this.targetScrollPixel = this.scrollPixel;
        this.isWheelScrolling = false;
        moveDelta = delta;
      } else if (this.isWheelScrolling) {
        if (input.isDown) this.resetScroll(this.scrollPixel);
        this.dragHistory.length = 0;
        this.velocityPixel = 0;
        this.targetScrollPixel += delta;
        this.targetScrollPixel = this._clampScrollPixel(this.targetScrollPixel);
        const remaining = this.targetScrollPixel - this.scrollPixel;
        moveDelta = remaining * (1 - Math.exp(-this.wheelEaseCoeff * dt));
        if (Math.abs(remaining) < this.minScrollPixel) {
          moveDelta = remaining;
          this.isWheelScrolling = false;
        }
      } else {
        if (input.isDown) this.resetScroll(this.scrollPixel);
        if (this.dragHistory.length > 0) {
          let weightSum = 0;
          let weighted = 0;
          for (let i = 0; i < this.dragHistory.length; i++) {
            const h = this.dragHistory[i];
            if (h.time > 0) {
              const v = h.deltaPixel / h.deltaTime;
              const w = h.deltaTime
                * (this.dragHistory.length === 1
                  ? 1
                  : (h.time - this.dragHistory[0].time) / this.dragHistoryMaxTime);
              weighted += v * w;
              weightSum += w;
            }
          }
          this.velocityPixel = weighted / weightSum;
          this.dragHistory.length = 0;
        }
        const friction = -mix(
          this.frictionCoeffFrom,
          this.frictionCoeffTo,
          clamp(Math.abs(this.velocityPixel / this.viewSizePixel / this.frictionCoeffWeightDivisor), 0, 1),
        ) * this.velocityPixel;
        this.velocityPixel += friction * dt;
        moveDelta = this.velocityPixel * dt;
      }
    }

    this.scrollPixel = this._clampScrollPixel(this.scrollPixel + moveDelta);
    if (Math.abs(prevScrollPixel - this.scrollPixel) > 1) {
      this.scrollPixel = Math.round(this.scrollPixel);
    }
    this.scrollView = this.scrollPixel / this.viewSizePixel;
    this.scrollViewDelta = this.scrollView - prevScrollView;
    this.progress = this.contentSize > 0 ? this.scrollPixel / this.contentSizePixel : 0;
    if (Math.abs(this.targetScrollPixel - this.scrollPixel) < this.minScrollPixel) {
      this.scrollPixel = this.targetScrollPixel;
    }
    if (Math.abs(this.velocityPixel) <= this.minVelocity) this.velocityPixel = 0;
    this.isScrolling = this.targetScrollPixel !== this.scrollPixel || Math.abs(this.velocityPixel) > 0;
    this.syncDom();
    this.tick++;
  }

  syncDom(): void {
    if (!this.contentDom) return;
    if (Math.abs(this.scrollPixel - this.lastWrittenScroll) > 0.1) {
      this._skipNativeScroll = true;
      this.lastWrittenScroll = this.scrollPixel;
      if (this.isVertical) window.scrollTo({ top: this.scrollPixel, behavior: 'instant' });
      else window.scrollTo({ left: this.scrollPixel, behavior: 'instant' });
    } else {
      this._skipNativeScroll = false;
    }
  }

  get isMoveable(): boolean {
    return this.isActive
      && this.contentSize > 0
      && (this.viewDom === window || input.hasThroughElem(this.viewDom as Element, 'down'));
  }
}

// Scroll indicator state (source pretty 29688-29691).
let _domScrollIndicator: HTMLElement | null = null;
let _domScrollIndicatorBar: HTMLElement | null = null;
let _scrollIndicatorMoveableHeight = 1;
let _scrollIndicatorActiveRatio = 0;
let _lastMouseInteractiveTime = -Infinity;
let _isIndicatorActive = false;
let _scrollBarHeight = 0;

// Source ScrollManager (pretty 29692-29719): drives the custom scroll
// indicator bar and exposes scrollBarCenter (consumed by AppleEfx's pulse).
export class ScrollManager extends ScrollPane {
  isBtn = false;
  btnRatio = 0;
  scrollBarCenter = 0;

  init(): void {
    super.init({
      contentDom: document.getElementById('site-content') as HTMLElement,
    } as Partial<ScrollPane>);
    _domScrollIndicator = document.getElementById('scroll-indicator');
    _domScrollIndicatorBar = document.getElementById('scroll-indicator__bar');
    input.onClicked.add(() => {
      if (this.isBtn && input.hasThroughElem(_domScrollIndicatorBar!, 'down')) {
        scrollManager.scrollTo('open-weight');
      }
    });
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    if (_domScrollIndicator && _domScrollIndicatorBar) {
      _scrollBarHeight = _domScrollIndicatorBar.getBoundingClientRect().height;
      _scrollIndicatorMoveableHeight =
        _domScrollIndicator.getBoundingClientRect().height - _scrollBarHeight;
    }
  }

  update(dt: number): void {
    const useMobileLayout = properties.useMobileLayout;
    let isDraggingBar = false;
    this.btnRatio = saturate(this.btnRatio + (this.isBtn ? 3 : -3) * dt);
    if (useMobileLayout) {
      this.btnRatio = 0;
      this.isBtn = false;
    } else if (input.isDown && input.hasThroughElem(_domScrollIndicatorBar!, 'down')) {
      isDraggingBar = true;
    }
    if (isDraggingBar) {
      this.scrollToPixel(
        this.scrollPixel
          + input.deltaPixelXY.y * this.contentSize * (this.viewSizePixel / _scrollIndicatorMoveableHeight),
        true,
      );
    }
    super.update(dt);
    if (Math.abs(this.scrollViewDelta) > 0) {
      _lastMouseInteractiveTime = properties.time;
      _isIndicatorActive = true;
    } else if (properties.time > _lastMouseInteractiveTime + 0.5) {
      _isIndicatorActive = false;
    }
    _scrollIndicatorActiveRatio = clamp(
      _scrollIndicatorActiveRatio + (_isIndicatorActive ? 2 : -2) * dt,
      0,
      1,
    );
    let barX = fit(this.btnRatio, 0, 1, useMobileLayout ? 52 : 46, 0, ease.cubicInOut);
    barX = fit(properties.startTime, 0.5, 1, 61, barX, ease.cubicInOut);
    const barY = _scrollIndicatorMoveableHeight * (this.scrollView / this.contentSize);
    if (_domScrollIndicatorBar) {
      _domScrollIndicatorBar.style.transform = 'translate3d(' + barX + 'px,' + barY + 'px,0)';
      _domScrollIndicatorBar.style.opacity = String(
        useMobileLayout ? _scrollIndicatorActiveRatio : 1,
      );
      _domScrollIndicatorBar.style.cursor = this.isBtn ? 'pointer' : 'default';
    }
    this.scrollBarCenter = (barY + _scrollBarHeight * 0.5) / properties.height;
  }
}

export const scrollManager = new ScrollManager();
