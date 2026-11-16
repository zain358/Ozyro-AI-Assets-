import { ease } from '../core/ease';
import { clamp, fit, saturate } from '../core/math';
import { properties } from '../core/properties';
import * as settings from '../core/settings';
import { wearableMagazine } from './wearableMagazine';

export class RafVideo {
  video: HTMLVideoElement;
  desiredPlaying = false;
  fromStart = true;
  private _playInFlight: Promise<void> | null = null;
  private _pauseQueuedForPromise: Promise<void> | null = null;
  private _state: string;
  private _onPlaying: () => void;
  private _onPause: () => void;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this._state = video.paused ? 'paused' : 'playing';
    this._onPlaying = () => {
      this._state = 'playing';
    };
    this._onPause = () => {
      this._state = 'paused';
    };
    video.addEventListener('playing', this._onPlaying);
    video.addEventListener('pause', this._onPause);
    video.addEventListener('ended', this._onPause);
  }

  setPlaying(playing: boolean): void {
    this.desiredPlaying = !!playing;
  }

  requestFromStart(): void {
    this.fromStart = true;
  }

  get isPaused(): boolean {
    return this.video.paused;
  }

  get state(): string {
    return this._state;
  }

  update(): void {
    const video = this.video;
    if (this._playInFlight) {
      this._state = 'pendingPlay';
      if (!this.desiredPlaying && this._pauseQueuedForPromise !== this._playInFlight) {
        this._pauseQueuedForPromise = this._playInFlight;
        this._playInFlight.finally(() => {
          if (this._pauseQueuedForPromise === this._playInFlight) {
            this._pauseQueuedForPromise = null;
          }
          this._playInFlight = null;
          if (!this.desiredPlaying && !video.paused) video.pause();
          this._state = video.paused ? 'paused' : 'playing';
        });
      }
      return;
    }
    if (this.desiredPlaying) {
      if (video.paused) {
        if (this.fromStart && video.readyState >= 1) {
          try {
            video.currentTime = 0;
          } catch {
            // ignored, matching source
          }
        }
        if (this.fromStart && video.readyState < 1) {
          this._state = 'paused';
          return;
        }
        const promise = video.play();
        if (promise && typeof promise.then === 'function') {
          this._playInFlight = promise;
          this._state = 'pendingPlay';
          promise
            .then(() => {
              this._playInFlight = null;
              this._state = 'playing';
            })
            .catch(() => {
              this._playInFlight = null;
              this._state = video.paused ? 'paused' : 'playing';
            });
        }
      } else {
        this._state = 'playing';
      }
    } else {
      if (!video.paused) video.pause();
      this._state = 'paused';
    }
  }

  destroy(): void {
    const video = this.video;
    video.removeEventListener('playing', this._onPlaying);
    video.removeEventListener('pause', this._onPause);
    video.removeEventListener('ended', this._onPause);
  }
}

export class WearableGalleryItem {
  static INNER_ROTATION = (-10 * Math.PI) / 180;
  static INNER_SCALE = 1.2;

  index: number;
  domItem: HTMLElement;
  domItemInner: HTMLElement;
  domLeftThumb: HTMLElement;
  domLeftThumbImg: HTMLImageElement | null = null;
  domRightThumb: HTMLElement;
  domRightThumbImg: HTMLImageElement | null = null;
  domWarning: HTMLElement | null = null;
  domBikiniOverlay: HTMLElement | null = null;
  domBikiniSendBtn: HTMLElement | null = null;
  isAdded = false;
  isLoaded = false;
  id: string;
  type: string;
  fullFile: string;
  thumbFile: string;
  showRatio = 0;
  hideRatio = 0;
  animation = 0;
  rafVideo: RafVideo | null = null;

  constructor(
    index: number,
    domItem: HTMLElement,
    leftThumbsContainer: HTMLElement,
    rightThumbsContainer: HTMLElement,
  ) {
    this.index = index;
    this.domItem = domItem;
    this.domItemInner = domItem.querySelector('.wearable-gallery-item-inner') as HTMLElement;
    this.id = domItem.dataset.id!;
    this.type = domItem.dataset.type!;
    const file = domItem.dataset.file!;
    this.fullFile = settings.IMAGE_PATH + 'wearable-gallery/' + file;
    this.thumbFile = settings.IMAGE_PATH + 'wearable-gallery/thumbs/' + file;
    this.domLeftThumb = document.createElement('div');
    this.domLeftThumb.className = 'wearable-gallery-thumb-item';
    leftThumbsContainer.appendChild(this.domLeftThumb);
    this.domRightThumb = document.createElement('div');
    this.domRightThumb.className = 'wearable-gallery-thumb-item';
    rightThumbsContainer.appendChild(this.domRightThumb);
    if (this.id === 'yoga') this._initYoga();
    else if (this.id === 'bikini') this._initBikini();
  }

