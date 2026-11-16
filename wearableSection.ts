// 1:1 port of the source WearableSection (pretty 21430-21508): wearableScene
// animation chain, gallery index driving, wearableText rect choreography,
// frame/scene clip rects, magazine frame handoff, section canvas, split-char
// title and the siteFooter scroll indicator.

import { SplitText } from 'gsap/SplitText';
import { gsap } from 'gsap';
import { ease } from '../core/ease';
import { fit, unClampedFit } from '../core/math';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { handScene } from '../scenes/handScene';
import { tableScene } from '../scenes/tableScene';
import { wearableFrame } from '../scenes/wearableFrame';
import { wearableGallery } from '../scenes/wearableGallery';
import { wearableMagazine } from '../scenes/wearableMagazine';
import { wearableScene } from '../scenes/wearableScene';
import { siteFooter } from '../SiteFooter';
import { wearableText } from '../scenes/wearableText';
import { wearableSectionCanvas } from './wearableSectionCanvas';

gsap.registerPlugin(SplitText);

let _domContainer: HTMLElement;
let _domInner: Element;
let _domCopyDecs: Element;
let _domCopyTitleWrapper: Element;
let _domCopyTitle1: HTMLElement;
let _domCopyTitle1SplitText: SplitText;
let _domCopyTitle2: HTMLElement;
let _domMain: Element;

export class WearableSection {
  preInit(root: Element): void {
    _domContainer = root.querySelector('#wearable') as HTMLElement;
    _domInner = _domContainer.querySelector('.section__inner') as Element;
    _domCopyDecs = _domContainer.querySelector('#wearable-title-2-dummy') as Element;
    _domCopyTitleWrapper = _domContainer.querySelector('#wearable-title') as Element;
    _domCopyTitle1 = _domContainer.querySelector('#wearable-title span:first-child') as HTMLElement;
    _domCopyTitle1SplitText = SplitText.create(_domCopyTitle1, {
      type: 'chars',
      autoSplit: false,
      mask: 'chars',
    });
    _domCopyTitle2 = _domContainer.querySelector('#wearable-title span:last-child') as HTMLElement;
    _domMain = _domContainer.querySelector('#wearable-main') as Element;
    wearableSectionCanvas.preInit(root);
    wearableGallery.preInit(root);
    wearableMagazine.preInit(root);
  }

  init(): void {
    wearableSectionCanvas.init();
  }

  resize(): void {
    _domCopyTitle1SplitText.split({ type: 'chars', autoSplit: false, mask: 'chars' });
    wearableSectionCanvas.resize();
    wearableGallery.resize();
    wearableMagazine.resize();
  }

