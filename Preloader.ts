// 1:1 port of the source Preloader (pretty line 30217-30290): 2D-canvas
// aperture rings drawn over the WebGL reveal wipe, driving the init/start
// bootstrap callbacks off the loader progress.

import { Camera } from 'three';
import { ease } from './core/ease';
import { loader } from './core/Loader';
import { fit } from './core/math';
import { properties } from './core/properties';
import * as settings from './core/settings';

let _compileList: unknown[] = [];
let _domContainer: HTMLElement;
let _canvas: HTMLCanvasElement;
let _ctx: CanvasRenderingContext2D;
let _isActive = true;
let _initCallback: () => void;
let _startCallback: () => void;
let _targetPercent = 0;
let _percent = 0;
let _initToStartPercent = 0;
const MIN_PRELOAD_DURATION = 1;
const PERCENT_BETWEEN_INIT_AND_START = 0.1;
const MIN_DURATION_BETWEEN_INIT_AND_START = 0.1;
const _color = '#FDCA83';
let _compiledCount = 0;
const CIRCLE_BEZIER_OFFSET = ((Math.sqrt(2) - 1) * 4) / 3;
let _gradientCache: HTMLCanvasElement;
let _preloaderTime = 0;

export class Preloader {
  private _tmpCamera = new Camera();

