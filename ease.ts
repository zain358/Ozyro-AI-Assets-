class Ease {
  quadIn(t: number): number { return t * t; }
  quadOut(t: number): number { return t * (2 - t); }
  quadInOut(t: number): number { return (t *= 2) < 1 ? 0.5 * t * t : -0.5 * (--t * (t - 2) - 1); }
  cubicIn(t: number): number { return t * t * t; }
  cubicOut(t: number): number { return --t * t * t + 1; }
  cubicInOut(t: number): number { return (t *= 2) < 1 ? 0.5 * t * t * t : 0.5 * ((t -= 2) * t * t + 2); }
  quartIn(t: number): number { return t * t * t * t; }
  quartOut(t: number): number { return 1 - --t * t * t * t; }
  quartInOut(t: number): number { return (t *= 2) < 1 ? 0.5 * t * t * t * t : -0.5 * ((t -= 2) * t * t * t - 2); }
  quintIn(t: number): number { return t * t * t * t * t; }
  quintOut(t: number): number { return --t * t * t * t * t + 1; }
  quintInOut(t: number): number { return (t *= 2) < 1 ? 0.5 * t * t * t * t * t : 0.5 * ((t -= 2) * t * t * t * t + 2); }
  sineIn(t: number): number { return 1 - Math.cos((t * Math.PI) / 2); }
  sineOut(t: number): number { return Math.sin((t * Math.PI) / 2); }
  sineInOut(t: number): number { return 0.5 * (1 - Math.cos(Math.PI * t)); }
  expoIn(t: number): number { return t === 0 ? 0 : Math.pow(1024, t - 1); }
  expoOut(t: number): number { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  expoInOut(t: number): number {
    return t === 0 ? 0 : t === 1 ? 1 : (t *= 2) < 1
      ? 0.5 * Math.pow(1024, t - 1)
      : 0.5 * (-Math.pow(2, -10 * (t - 1)) + 2);
  }
  circIn(t: number): number { return 1 - Math.sqrt(1 - t * t); }
  circOut(t: number): number { return Math.sqrt(1 - --t * t); }
  circInOut(t: number): number {
    return (t *= 2) < 1
      ? -0.5 * (Math.sqrt(1 - t * t) - 1)
      : 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
  }
  backIn(t: number): number { const s = 1.70158; return t * t * ((s + 1) * t - s); }
  backOut(t: number): number { const s = 1.70158; return --t * t * ((s + 1) * t + s) + 1; }
  backInOut(t: number): number {
    const s = 2.5949095;
    return (t *= 2) < 1
      ? 0.5 * t * t * ((s + 1) * t - s)
      : 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
  }
  bounceIn(t: number): number { return 1 - this.bounceOut(1 - t); }
  bounceOut(t: number): number {
    return t < 1 / 2.75
      ? 7.5625 * t * t
      : t < 2 / 2.75
        ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
        : t < 2.5 / 2.75
          ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
          : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
  bounceInOut(t: number): number {
    return t < 0.5 ? this.bounceIn(t * 2) * 0.5 : this.bounceOut(t * 2 - 1) * 0.5 + 0.5;
  }
  cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (x1 === y1 && x2 === y2) return t;
    const slope = (u: number, a: number, b: number, c: number): number =>
      1 / (3 * a * u * u + 2 * b * u + c);
    const evalPoly = (u: number, a: number, b: number, c: number, d: number): number =>
      a * (u * u * u) + b * (u * u) + c * u + d;
    const evalPoly2 = (u: number, a: number, b: number, c: number, d: number): number => {
      const uu = u * u;
      return a * (uu * u) + b * uu + c * u + d;
    };
    const x0 = 0;
    const y0 = 0;
    const x3 = 1;
    const y3 = 1;
    const ax = x3 - 3 * x2 + 3 * x1 - x0;
    const bx = 3 * x2 - 6 * x1 + 3 * x0;
    const cx = 3 * x1 - 3 * x0;
    const dx = x0;
    const ay = y3 - 3 * y2 + 3 * y1 - y0;
    const by = 3 * y2 - 6 * y1 + 3 * y0;
    const cy = 3 * y1 - 3 * y0;
    const dy = y0;
    let u = t;
    for (let i = 0; i < 100; i++) {
      const px = evalPoly(u, ax, bx, cx, dx);
      let s = slope(u, ax, bx, cx);
      if (s === Infinity) s = t;
      u -= (px - t) * s;
      u = Math.min(Math.max(u, 0), 1);
    }
    return evalPoly2(u, ay, by, cy, dy);
  }
}

export const ease = new Ease();