  private _initYoga(): void {
    this.domWarning = this.domItem.querySelector('#wearable-gallery-warning');
  }

  private _initBikini(): void {
    this.domBikiniOverlay = this.domItem.querySelector('#wearable-gallery-bikini-overlay');
    this.domBikiniSendBtn = this.domItem.querySelector('.btn');
    this.isAdded = false;
    this.domBikiniSendBtn!.addEventListener('click', () => {
      this._setBikini(true);
    });
  }

  private _setBikini(added: boolean): void {
    this.isAdded = added;
    this.domItem.classList.toggle('is-added', added);
  }

  private _addImage(url: string, parent: HTMLElement, autoMobile = false): HTMLImageElement {
    const img = new Image();
    url = autoMobile && properties.isMobile ? properties.getMobileUrl(url) : url;
    img.src = url;
    parent.appendChild(img);
    return img;
  }

  private _addVideo(url: string, parent: HTMLElement): RafVideo {
    const video = document.createElement('video');
    video.muted = true;
    (video as unknown as Record<string, unknown>).playsinline = true;
    video.setAttribute('playsinline', '');
    video.loop = true;
    video.src = url.replace('.webp', '.mp4');
    parent.appendChild(video);
    return (this.rafVideo = new RafVideo(video));
  }

  load(): void {
    if (this.type !== 'intro') {
      if (this.type === 'video') this._addVideo(this.fullFile, this.domItemInner);
      else if (this.type !== 'outro') this._addImage(this.fullFile, this.domItemInner, true);
    }
    if (this.id === 'bikini') {
      this._addImage(this.fullFile.replace('bikini', 'bikini_on'), this.domBikiniOverlay!, true);
      this.thumbFile = this.thumbFile.replace('bikini', 'bikini_on');
    }
    if (!properties.isMobile) {
      this.domLeftThumbImg = this._addImage(this.thumbFile, this.domLeftThumb);
      this.domRightThumbImg = this._addImage(this.thumbFile, this.domRightThumb);
    }
  }

  update(dt: number, _indexOffset: number, rawIndexOffset: number): void {
    const visible = this.showRatio > 0 && this.hideRatio < 1;
    if (this.type === 'video' && this.rafVideo) {
      this.rafVideo.setPlaying(visible);
      this.rafVideo.update();
    }
    if (visible) {
      if (this.id === 'yoga') {
        this.animation = Math.min(2.5, this.animation + dt);
        this.domWarning!.style.transform =
          `translate3d(0, ${fit(this.animation, 1, 2, 125, 0, ease.expoOut)}%, 0)`;
      }
      const transit =
        this.showRatio - 1 + (this.index < wearableGallery.itemList.length - 1 ? this.hideRatio : 0);
      this.domItemInner.style.transform =
        `rotate(${transit * WearableGalleryItem.INNER_ROTATION}rad) scale(${1 + Math.abs(transit) * (WearableGalleryItem.INNER_SCALE - 1)})`;
    } else {
      this.animation = 0;
    }
    if (this.id === 'outro') {
      const magazineHide = fit(rawIndexOffset, 0, 3.2, 0, 1);
      wearableMagazine.showRatio = this.showRatio;
      wearableMagazine.hideRatio = magazineHide;
    }
    if (this.id === 'bikini' && this.isAdded && !visible) this._setBikini(false);
    this.domItem.style.visibility = visible ? 'visible' : 'hidden';
  }
}

export class WearableGallery {
  domContainer: HTMLElement | null = null;
  domMoveContainer: HTMLElement | null = null;
  domLeftThumbsContainer!: HTMLElement;
  domRightThumbsContainer!: HTMLElement;
  domLeftThumbsMoveContainer!: HTMLElement;
  domRightThumbsMoveContainer!: HTMLElement;
  itemList: WearableGalleryItem[] = [];
  itemWidth = 0;
  itemHeight = 0;
  thumbItemWidth = 0;
  thumbItemHeight = 0;
  thumbItemGap = 0;
  rawIndex = 0;
  index = 0;
  showRatio = 0;
  hideRatio = 0;
  offsetX = 0;

