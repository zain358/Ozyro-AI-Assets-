import { SplitText } from 'gsap/SplitText';
import { cameraControls } from '../core/cameraControls';
import { ease } from '../core/ease';
import { input } from '../core/input';
import { clamp, fit, saturate } from '../core/math';
import { MinSignal } from '../core/MinSignal';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { sketches } from '../scenes/sketches';
import { stackScene } from '../scenes/stackScene';
import { Section } from './Section';
import { testimoniesSection } from './testimoniesSection';

type SplitElement = HTMLElement & { __splitText?: SplitText };

let _titleHeight = 0;
let _domContainer: HTMLElement;
let _domInner: Element;
let _domHero: HTMLElement;
let _domHeroInner: HTMLElement;
let _domHeroTitleWrapper: HTMLElement;
let _domHeroTitle: HTMLElement;
let _domDetails: HTMLElement;
let _domDetailsInner: HTMLElement;
let _domHeroCaption: HTMLElement;
let _domHeroOptions: HTMLElement;
let _domHeroOptionItemList: NodeListOf<HTMLElement>;
let _domDetailsTitleList: NodeListOf<SplitElement>;
let _domDetailsDescList: NodeListOf<SplitElement>;
let _domDetailsExtraIconList: NodeListOf<SVGElement>;
const _domDetailsExtraItemListSubItemList: SplitElement[][] = [];
let _domCompare: HTMLElement;
const _sketchOrders = [3, 1, 2, 5, 4];
const _sketchTransforms = [
  { rot: -0.1, scale: 0.36 },
  { rot: -0.2, scale: 0.28 },
  { rot: 0.2, scale: 0.4 },
  { rot: -0.3, scale: 0.3 },
  { rot: 0.3, scale: 0.3 },
];
let _sketchTime = 0;
let _sketchShowRatio = 0;
const _optionActiveRatios = [0, 0, 0];
let _optionIndex = 0;

export class ProductSection extends Section {
  onOptionChanged = new MinSignal<number>();

  preInit(root: Element): void {
    super.preInit(root, 'product');
    _domContainer = this.domContainer;
    _domInner = _domContainer.querySelector('.section__inner') as Element;
    _domHero = _domContainer.querySelector('#product-hero') as HTMLElement;
    _domHeroInner = _domContainer.querySelector('#product-hero-inner') as HTMLElement;
    _domHeroTitleWrapper = _domHeroInner.querySelector('#product-hero-title-wrapper') as HTMLElement;
    _domHeroTitle = _domHeroInner.querySelector('#product-hero-title') as HTMLElement;
    _domDetails = _domContainer.querySelector('#product-details') as HTMLElement;
    _domDetailsInner = _domDetails.querySelector('#product-details-inner') as HTMLElement;
    _domHeroCaption = _domContainer.querySelector('#product-hero-caption') as HTMLElement;
    _domHeroOptions = _domContainer.querySelector('#product-hero-options') as HTMLElement;
    _domHeroOptionItemList = _domHeroOptions.querySelectorAll('.product-hero-option-item');
    for (let i = 0; i < _domHeroOptionItemList.length; i++) {
      _domHeroOptionItemList[i].addEventListener('click', this.handleHeroOptionClick.bind(this));
    }
    this.onOptionChanged.add(this.onOptionChange.bind(this));
    _domDetailsTitleList = _domDetails.querySelectorAll('#product-details-title-wrapper span');
    _domDetailsDescList = _domDetails.querySelectorAll('#product-details-desc-wrapper div');
    _domDetailsExtraIconList = _domDetails.querySelectorAll('.product-details-extra-item svg');
    const extraSubItems: NodeListOf<SplitElement> = _domDetails.querySelectorAll(
      '.product-details-extra-item div',
    );
    for (let i = 0; i < extraSubItems.length; i++) {
      const optionIdx = i % 3;
      if (!_domDetailsExtraItemListSubItemList[optionIdx]) {
        _domDetailsExtraItemListSubItemList[optionIdx] = [];
      }
      _domDetailsExtraItemListSubItemList[optionIdx].push(extraSubItems[i]);
    }
    for (let i = 0; i < _optionActiveRatios.length; i++) {
      const title = _domDetailsTitleList[i];
      const desc = _domDetailsDescList[i];
      const subItems = _domDetailsExtraItemListSubItemList[i];
      title.__splitText = SplitText.create(title, { type: 'lines,chars', autoSplit: false });
      desc.__splitText = SplitText.create(desc, { type: 'lines,chars', autoSplit: false });
      for (let j = 0; j < subItems.length; j++) {
        subItems[j].__splitText = SplitText.create(subItems[j], {
          type: 'lines,chars',
          autoSplit: false,
        });
      }
    }
    _domCompare = _domContainer.querySelector('#product-compare') as HTMLElement;
  }

