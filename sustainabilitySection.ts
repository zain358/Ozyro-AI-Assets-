import { Alignment, Fit, Layout, Rive } from '@rive-app/canvas';
import { SplitText } from 'gsap/SplitText';
import { Color } from 'three';
import { ease } from '../core/ease';
import { fit } from '../core/math';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { siteFooter } from '../SiteFooter';
import { siteHeader } from '../SiteHeader';
import {
  sustainabilityBg,
  sustainabilityScene,
  sustainabilityText,
} from '../scenes/sustainabilityScene';

// Source RiveAnimation (pretty 28000-28036), on the standard rive canvas API.
export class RiveAnimation {
  rive: Rive | null = null;
  canvas: HTMLCanvasElement;
  artboard: string;
  src: string;

  constructor(src: string, artboard: string, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.artboard = artboard;
    this.src = src;
  }

  init(): void {
    this.rive = new Rive({
      src: this.src,
      canvas: this.canvas,
      artboard: this.artboard,
      stateMachines: 'State Machine 1',
      autoplay: false,
      enableRiveAssetCDN: true,
      shouldDisableRiveListeners: false,
      isTouchScrollEnabled: false,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        this.rive!.resizeDrawingSurfaceToCanvas();
      },
    });
  }

  startAnimation(): void {
    this.rive!.play('State Machine 1');
  }

  onResize(): void {
    this.rive!.resizeDrawingSurfaceToCanvas();
  }

  reset(): void {
    this.rive?.cleanup();
    (this.canvas.getContext('2d') as CanvasRenderingContext2D).clearRect(
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
    this.init();
  }
}

const bodyStyles = window.getComputedStyle(document.body);
const _c = new Color();

type RiveCanvas = HTMLCanvasElement & {
  _rive: RiveAnimation;
  _isCanvasInview: boolean;
  _isCanvasOutview: boolean;
};

type SplitItem = HTMLElement & {
  __titleSplitText?: SplitText;
  __descSplitText?: SplitText;
};

let _domContainer: HTMLElement;
let _domHero: HTMLElement;
let _domHeroInner: Element;
let _domHeroTagline: HTMLElement;
let _domHeroTitlePre: HTMLElement;
let _domHeroTitleMain: Element;
let _domHeroDesc: HTMLElement;
let _domHeroDescSplitText: SplitText;
let _domRiveCanvasHarvesting: RiveCanvas;
let _domRiveCanvasText: RiveCanvas;
let _domItemList: NodeListOf<SplitItem>;

export class SustainabilitySection {
  whiteColor = new Color();
  blackColor = new Color();
  riveAnimationHarvesting!: RiveAnimation;
  riveAnimationText!: RiveAnimation;