  preInit(root: Element): void {
    this.domContainer = root.querySelector('#wearable-gallery-wrapper') as HTMLElement;
    this.domMoveContainer = root.querySelector('#wearable-gallery-move-container') as HTMLElement;
    this.domLeftThumbsContainer = root.querySelector(
      '.wearable-gallery-thumbs-wrapper.is-left',
    ) as HTMLElement;
    this.domRightThumbsContainer = root.querySelector(
      '.wearable-gallery-thumbs-wrapper.is-right',
    ) as HTMLElement;
    this.domLeftThumbsMoveContainer = this.domLeftThumbsContainer.querySelector(
      '.wearable-gallery-thumbs-move-container',
    ) as HTMLElement;
    this.domRightThumbsMoveContainer = this.domRightThumbsContainer.querySelector(
      '.wearable-gallery-thumbs-move-container',
    ) as HTMLElement;
    const items: NodeListOf<HTMLElement> =
      this.domMoveContainer.querySelectorAll('.wearable-gallery-item');
    for (let i = 0; i < items.length; i++) {
      this.itemList.push(
        new WearableGalleryItem(
          i,
          items[i],
          this.domLeftThumbsMoveContainer,
          this.domRightThumbsMoveContainer,
        ),
      );
    }
  }

  init(): void {}

  start(): void {
    for (let i = 0; i < this.itemList.length; i++) this.itemList[i].load();
  }

  resize(_width?: number, _height?: number): void {
    const rect = this.domContainer!.getBoundingClientRect();
    this.itemWidth = rect.width;
    this.itemHeight = rect.height;
    const thumb0 = this.itemList[0].domLeftThumb.getBoundingClientRect();
    const thumb1 = this.itemList[1].domLeftThumb.getBoundingClientRect();
    this.thumbItemWidth = thumb0.width;
    this.thumbItemHeight = thumb0.height;
    this.thumbItemGap = thumb1.left - thumb0.right;
  }

  update(dt: number): void {
    const count = this.itemList.length;
    const index = this.index;
    const clamped = clamp(index, 0, count - 1);
    const offsetX = (this.offsetX = clamped * this.itemWidth);
    this.domMoveContainer!.style.transform = `translate3d(-${offsetX}px, 0, 0)`;
    const thumbOffset = clamped * (this.thumbItemWidth + this.thumbItemGap);
    this.domLeftThumbsMoveContainer.style.transform = `translate3d(-${thumbOffset}px, -50%, 0)`;
    this.domRightThumbsMoveContainer.style.transform = `translate3d(-${thumbOffset}px, -50%, 0)`;
    const thumbsOpacity = fit(index, -3, -2, 0, 1) * fit(index, count, count + 1, 1, 0);
    this.domLeftThumbsContainer.style.opacity = String(thumbsOpacity);
    this.domRightThumbsContainer.style.opacity = String(thumbsOpacity);
    const showRatio = (this.showRatio = saturate(this.showRatio + (index > -2 ? 1 : -1) * dt));
    const hideRatio = (this.hideRatio = saturate(
      this.hideRatio + (index < count - 0.75 ? -1 : 1) * dt,
    ));
    this.domContainer!.style.visibility =
      index > 0 && this.index - (count + 2.2) < 0 ? 'visible' : 'hidden';
    if (properties.hasInitialized) {
      if (!properties.isMobile && thumbsOpacity) {
        for (let i = 0; i < count - 1; i++) {
          const ratio = i / (count - 2);
          const leftImg = this.itemList[i].domLeftThumbImg;
          const rightImg = this.itemList[i + 1].domRightThumbImg;
          if (leftImg) {
            const slide = fit(hideRatio, ratio * 0.2, 0.8 + ratio * 0.2, 0, 1, ease.cubicInOut);
            leftImg.style.transform =
              `translate3d(${(-slide * properties.viewportWidth) / 2}px, 0, 0)`;
          }
          if (rightImg) {
            const slide = fit(showRatio, ratio * 0.2, 0.8 + ratio * 0.2, 1, 0, ease.cubicInOut);
            rightImg.style.transform =
              `translate3d(${(slide * properties.viewportWidth) / 2}px, 0, 0)`;
          }
        }
      }
      for (let i = 0; i < count; i++) {
        const item = this.itemList[i];
        const isLast = i === count - 1;
        item.showRatio = fit(this.index, i - 1, i, 0, 1);
        item.hideRatio = fit(this.index, i + (isLast ? 2.2 : 0), i + 1 + (isLast ? 2.2 : 0), 0, 1);
        item.update(dt, this.index - i, this.rawIndex - i);
      }
    }
  }
}

export const wearableGallery = new WearableGallery();