  preInit(): void {
    _domContainer = document.getElementById('preloader') as HTMLElement;
    _canvas = document.getElementById('preloader-canvas') as HTMLCanvasElement;
    _ctx = _canvas.getContext('2d') as CanvasRenderingContext2D;
    _isActive = true;
    _gradientCache = document.createElement('canvas');
    const cacheCtx = _gradientCache.getContext('2d') as CanvasRenderingContext2D;
    _gradientCache.width = 255;
    _gradientCache.height = 255;
    const gradient = cacheCtx.createRadialGradient(127.5, 127.5, 0, 127.5, 127.5, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    cacheCtx.fillStyle = gradient;
    cacheCtx.fillRect(0, 0, 255, 255);
  }

  show(initCallback: () => void, startCallback: () => void): void {
    _initCallback = initCallback;
    _startCallback = startCallback;
    _isActive = true;
    loader.onProgress = (ratio) => {
      _targetPercent = ratio;
    };
    void loader.start();
  }

  hide(): void {
    if (settings.SKIP_ANIMATION) {
      _isActive = false;
      _domContainer.style.display = 'none';
    }
  }

  resize(width: number, height: number): void {
    if (_isActive) {
      _canvas.width = width * settings.DPR;
      _canvas.height = height * settings.DPR;
    }
  }

  update(dt: number): void {
    if (!_isActive) return;
    _preloaderTime += dt;
    _percent = Math.min(
      _targetPercent,
      _percent
        + (settings.SKIP_ANIMATION ? 1 : _targetPercent > _percent ? dt : 0) / MIN_PRELOAD_DURATION,
    );
    if (_targetPercent === 1) {
      if (!properties.hasInitialized) {
        _initCallback();
        _compileList = properties.compileList.splice(0, properties.compileList.length);
      }
      const compileRatio =
        properties.compileList.length === 0 ? 1 : _compiledCount / properties.compileList.length;
      _initToStartPercent = Math.min(
        compileRatio,
        _initToStartPercent
          + (settings.SKIP_ANIMATION ? 1 : _percent === 1 ? dt : 0)
            / MIN_DURATION_BETWEEN_INIT_AND_START,
      );
      if (_compileList.length) {
        const item = _compileList.shift();
        void properties
          .renderer!.compileAsync(item as never, this._tmpCamera)
          .then(() => {
            _compiledCount++;
          });
      }
      if (!properties.hasStarted && _initToStartPercent === 1) _startCallback();
    }
    const t =
      _initToStartPercent * PERCENT_BETWEEN_INIT_AND_START
      + _percent * (1 - PERCENT_BETWEEN_INIT_AND_START);
    const i = fit(properties.startTime, 0, 1, 0, 1);
    const r = 1 - i;
    const o = properties.viewportWidth;
    const a = properties.viewportHeight;
    const l = properties.useMobileLayout ? a * 0.03 : 0;
    _ctx.save();
    const u =
      properties.viewportHeight
      * 0.21
      * (properties.useMobileLayout ? 0.72 : 1)
      * fit(_preloaderTime, 0.2, 0.7, 0.2, 1, ease.backOut);
    const c =
      u
      * fit(i, 0, 0.3, 239 / 520, 466 / 536, ease.sineOut)
      * fit(_preloaderTime, 0.2, 0.9, 0.2, 1, ease.backOut);
    _ctx.scale(settings.DPR, settings.DPR);
    _ctx.clearRect(0, 0, o, a);
    const circumference = u * 2 * Math.PI;
    const x = circumference / 300;
    const p = (properties.time / Math.max(1, circumference)) * 100;
    const b = -Math.PI / 2;
    _ctx.translate(o * 0.5, a * 0.5 + l);
    _ctx.strokeStyle = _color;
    _ctx.lineWidth = 2;
    _ctx.setLineDash([x, x]);
    const S = a / 2;
    _ctx.strokeStyle = '#ffedd7';
    _ctx.globalAlpha = r * fit(_preloaderTime, 0.5, 1, 0, 1);
    _ctx.beginPath();
    _ctx.arc(0, 0, u, b, Math.PI * 2 * t + b);
    _ctx.arc(0, 0, c, Math.PI * 2 * t + b, b, true);
    _ctx.closePath();
    _ctx.fill();
    _ctx.globalAlpha = r;
    _ctx.beginPath();
    _ctx.moveTo(-u, -S);
    _ctx.lineTo(-u, S);
    _ctx.moveTo(-c, -S);
    _ctx.lineTo(-c, S);
    _ctx.moveTo(c, -S);
    _ctx.lineTo(c, S);
    _ctx.moveTo(u, -S);
    _ctx.lineTo(u, S);
    _ctx.moveTo(-S, -u);
    _ctx.lineTo(S, -u);
    _ctx.moveTo(-S, -c);
    _ctx.lineTo(S, -c);
    _ctx.moveTo(-S, c);
    _ctx.lineTo(S, c);
    _ctx.moveTo(-S, u);
    _ctx.lineTo(S, u);
    _ctx.stroke();
    _ctx.globalCompositeOperation = 'source-in';
    _ctx.globalAlpha = r;
    _ctx.drawImage(_gradientCache, -a / 2, -a / 2, a, a);
    _ctx.globalCompositeOperation = 'source-over';
    _ctx.fillStyle = _color;
    _ctx.globalAlpha = fit(i, 0, 1, 1, 0);
    _ctx.save();
    _ctx.rotate(p);
    _ctx.beginPath();
    _ctx.arc(0, 0, u, 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.restore();
    _ctx.save();
    _ctx.rotate(p);
    _ctx.beginPath();
    _ctx.arc(0, 0, c, 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.restore();
    const A = u * CIRCLE_BEZIER_OFFSET;
    const M = c * CIRCLE_BEZIER_OFFSET;
    _ctx.strokeStyle = '#FF8539';
    _ctx.fillStyle = '#FF8539';
    _ctx.setLineDash([]);
    _ctx.save();
    _ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      _ctx.rotate((Math.PI / 2) * k);
      _ctx.moveTo(u, -A);
      _ctx.lineTo(u, A);
      _ctx.moveTo(c, -M);
      _ctx.lineTo(c, M);
    }
    _ctx.stroke();
    _ctx.restore();
    const T = (5 * a) / 1080;
    const D = (3 * a) / 1080;
    _ctx.save();
    for (let k = 0; k < 4; k++) {
      _ctx.rotate((Math.PI / 2) * k);
      _ctx.beginPath();
      _ctx.arc(c, -M, D, 0, Math.PI * 2);
      _ctx.arc(c, M, D, 0, Math.PI * 2);
      _ctx.rect(c - D, -D, D * 2, D * 2);
      _ctx.fill();
      _ctx.beginPath();
      _ctx.arc(u, -A, T, 0, Math.PI * 2);
      _ctx.arc(u, A, T, 0, Math.PI * 2);
      _ctx.rect(u - T, -T, T * 2, T * 2);
      _ctx.fill();
    }
    _ctx.restore();
    _ctx.restore();
    if (i === 1) {
      _isActive = false;
      _domContainer.style.display = 'none';
    }
  }
}

export const preloader = new Preloader();