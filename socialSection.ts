import { ease } from '../core/ease';
import { clamp, fit, mix, saturate } from '../core/math';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { siteFooter } from '../SiteFooter';
import { Section } from './Section';

type SocialItem = HTMLElement & {
  __moveDomList: NodeListOf<HTMLElement>;
  __from: number;
  __to: number;
  __offset: number;
  __offsetRange: number;
};

let _movableWidth = 0;
let _isUnclipped = false;
let _clipRatio = 0;
let _domContainer: HTMLElement;
let _domInner: Element;
let _domItemsWrapper: HTMLElement;
let _domItems: NodeListOf<SocialItem>;
let _domItemClippers: NodeListOf<HTMLElement>;
let _domItemInners: NodeListOf<HTMLElement>;
let _easedOffsetX = 0;
let _sectionInnerWidth = 0;
let _hasResized = false;
let _domProgressItems: NodeListOf<HTMLElement>;

export class SocialSection extends Section {
  preInit(root: Element): void {
    super.preInit(root, 'social-content');
    _domContainer = this.domContainer;
    _domInner = _domContainer.querySelector('.section__inner') as Element;
    _domItemsWrapper = _domContainer.querySelector('#social-content-items-wrapper') as HTMLElement;
    _domItems = document.querySelectorAll('.social-content-item');
    _domItemClippers = document.querySelectorAll('.social-content-item-clipper');
    _domItemInners = document.querySelectorAll('.social-content-item-inner');
    _domProgressItems = document.querySelectorAll('.social-content-progress-item');
    for (let i = 0; i < _domItems.length; i++) {
      const item = _domItems[i];
      item.__moveDomList = item.querySelectorAll(
        '.social-content-item-bg,.social-content-item-cover',
      );
    }
  }

  init(): void {
    super.init();
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    _domItemsWrapper.style.transform = 'translateZ(0)';
    const useMobileLayout = properties.useMobileLayout;
    for (let i = 0; i < _domItems.length; i++) {
      _domItems[i].style.transform = 'translateZ(0)';
    }
    _sectionInnerWidth = useMobileLayout ? _domInner.getBoundingClientRect().width : width;
    const wrapperRect = _domItemsWrapper.getBoundingClientRect();
    if (useMobileLayout) {
      _movableWidth = _sectionInnerWidth * _domItems.length;
    } else {
      _movableWidth = wrapperRect.width - _sectionInnerWidth;
    }
    _domContainer.style.height = `${_movableWidth + properties.viewportHeight}px`;
    const offsetRange = (200 / 1080) * wrapperRect.height;
    for (let i = 0; i < _domItems.length; i++) {
      const item = _domItems[i];
      item.style.transform = 'translateZ(0)';
      for (let j = 0; j < item.__moveDomList.length; j++) {
        item.__moveDomList[j].style.transform = 'translateZ(0)';
      }
      const rect = item.getBoundingClientRect();
      if (useMobileLayout) {
        item.__from = _sectionInnerWidth * i;
        item.__to = _sectionInnerWidth * (i + 1);
        item.__offset = 0;
        item.__offsetRange = 0;
      } else {
        item.__from = rect.left - wrapperRect.left - _sectionInnerWidth;
        item.__to = rect.right - wrapperRect.left;
        item.__offset = 0;
        item.__offsetRange = offsetRange;
      }
    }
    _hasResized = true;
  }

  update(dt: number): void {
    super.update(dt);
    const useMobileLayout = properties.useMobileLayout;
    const range = scrollManager.getDomRange(_domContainer);
    const r = range.showScreenOffset;
    const o = range.hideScreenOffset;
    const isActive = range.isActive;
    _isUnclipped = r < 0;
    const clipping = _isUnclipped || r > 0.4;
    _clipRatio = _isUnclipped ? 0 : saturate(_clipRatio + (clipping ? dt * 1.5 : 0));
    const clipWidth = useMobileLayout ? 1 : ease.expoInOut(_clipRatio);
    for (let i = 0; i < _domItemClippers.length; i++) {
      _domItemClippers[i].style.width = `${clipWidth * 100}%`;
    }
    const offsetX = clamp((r - 1) * properties.viewportHeight, 0, _movableWidth);
    if (!useMobileLayout) {
      _domItemsWrapper.style.transform = `translate3d(${-offsetX}px, 0, 0)`;
    }
    if (_hasResized) {
      _easedOffsetX = offsetX;
    } else {
      _easedOffsetX = mix(_easedOffsetX, offsetX, 1 - Math.exp(-dt * 10));
    }
    if (isActive) {
      let activeIndex = 0;
      for (let i = 0; i < _domItems.length; i++) {
        const item = _domItems[i];
        const inner = _domItemInners[i];
        const isLast = i === _domItems.length - 1;
        const offsetRange = item.__offsetRange;
        let translate: number;
        let opacity = 1;
        if (useMobileLayout) {
          translate = fit(
            _easedOffsetX + _sectionInnerWidth,
            item.__from,
            item.__to,
            _sectionInnerWidth,
            0,
          );
          opacity = isLast
            ? 1
            : fit(_easedOffsetX, item.__to - _sectionInnerWidth * 0.75, item.__to, 1, 0);
          if (_easedOffsetX + _sectionInnerWidth < item.__from) opacity = 0;
        } else {
          translate = fit(_easedOffsetX, item.__from, item.__to, -offsetRange, 0);
        }
        if (_easedOffsetX >= item.__from) activeIndex = i;
        inner.style.opacity = String(opacity);
        item.style.visibility = opacity > 0 ? 'visible' : 'hidden';
        if (useMobileLayout) {
          item.style.transform = `translate3d(${translate}px, 0, 0)`;
        } else {
          for (let j = 0; j < item.__moveDomList.length; j++) {
            item.__moveDomList[j].style.transform = `translate3d(${translate + item.__offset}px, 0, 0)`;
          }
        }
      }
      for (let i = 0; i < _domProgressItems.length; i++) {
        _domProgressItems[i].classList.toggle('is-active', i === activeIndex);
      }
      const scrollRatio = fit(r, 0.9, 1.4, 0, 1) * fit(o, -1.5, -1, 1, 0);
      if (useMobileLayout) siteFooter.setScroll('right', 0, scrollRatio);
      else siteFooter.setScroll('center', 0, scrollRatio);
    }
    _hasResized = false;
  }
}

export const socialContentSection = new SocialSection();