  update(dt: number): void {
    const useMobileLayout = properties.useMobileLayout;
    const containerRange = scrollManager.getDomRange(_domContainer);
    const r = containerRange.showScreenOffset;
    const isActive = containerRange.isActive;
    const showRatio = fit(r, 0.5, 1, 0, 1);
    const hideRatio = fit(r, 12.25, 13.25, 0, 1);
    _domContainer.style.visibility = showRatio > 0 && hideRatio < 1 ? 'visible' : 'hidden';
    // tableScene.animation handoff (pretty 21453).
    tableScene.animation = fit(r, 10.75 - 0.75, 10.75, 0, 1);
    tableScene.animation = fit(r, 10.75, 11.75, tableScene.animation, 2);
    tableScene.animation = fit(r, 11.75, 13.25, tableScene.animation, 3);
    const innerRange = scrollManager.getDomRange(_domInner);
    const copyDecsRange = scrollManager.getDomRange(_domCopyDecs);
    const titleWrapperRange = scrollManager.getDomRange(_domCopyTitleWrapper);
    const title2Range = scrollManager.getDomRange(_domCopyTitle2);
    const mainRange = scrollManager.getDomRange(_domMain);
    wearableGallery.rawIndex = unClampedFit(r, 5.5, 10.75, 0, 7);
    wearableGallery.index =
      Math.floor(wearableGallery.rawIndex)
      + fit(wearableGallery.rawIndex % 1, 0.1, 0.9, 0, 1, ease.sineInOut);
    wearableGallery.update(dt);
    const galleryIndex = wearableGallery.index;
    const b = mainRange.width;
    const S = mainRange.height;
    const A = -Math.max(0, galleryIndex) * b;
    const M = mainRange.screenY - innerRange.screenY;
    const T = mainRange.screenX;
    const D = (M + S / 2 - properties.viewportHeight / 2) / properties.viewportHeight;
    if (isActive) {
      const N = fit(r, 3.25, 4.75, 0, 1);
      const U = titleWrapperRange.screenY + titleWrapperRange.height - innerRange.screenY;
      const k =
        properties.viewportHeight / 2
        - wearableGallery.thumbItemHeight / 2
        - title2Range.height / 6;
      const G = fit(N, 0, 1, 0, -Math.max(0, U - k));
      const L =
        innerRange.height / 2
        - (titleWrapperRange.screenY - innerRange.screenY)
        - title2Range.height / 2;
      let F = fit(r, 1, 1.75, 0, 1);
      let titleShift = 0;
      if (useMobileLayout) {
        F = fit(r, 1.75, 2.25, 0, 1);
        const mobileL =
          L + D * properties.viewportHeight - b / 2 - properties.viewportWidth * 0.06;
        titleShift = fit(r, 2.5, 3, mobileL, G, ease.cubicInOut);
      } else {
        titleShift = fit(F, 0, 1, L, G, ease.cubicInOut);
      }
      const chars = _domCopyTitle1SplitText.chars;
      for (let c = 0, count = chars.length; c < count; c++) {
        const charRatio = c / (count - 1);
        const char = chars[c] as HTMLElement;
        const charShift = fit(r, 0.5 + charRatio * 0.1, charRatio * 0.1 + 0.9, 1.5, 0, ease.expoOut);
        char.style.transform = `translate3d(0,${charShift}em, 0)`;
      }
      const q = fit(hideRatio, 0, 0.85, 0, 1);
      const Q = fit(hideRatio, 0.15, 1, 0, 1);
      _domCopyTitle1.style.transform = `translate3d(0, ${titleShift}px, 0)`;
      _domCopyTitle2.style.opacity = String(
        fit(r, 3.25, 4.75, 0, useMobileLayout ? 1 : 0) * (1 - Q),
      );
      _domCopyTitle1.style.opacity = String(1 - q);
      const textAspect = wearableText.size.x / wearableText.size.y;
      const pad = title2Range.height * 0.03;
      const textWidth = title2Range.width - pad * 2;
      const textHeight = textWidth / textAspect;
      let offscreenX = fit(
        r,
        1,
        2,
        properties.viewportWidth,
        0,
        useMobileLayout ? ease.cubicOut : undefined,
      );
      const toY = G;
      let fromY = copyDecsRange.screenY - innerRange.screenY;
      const rectToY = title2Range.screenY - innerRange.screenY + toY;
      if (useMobileLayout) {
        fromY = (0.55 + D) * properties.viewportHeight + b / 2;
        offscreenX += fit(r, 2, 3, 0, -properties.viewportWidth, ease.cubicIn);
      }
      wearableText.rectFrom.set(
        copyDecsRange.screenX + offscreenX,
        fromY,
        copyDecsRange.width,
        copyDecsRange.height,
      );
      wearableText.rectTo.set(
        title2Range.screenX + offscreenX + pad,
        rectToY,
        textWidth + 1,
        textHeight + 1,
      );
      wearableText.shrinkRatio = N;
      wearableText.opacity = 1 - Q;
      if (useMobileLayout) wearableText.rectTo.copy(wearableText.rectFrom);
      const scrollRatio = showRatio * (1 - hideRatio);
      if (useMobileLayout) siteFooter.setScroll('right', 0, scrollRatio);
      else siteFooter.setScroll('center', 0, scrollRatio);
    }
    const itemCount = wearableGallery.itemList.length;
    if (galleryIndex > itemCount - 2) {
      const N = Math.max(0, Math.min(b, b * (itemCount - 1) - wearableGallery.offsetX));
      const U = mainRange.screenY - innerRange.screenY;
      const k = mainRange.screenY + S - innerRange.screenY;
      const G = N + mainRange.screenX;
      const L = mainRange.screenX + b;
      tableScene.fromViewOffsetX = (G + b / 2) / properties.viewportWidth - 0.5;
      tableScene.fromViewOffsetY = D;
      tableScene.clipScissor.set((G + L) / 2, (U + k) / 2, L - G, S);
      wearableMagazine.frameX = G;
      wearableMagazine.frameY = M;
    }
    let E = fit(r, 0.5, 1.5, 0, 1);
    E = fit(r, 1.5, 3, E, 2);
    E = fit(r, 3, 5.25, E, 3);
    E = fit(galleryIndex, 0, 1, E, 4);
    E = fit(galleryIndex - itemCount + 1, -1, 0, E, 5);
    E = fit(galleryIndex - itemCount + 1, 0, 3.2, E, 6);
    wearableScene.animation = E;
    if (E > 2 && E < 4) {
      wearableScene.clipScissor.set(T, properties.viewportHeight - (M + S), b + A, S);
      wearableFrame.rect.set(T + A, M, b, S);
    }
    handScene.viewOffsetY = D;
    wearableScene.frameZoom = S / (properties.viewportHeight * 0.8);
    wearableSectionCanvas.showRatio = fit(r, 0, 1, 0, 1);
    wearableSectionCanvas.hideRatio = hideRatio;
    wearableSectionCanvas.scaleRatio = fit(r, 2.2, 3.4, 0, 1, ease.cubicInOut);
    wearableSectionCanvas.scaleRatio2 = fit(r, 2.3, 3.5, 0, 1, ease.cubicInOut);
    wearableSectionCanvas.update(dt);
    wearableMagazine.update(dt);
  }
}

export const wearableSection = new WearableSection();