  preInit(root: Element): void {
    _domContainer = root.querySelector('#sustainability') as HTMLElement;
    _domHeroTagline = _domContainer.querySelector('#sustainability-tagline') as HTMLElement;
    _domHeroTitlePre = _domContainer.querySelector('#sustainability-title-pre') as HTMLElement;
    _domHero = _domContainer.querySelector('#sustainability-hero') as HTMLElement;
    _domHeroInner = _domHero.querySelector('#sustainability-hero-inner') as Element;
    _domHeroTitleMain = _domHero.querySelector('#sustainability-title-main') as Element;
    _domHeroDesc = _domContainer.querySelector('#sustainability-desc') as HTMLElement;
    // Source creates the split twice (lines,chars then lines,words,chars);
    // the second wins.
    _domHeroDescSplitText = SplitText.create(_domHeroDesc, {
      type: 'lines,chars',
      autoSplit: false,
    });
    _domHeroDescSplitText = SplitText.create(_domHeroDesc, {
      type: 'lines,words,chars',
      autoSplit: false,
    });
    _domItemList = _domContainer.querySelectorAll('.sustainability-item');
    for (let i = 0, count = _domItemList.length; i < count; i++) {
      const item = _domItemList[i];
      item.__titleSplitText = SplitText.create(
        item.querySelector('.sustainability-item-title') as HTMLElement,
        { type: 'lines,chars', autoSplit: false },
      );
      item.__descSplitText = SplitText.create(
        item.querySelector('.sustainability-item-desc') as HTMLElement,
        { type: 'lines,chars', autoSplit: false },
      );
    }
    _domRiveCanvasHarvesting = _domContainer.querySelector(
      '#sustainability-rive-canvas-harvesting',
    ) as RiveCanvas;
    this.riveAnimationHarvesting = new RiveAnimation(
      '/rive/oryzo.riv',
      'harvesting',
      _domRiveCanvasHarvesting,
    );
    this.riveAnimationHarvesting.init();
    _domRiveCanvasHarvesting._rive = this.riveAnimationHarvesting;
    _domRiveCanvasHarvesting._isCanvasInview = false;
    _domRiveCanvasHarvesting._isCanvasOutview = false;
    _domRiveCanvasText = _domContainer.querySelector(
      '#sustainability-rive-canvas-text',
    ) as RiveCanvas;
    this.riveAnimationText = new RiveAnimation('/rive/oryzo.riv', 'text', _domRiveCanvasText);
    this.riveAnimationText.init();
    _domRiveCanvasText._rive = this.riveAnimationText;
    _domRiveCanvasText._isCanvasInview = false;
    _domRiveCanvasText._isCanvasOutview = false;
  }

  init(): void {
    this.riveAnimationHarvesting.startAnimation();
    this.riveAnimationText.startAnimation();
  }

  resize(): void {
    this.whiteColor.setStyle(bodyStyles.getPropertyValue('--color-white'));
    this.blackColor.setStyle(bodyStyles.getPropertyValue('--color-black'));
    _domHeroDescSplitText.split({ type: 'lines,words,chars', autoSplit: false });
    this.riveAnimationHarvesting.onResize();
    this.riveAnimationText.onResize();
  }

  private checkRiveCanvas(canvas: RiveCanvas): void {
    const range = scrollManager.getDomRange(canvas);
    const opacity = fit(range.showScreenOffset, 0.1, 0.5, 0, 1);
    canvas.style.opacity = String(opacity);
    const inview = range.showScreenOffset > 0.25 && range.hideScreenOffset < -0.25;
    if (canvas._isCanvasInview !== inview) {
      canvas._isCanvasInview = inview;
      if (inview) canvas._rive.startAnimation();
    }
    const outview = range.showScreenOffset < 0 || range.hideScreenOffset > 0;
    if (canvas._isCanvasOutview !== outview) {
      canvas._isCanvasOutview = outview;
      if (outview) canvas._rive.reset();
    }
  }

