import Player from '@vimeo/player';
import { ease } from './core/ease';
import { input } from './core/input';
import { saturate } from './core/math';
import { properties } from './core/properties';

const VIDEO_LIST = {
  MAIN_VIDEO_REEL: 'https://player.vimeo.com/video/1174820580?h=5aaa6219d2',
};

export class VideoOverlay {
  domVideoContainer!: HTMLElement;
  domVideoCursor: HTMLElement | null = null;
  domVimeoEntryPoint!: HTMLElement;
  domVideoMuteBtn!: HTMLElement;
  domMobileCloseButton!: HTMLElement;
  domVideoInner!: HTMLElement;
  videoPlayer: Player | null = null;
  isOpened = false;
  openedRatio = 0;
  isVideoMuted = false;
  isControlsHover = false;
  isVideoHover = false;
  isVideoPlaying = false;
  isVideoReady = false;
  videoPercentageWatched = 0;
  videoDuration = 0;
  videoWidth = 1920;
  videoHeight = 1080;
  hasInitialized = false;
  currentVideoId: string | null = null;
  isPrefetching = false;
  isPrefetched = false;
  usesNativePlayer = false;
  playingRatio = 0;

  preInit(): void {
    if (this.hasInitialized) return;
    this.domVideoContainer = document.querySelector('#video-overlay') as HTMLElement;
    this.domVideoCursor = document.querySelector('#video-overlay-cursor');
    this.domVimeoEntryPoint = document.querySelector('#video-overlay__vimeo-video') as HTMLElement;
    this.domVideoMuteBtn = document.querySelector('#video-overlay__mute-btn') as HTMLElement;
    this.domMobileCloseButton = document.querySelector(
      '#video-overlay__mobile-close-btn',
    ) as HTMLElement;
    this.domVideoInner = document.getElementById('video-overlay__inner') as HTMLElement;
    if (properties.isMobile) this.initMobilePlayer();
    else this.initDesktopPlayer();
    this.domVideoContainer.addEventListener('click', () => {
      this.close();
    });
    this.domMobileCloseButton.addEventListener('click', () => {
      this.close();
    });
    this.hasInitialized = true;
  }

