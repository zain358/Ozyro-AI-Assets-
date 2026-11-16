import { ease } from '../core/ease';
import { fit } from '../core/math';
import { scrollManager } from '../core/ScrollPane';
import { wearableRise } from './wearableRise';

let _domContainer: HTMLElement;
let _domTitle: HTMLElement;
let _domIssue: HTMLElement;
let _domIdea: HTMLElement;
let _domIdeaNum: HTMLElement;
let _domIdeaNumMoveContainer: HTMLElement;
let _domLeftTextList: NodeListOf<HTMLElement>;
let _domRightTextList: NodeListOf<HTMLElement>;
let _domNum: HTMLElement;
let _domBarcode: HTMLElement;
let _pxSize = 1;

export class WearableMagazine {
  showRatio = 0;
  hideRatio = 0;
  pulseRatio = 0;
  frameX = 0;
  frameY = 0;

  preInit(root: Element): void {
    _domContainer = root.querySelector('#wearable-magazine') as HTMLElement;
    _domTitle = _domContainer.querySelector('#wearable-magazine-title') as HTMLElement;
    _domIssue = _domContainer.querySelector('#wearable-magazine-issue') as HTMLElement;
    _domIdea = _domContainer.querySelector('#wearable-magazine-idea') as HTMLElement;
    _domIdeaNum = _domContainer.querySelector('#wearable-magazine-idea-num') as HTMLElement;
    _domIdeaNumMoveContainer = _domIdeaNum.querySelector(
      '#wearable-magazine-idea-num-inner > span:nth-child(3)',
    ) as HTMLElement;
    _domLeftTextList = _domContainer.querySelectorAll(
      '#wearable-magazine-main-title-1,#wearable-magazine-main-title-2,#wearable-magazine-main-desc span',
    );
    _domRightTextList = _domContainer.querySelectorAll(
      '#wearable-magazine-corner-title,#wearable-magazine-corner-desc span',
    );
    _domNum = _domContainer.querySelector('#wearable-magazine-num') as HTMLElement;
    _domBarcode = _domContainer.querySelector('#wearable-magazine-barcode') as HTMLElement;
  }

  init(): void {}

  resize(_width?: number, _height?: number): void {
    _pxSize =
      parseFloat(
        window.getComputedStyle(_domContainer).getPropertyValue('font-size').replace('px', ''),
      ) / 16;
  }

  update(dt: number): void {
    const active = this.showRatio > 0 && this.hideRatio < 1;
    const containerRange = scrollManager.getDomRange(_domContainer);
    const titleRange = scrollManager.getDomRange(_domTitle);
    wearableRise.isActive = active;
    if (active) {
      const pulsing = this.showRatio > 0.8 && this.hideRatio < 0.7;
      const hide = fit(this.hideRatio, 0.5, 1, 0, 1);
      if (!pulsing && this.pulseRatio === 1) this.pulseRatio = 0;
      if (this.pulseRatio > 0 || pulsing) this.pulseRatio = Math.min(1, this.pulseRatio + dt);
      wearableRise.rect.set(
        this.frameX + titleRange.screenX - containerRange.screenX,
        this.frameY + titleRange.screenY - containerRange.screenY,
        titleRange.width,
        titleRange.height,
      );
      wearableRise.colorPassRect.set(
        this.frameX,
        this.frameY,
        containerRange.width,
        containerRange.height,
      );
      wearableRise.showRatio = this.showRatio;
      wearableRise.hideRatio = this.hideRatio;
      wearableRise.pulseRatio = this.pulseRatio;
      let t: number;
      for (let i = 0; i < _domLeftTextList.length; i++) {
        const ratio = i / (_domLeftTextList.length - 1);
        t = fit(hide, ratio * 0.2, 0.8 + ratio * 0.2, 0, 1);
        const el = _domLeftTextList[i];
        el.style.transform = `translate3d(${fit(t, 0, 1, 0, -260 * _pxSize, ease.cubicIn)}px,0,0)`;
        el.style.opacity = String(fit(t, 0.5, 1, 1, 0));
      }
      for (let i = 0; i < _domRightTextList.length; i++) {
        const ratio = i / (_domRightTextList.length - 1);
        t = fit(hide, ratio * 0.2, 0.8 + ratio * 0.2, 0, 1);
        const el = _domRightTextList[i];
        el.style.transform = `translate3d(${fit(t, 0, 1, 0, 260 * _pxSize, ease.cubicIn)}px,0,0)`;
        el.style.opacity = String(fit(t, 0.5, 1, 1, 0));
      }
      t = fit(hide, 0, 0.75, 0, 1);
      _domIssue.style.transform = `translate3d(${fit(t, 0, 1, 0, 40 * _pxSize)}px,0,0)`;
      _domIssue.style.opacity = String(fit(t, 0.5, 1, 1, 0));
      t = fit(hide, 0.1, 0.85, 0, 1);
      _domIdea.style.transform = `translate3d(${fit(t, 0, 1, 0, 40 * _pxSize)}px,0,0)`;
      _domIdea.style.opacity = String(fit(t, 0.5, 1, 1, 0));
      t = fit(this.hideRatio, 0.25, 0.75, 0, 1);
      _domIdeaNumMoveContainer.style.transform =
        `translate3d(0,${fit(t, 0, 1, 0, -300, ease.cubicIn)}%,0)`;
      t = fit(hide, 0, 0.75, 0, 1);
      _domNum.style.transform = `scale(${fit(t, 0, 1, 1, 0.1, ease.backIn)})`;
      _domNum.style.opacity = String(fit(t, 0.5, 1, 1, 0));
      t = fit(this.hideRatio, 0.25, 0.75, 0, 1);
      _domBarcode.style.transform = `scaleY(${fit(t, 0, 1, 1, 0, ease.backIn)})`;
    } else {
      this.pulseRatio = 0;
    }
  }
}

export const wearableMagazine = new WearableMagazine();