  update(_dt: number): void {
    const useMobileLayout = properties.useMobileLayout;
    const containerRange = scrollManager.getDomRange(_domContainer);
    const r = containerRange.showScreenOffset;
    const o = containerRange.hideScreenOffset;
    const heroInnerRange = scrollManager.getDomRange(_domHeroInner);
    const titleMainRange = scrollManager.getDomRange(_domHeroTitleMain);
    const transition = Math.max(sustainabilityScene.animation - 2, 0);
    const heroScroll = Math.min(4, r - 1) * properties.viewportHeight;
    _c.copy(this.whiteColor).lerp(this.blackColor, transition);
    sustainabilityScene.isActive = r >= -1 && o < 0;
    sustainabilityScene.animation = fit(r, -1, 0, 0, 1);
    sustainabilityScene.animation = fit(r, 0.25, 2.5, sustainabilityScene.animation, 2);
    sustainabilityScene.animation = fit(r, 3, 3.5, sustainabilityScene.animation, 3);
    const heroVisible = r >= 1.8 && o < 0;
    _domHero.style.visibility = heroVisible ? 'visible' : 'hidden';
    _domContainer.style.backgroundColor = r > 6 ? '#ffedd7' : 'transparent';
    if (r > 4.5) {
      const scrollRatio = fit(r, 4.5, 5, 1, 0);
      if (useMobileLayout) siteFooter.setScroll('right', 0, scrollRatio);
      else siteFooter.setScroll('center', 0, scrollRatio);
    }
    if (heroVisible) {
      const taglineShow = fit(r, 1.8, 2.5, 0, 1);
      _domHeroTagline.style.transform = `translateY(${fit(taglineShow, 0, 1, -1, 0, ease.cubicOut)}em)`;
      _domHeroTagline.style.opacity = String(taglineShow);
      const preShow = fit(r, 2, 3, 0, 1);
      _domHeroTitlePre.style.transform = useMobileLayout
        ? `translateY(${fit(preShow, 0, 1, -0.5, 0, ease.cubicOut)}em)`
        : `translateX(${fit(preShow, 0, 1, -20, 0, ease.cubicOut)}%)`;
      _domHeroTitlePre.style.opacity = String(preShow);
      const descShow = fit(r, 1.8, 2.5, 0, 1);
      _domContainer.style.color = '#' + _c.getHexString();
      for (let c = 0, count = _domHeroDescSplitText.chars.length; c < count; c++) {
        const ratio = c / (count - 1);
        const char = _domHeroDescSplitText.chars[c] as HTMLElement;
        const reveal = fit(descShow, ratio * 0.6, ratio * 0.6 + 0.4, 0, 1, ease.cubicOut);
        char.style.transform = `translate3d(0,${(1 - reveal) * 0.5}em, 0)`;
        char.style.opacity = String(fit(reveal, 0, 1, 0, 1));
      }
      if (r > 3.3 && o * properties.viewportHeight + 40 < 0) {
        siteHeader.setTheme('light');
        siteFooter.setTheme('light');
      }
      for (let i = 0, count = _domItemList.length; i < count; i++) {
        const item = _domItemList[i];
        const itemOffset =
          scrollManager.getDomRange(item).showScreenOffset - (useMobileLayout ? 0 : 0.1 * i);
        const titleShow = fit(itemOffset, 0.15, 0.5, 0, 1);
        const descShowItem = fit(
          itemOffset - (i > 0 ? (useMobileLayout ? 0.3 : 0.05) : 0),
          0.3,
          0.6,
          0,
          1,
        );
        const titleSplit = item.__titleSplitText!;
        const descSplit = item.__descSplitText!;
        for (let c = 0, charCount = titleSplit.chars.length; c < charCount; c++) {
          const ratio = c / (charCount - 1);
          const char = titleSplit.chars[c] as HTMLElement;
          char.style.opacity = String(fit(titleShow, ratio * 0.6, ratio * 0.6 + 0.3, 0, 1));
        }
        for (let c = 0, charCount = descSplit.chars.length; c < charCount; c++) {
          const ratio = c / (charCount - 1);
          const char = descSplit.chars[c] as HTMLElement;
          char.style.opacity = String(fit(descShowItem, ratio * 0.6, ratio * 0.6 + 0.4, 0, 1));
        }
      }
    }
    this.checkRiveCanvas(_domRiveCanvasHarvesting);
    this.checkRiveCanvas(_domRiveCanvasText);
    sustainabilityText.color.copy(_c);
    sustainabilityText.transitionRatio = transition;
    const textScroll = Math.max(0, r - 1) * properties.viewportHeight - Math.max(0, heroScroll);
    sustainabilityText.rect.set(
      titleMainRange.screenX,
      titleMainRange.screenY - heroInnerRange.screenY - textScroll,
      titleMainRange.width,
      titleMainRange.height,
    );
    sustainabilityBg.color.copy(this.whiteColor).lerp(this.blackColor, 1 - transition);
    sustainabilityBg.transitionRatio = transition;
    sustainabilityBg.screenOffsetY = (-textScroll * 1.25) / properties.viewportHeight;
  }
}

export const sustainabilitySection = new SustainabilitySection();