  initDesktopPlayer(): void {
    this.usesNativePlayer = false;
    this.domVideoMuteBtn.onmouseenter = () => (this.isControlsHover = true);
    this.domVideoMuteBtn.onmouseleave = () => (this.isControlsHover = false);
    const options = {
      url: VIDEO_LIST.MAIN_VIDEO_REEL,
      width: '100%',
      height: '100%',
      responsive: true,
      title: false,
      controls: false,
      byline: false,
      dnt: true,
    };
    this.videoPlayer = new Player('video-overlay__vimeo-video', options as never);
    (this.videoPlayer as unknown as { element: HTMLElement }).element.style.pointerEvents = 'none';
    this.videoPlayer.getVideoWidth().then((w) => (this.videoWidth = w));
    this.videoPlayer.getVideoHeight().then((h) => (this.videoHeight = h));
    this.videoPlayer.getDuration().then((d) => (this.videoDuration = d));
    this.domVideoInner.onmouseenter = () => (this.isVideoHover = true);
    this.domVideoInner.onmouseleave = () => (this.isVideoHover = false);
    this.domVideoInner.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePlayPause();
    });
    this.videoPlayer.on('ended', () => {
      this.close();
    });
    this.videoPlayer.on('play', () => {
      this.isVideoPlaying = true;
      if (!this.isOpened) this.videoPlayer!.pause().catch(() => {});
    });
    this.videoPlayer.on('pause', () => {
      this.isVideoPlaying = false;
    });
    this.domVideoMuteBtn.onclick = (e) => {
      e.stopPropagation();
      if (this.isVideoMuted) {
        this.videoPlayer!.setVolume(1);
        this.isVideoMuted = false;
        this.domVideoMuteBtn.classList.remove('is-muted');
      } else {
        this.videoPlayer!.setVolume(0);
        this.isVideoMuted = true;
        this.domVideoMuteBtn.classList.add('is-muted');
      }
    };
  }

  initMobilePlayer(): void {
    this.usesNativePlayer = true;
    if (this.domVideoCursor) this.domVideoCursor.style.display = 'none';
    this.domVideoInner.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.videoPlayer) this.togglePlayPause();
    });
    this.domVideoMuteBtn.onclick = (e) => {
      e.stopPropagation();
      if (!this.videoPlayer) return;
      if (this.isVideoMuted) {
        this.videoPlayer.setVolume(1);
        this.isVideoMuted = false;
        this.domVideoMuteBtn.classList.remove('is-muted');
      } else {
        this.videoPlayer.setVolume(0);
        this.isVideoMuted = true;
        this.domVideoMuteBtn.classList.add('is-muted');
      }
    };
  }

  createMobileIframe(url: string = VIDEO_LIST.MAIN_VIDEO_REEL): void {
    this.destroyMobileIframe();
    const iframe = document.createElement('iframe');
    iframe.src = `${url}&autoplay=1&muted=1&controls=0&playsinline=1&title=0&byline=0&portrait=0`;
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    iframe.setAttribute('playsinline', '');
    this.domVimeoEntryPoint.appendChild(iframe);
    this.videoPlayer = new Player(iframe);
    this.videoPlayer.on('ended', () => this.close());
    this.videoPlayer.on('play', () => (this.isVideoPlaying = true));
    this.videoPlayer.on('pause', () => (this.isVideoPlaying = false));
    this.isVideoMuted = true;
    this.domVideoMuteBtn.classList.add('is-muted');
  }

  destroyMobileIframe(): void {
    if (this.videoPlayer && this.usesNativePlayer) {
      try {
        this.videoPlayer.destroy();
      } catch {
        // ignored, matching source
      }
      this.videoPlayer = null;
    }
    const iframe = this.domVimeoEntryPoint.querySelector('iframe');
    if (iframe) iframe.remove();
    this.isVideoPlaying = false;
  }

  prefetch(url: string = VIDEO_LIST.MAIN_VIDEO_REEL): void {
    if (
      this.usesNativePlayer
      || this.isPrefetched
      || this.isPrefetching
      || (this.currentVideoId === url && this.isVideoReady)
    ) {
      return;
    }
    this.isPrefetching = true;
    this.currentVideoId = url;
    this.videoPlayer!.loadVideo(url).then(async () => {
      this.videoWidth = await this.videoPlayer!.getVideoWidth();
      this.videoHeight = await this.videoPlayer!.getVideoHeight();
      this.videoDuration = await this.videoPlayer!.getDuration();
      this.isVideoReady = true;
      this.isPrefetching = false;
      this.isPrefetched = true;
    });
  }

  initAndPlayVideo(url: string = VIDEO_LIST.MAIN_VIDEO_REEL): void {
    if (this.usesNativePlayer) {
      this.open(url);
      return;
    }
    if ((this.isPrefetched || this.isVideoReady) && this.currentVideoId === url) {
      this.isPrefetched = false;
      this.open();
      return;
    }
    this.isVideoReady = false;
    this.currentVideoId = url;
    this.videoPlayer!.loadVideo(url).then(async () => {
      this.videoWidth = await this.videoPlayer!.getVideoWidth();
      this.videoHeight = await this.videoPlayer!.getVideoHeight();
      this.videoDuration = await this.videoPlayer!.getDuration();
      this.isVideoReady = true;
      this.open();
    });
  }

  init(): void {
    this.domVideoContainer.style.opacity = '0';
    this.domVideoContainer.style.display = 'none';
  }

  resize(): void {}

  update(dt: number): void {
    if (!this.hasInitialized) return;
    this.openedRatio = saturate(this.openedRatio + 2 * (this.isOpened ? dt : -dt));
    const opacity = ease.quadInOut(this.openedRatio);
    this.domVideoContainer.style.opacity = String(opacity);
    this.domVideoContainer.style.display = this.openedRatio > 0 ? 'block' : 'none';
    if (!this.isOpened && this.isVideoPlaying && this.videoPlayer) {
      this.videoPlayer.pause().catch(() => {});
    }
    if (this.openedRatio === 0) {
      if (this.usesNativePlayer && this.videoPlayer) this.destroyMobileIframe();
      return;
    }
    if (!properties.useMobileLayout && this.domVideoCursor) {
      const mx = input.mouseXY.x;
      const my = input.mouseXY.y;
      const x = (mx * 0.5 + 0.5) * properties.viewportWidth;
      const y = (0.5 - my * 0.5) * properties.viewportHeight;
      const scale = (this.isControlsHover ? 0.2 : 1) * this.openedRatio;
      let state = 'close';
      if (this.isVideoHover) state = this.isVideoPlaying ? 'pause' : 'play';
      this.domVideoCursor.dataset.state = state;
      this.domVideoCursor.style.display = 'flex';
      this.domVideoCursor.style.transform =
        `translate3d(${x}px, ${y}px, 0) translate3d(-50%, -50%, 0) scale(${scale})`;
    } else if (this.domVideoCursor) {
      this.domVideoCursor.style.display = 'none';
    }
    this.playingRatio = saturate(this.playingRatio + dt * (this.isVideoPlaying ? 1 : -1));
    const pulse =
      this.playingRatio * (0.5 + 0.25 * (Math.sin(0.25 * properties.time * Math.PI * 2) + 1));
    this.domVideoInner.style.setProperty('--pulse', String(pulse));
  }

  togglePlayPause(): void {
    if (!this.videoPlayer) return;
    if (this.isVideoPlaying) this.videoPlayer.pause().catch(() => {});
    else this.videoPlayer.play().catch(() => {});
  }

  open(url?: string): void {
    this.isOpened = true;
    if (this.usesNativePlayer) {
      this.createMobileIframe(url);
      return;
    }
    this.isVideoMuted = false;
    this.domVideoMuteBtn.classList.remove('is-muted');
    this.videoPlayer!.setVolume(1);
    this.videoPlayer!.setCurrentTime(0).catch(() => {});
    this.videoPlayer!.play().catch((err) => {
      console.warn('Play blocked, trying muted:', err);
      this.videoPlayer!.setVolume(0).then(() => {
        this.videoPlayer!.play().catch(() => {});
      });
      this.isVideoMuted = true;
      this.domVideoMuteBtn.classList.add('is-muted');
    });
  }

  close(): void {
    this.isOpened = false;
    if (this.usesNativePlayer) {
      if (this.videoPlayer) this.videoPlayer.pause().catch(() => {});
      return;
    }
    this.videoPlayer!.pause().catch(() => {});
    this.videoPlayer!.setCurrentTime(0).catch(() => {});
  }
}

export const videoOverlay = new VideoOverlay();