  init(): void {
    super.init();
  }

  onOptionChange(option: number): void {
    for (let i = 0; i < _domHeroOptionItemList.length; i++) {
      _domHeroOptionItemList[i].classList.toggle('is-active', i === option);
    }
  }

  handleHeroOptionClick(e: Event): void {
    const option = parseInt((e.currentTarget as HTMLElement).dataset.id!, 10);
    if (_optionIndex !== option) {
      _optionIndex = option;
      this.onOptionChanged.dispatch(option);
    }
  }

  resize(width: number, height: number): void {
    super.resize(width, height);
    const rect = _domHeroTitleWrapper.getBoundingClientRect();
    _titleHeight = rect.height;
    for (let i = 0; i < _optionActiveRatios.length; i++) {
      const subItems = _domDetailsExtraItemListSubItemList[i];
      _domDetailsTitleList[i].__splitText!.split({});
      _domDetailsDescList[i].__splitText!.split({});
      for (let j = 0; j < subItems.length; j++) subItems[j].__splitText!.split({});
    }
  }

  update(dt: number): void {
    super.update(dt);
    const useMobileLayout = properties.useMobileLayout;
    const containerRange = scrollManager.getDomRange(_domContainer);
    const r = containerRange.showScreenOffset;
    const testimoniesRange = scrollManager.getDomRange(testimoniesSection.domContainer);
    const detailsRange = scrollManager.getDomRange(_domDetails);
    const innerRange = scrollManager.getDomRange(_domInner);
    const compareRange = scrollManager.getDomRange(_domCompare);
    const c = detailsRange.height / properties.viewportHeight;
    const _ = (detailsRange.bottom - containerRange.top) / properties.viewportHeight;
    const x = (properties.viewportHeight / 2 - detailsRange.height) / properties.viewportHeight / 2;
    const p = clamp(r - (_ + x), 0, 0.5);
    const b = containerRange.screenY - testimoniesRange.screenY;
    stackScene.animation = fit(
      r,
      -b / properties.viewportHeight + 1,
      1,
      stackScene.animation,
      2,
    );
    stackScene.animation = fit(r, 1, _ + x, stackScene.animation, 3);
    if (useMobileLayout) {
      stackScene.animation = fit(
        r,
        _ + x,
        containerRange.height / properties.viewportHeight + 1,
        stackScene.animation,
        4,
      );
    } else {
      stackScene.animation = fit(
        r,
        _ + x,
        (compareRange.screenY - innerRange.screenY) / properties.viewportHeight + 1,
        stackScene.animation,
        4,
      );
    }
    const mobileShift = useMobileLayout ? -0.19 : 0;
    stackScene.viewOffsetY = fit(r, -0.5, 0, stackScene.viewOffsetY, -0.25);
    stackScene.viewOffsetY = fit(r, 0, 1, stackScene.viewOffsetY, 0);
    stackScene.viewOffsetY = fit(
      r,
      1,
      _ + x,
      stackScene.viewOffsetY,
      -(r - _) + 0.5 - c / 2 + mobileShift,
      ease.sineIn,
    );
    stackScene.viewOffsetY += p;
    const heroVisible = r > 0 && stackScene.animation < 4;
    _domHero.style.visibility = heroVisible ? 'visible' : 'hidden';
    _domDetails.style.visibility = heroVisible ? 'visible' : 'hidden';
    if (heroVisible) {
      const M = fit(stackScene.animation, 2, 3, 0, 1);
      for (let i = 0, count = _domDetailsTitleList.length; i < count; i++) {
        const ratio = i / (count - 1);
        const option = _domHeroOptionItemList[i];
        const show = fit(M, 0.2 + ratio * 0.3, 0.6 + ratio * 0.3, 0, 1);
        option.style.opacity = String(show);
        option.style.transform = `scale(${fit(show, 0, 1, 0.5, 1, ease.backOut)})`;
        option.style.pointerEvents = show > 0.75 ? 'auto' : 'none';
      }
      const titleScale = fit(r, 1, _ + x, 1, 0.8);
      const titleShift = (_titleHeight * (1 - titleScale)) / 2;
      const mobilePad = useMobileLayout ? 0.06 : 0;
      let heroScroll = Math.max(0, r - 1) * properties.viewportHeight;
      heroScroll -= fit(r, _ - c, _ + x, 0, (c + x) / 2 + mobilePad) * properties.viewportHeight;
      heroScroll -= Math.max(0, r - (_ + x)) * properties.viewportHeight;
      heroScroll += p * properties.viewportHeight;
      _domHeroCaption.style.transform = `translate3d(0, ${titleShift}px, 0)`;
      _domHeroOptions.style.transform = `translate3d(0, ${-titleShift}px, 0)`;
      _domHeroTitle.style.transform = `scale(${titleScale}) `;
      _domHeroInner.style.transform = `translate3d(0, ${heroScroll}px, 0) translate3d(0, -50%, 0)`;
      _domDetailsInner.style.transform = `translate3d(0, ${(p + (useMobileLayout ? 0.06 : 0)) * properties.viewportHeight}px, 0)`;
      const N = fit(M, 0.75, 1, 0, 1);
      for (let i = 0, count = _domDetailsExtraIconList.length; i < count; i++) {
        const ratio = i / (count - 1);
        const show = fit(N, ratio * 0.2, ratio * 0.2 + 0.8, 0, 1);
        const icon = _domDetailsExtraIconList[i];
        icon.style.transform = `scale(${fit(show, 0, 1, 0.01, 1, ease.backOut)}) translateY(-50%)`;
        icon.style.opacity = String(fit(show, 0, 0.5, 0, 1));
      }
      for (let i = 0; i < _optionActiveRatios.length; i++) {
        const k = (_optionActiveRatios[i] = saturate(
          _optionActiveRatios[i] + dt * (i === _optionIndex ? 2 : -1e5),
        ));
        const title = _domDetailsTitleList[i];
        const desc = _domDetailsDescList[i];
        const subItems = _domDetailsExtraItemListSubItemList[i];
        let subShow: number;
        const slideIn = fit(k, 0, 1, -1, 0, ease.cubicOut);
        const slideOut = fit(k, 0, 1, 1, 0, ease.cubicOut);
        const pointerEvents = k === 1 ? 'auto' : 'none';
        title.style.transform = `translate3d(${slideIn}em, 0, 0)`;
        title.style.pointerEvents = pointerEvents;
        for (let j = 0, charCount = title.__splitText!.chars.length; j < charCount; j++) {
          const charRatio = j / (charCount - 1);
          const char = title.__splitText!.chars[j] as HTMLElement;
          char.style.opacity = String(fit(k * N, charRatio * 0.4, charRatio * 0.4 + 0.6, 0, 1));
        }
        desc.style.transform = `translate3d(${slideIn}em, 0, 0)`;
        desc.style.pointerEvents = pointerEvents;
        for (let j = 0, charCount = desc.__splitText!.chars.length; j < charCount; j++) {
          const charRatio = j / (charCount - 1);
          const char = desc.__splitText!.chars[j] as HTMLElement;
          char.style.opacity = String(fit(k * N, charRatio * 0.4, charRatio * 0.4 + 0.6, 0, 1));
        }
        for (let j = 0, subCount = subItems.length; j < subCount; j++) {
          const subRatio = j / (subCount - 1);
          subShow = fit(N, subRatio * 0.2, subRatio * 0.2 + 0.8, 0, 1);
          const subItem = subItems[j];
          subItem.style.transform = `translate3d(${slideOut}em, 0, 0)`;
          subItem.style.pointerEvents = pointerEvents;
          for (let s = 0, charCount = subItem.__splitText!.chars.length; s < charCount; s++) {
            const charRatio = s / (charCount - 1);
            const char = subItem.__splitText!.chars[s] as HTMLElement;
            char.style.opacity = String(
              fit(k * subShow, charRatio * 0.4, charRatio * 0.4 + 0.6, 0, 1),
            );
          }
        }
      }
      if (stackScene.animation > 2.5 && stackScene.animation < 4) {
        sketches.isActive = true;
        _sketchTime += dt;
        _sketchShowRatio = Math.min(_sketchShowRatio + dt * 0.75, 1);
        const compareFade = fit(p, 0.25, 0.5, 0, 1);
        const opacityBase = fit(stackScene.animation, 2.5, 3, 0, 1) * (1 - compareFade);
        sketches.offsetX = 0;
        sketches.offsetY = stackScene.viewOffsetY;
        const isDeviceReady = cameraControls.isDeviceReady;
        const mouseX =
          (properties.viewportWidth / properties.viewportHeight) *
          (isDeviceReady
            ? cameraControls.deviceVirtualMouseXY.x
            : input.easedMouseDynamics.default.value.x);
        const mouseY = input.easedMouseDynamics.default.value.y + sketches.offsetY;
        const list = sketches.list;
        const radius = useMobileLayout ? 0.5 : 0.9;
        const scaleBase = useMobileLayout ? 0.5 : 1;
        for (let i = 0; i < list.length; i++) {
          const orderIdx = _sketchOrders.indexOf(i);
          const sketch = list[i];
          if (orderIdx !== -1) {
            const orderRatio = orderIdx / (_sketchOrders.length - 1);
            const show = fit(_sketchShowRatio, orderRatio * 0.15, 0.85 + orderRatio * 0.15, 0, 1);
            const angle = Math.PI * 0.5 - (orderRatio - 0.5) * 3.1;
            const dist = fit(show, 0, 1, 0.1, radius, ease.backOut);
            const posX = Math.cos(angle) * dist;
            const posY = Math.pow(Math.sin(angle), 0.25) * dist * 0.75;
            const dx = mouseX - posX;
            const dy = isDeviceReady ? 0 : mouseY - posY;
            const mouseDist = Math.sqrt(dx * dx + dy * dy);
            const proximity = fit(mouseDist, 1.3, 0.3, 0, 1);
            sketch.position.set(posX - dx * proximity * 0.1, posY - dy * proximity * 0.1, 0);
            sketch.rotation.z =
              _sketchTransforms[orderIdx].rot +
              proximity * dx * 0.1 +
              Math.sin(_sketchTime * 0.3 + orderRatio * Math.PI * 2) * 0.1;
            sketch.scale.setScalar(
              fit(
                _sketchShowRatio,
                0,
                1,
                0.01,
                _sketchTransforms[orderIdx].scale * fit(proximity, 0, 1, 1, 1.05),
                ease.backOut,
              ) *
                (1 + Math.sin(_sketchTime * 0.4 + orderRatio * Math.PI * 2) * 0.1) *
                scaleBase,
            );
            sketch.opacity =
              fit(
                _sketchShowRatio,
                0,
                1,
                fit(_sketchShowRatio, 0, 0.3, 0, 1),
                fit(proximity, 0, 1, 0, 0.6),
              ) * opacityBase;
            sketch.blur = fit(proximity, 0, 1, 0.5 * _sketchShowRatio, 0, ease.cubicOut);
          } else {
            sketch.opacity = 0;
          }
        }
      } else {
        _sketchShowRatio = 0;
        _sketchTime = 0;
      }
    } else {
      _sketchShowRatio = 0;
      _sketchTime = 0;
    }
  }
}

export const productSection = new ProductSection();