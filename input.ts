import { Vector2 } from 'three';
import { clamp } from './math';
import { MinSignal } from './MinSignal';
import { properties } from './properties';
import { SecondOrderDynamics } from './SecondOrderDynamics';

const PIXEL_STEP = 10;
const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 800;


function normalizeWheel(event: WheelEvent): { pixelX: number; pixelY: number } {
    let sX = 0;
    let sY = 0;
    const legacy = event as unknown as Record<string, number>;
    if ('detail' in event) sY = legacy.detail;
    if ('wheelDelta' in legacy) sY = -legacy.wheelDelta / 120;
    if ('wheelDeltaY' in legacy) sY = -legacy.wheelDeltaY / 120;
    if ('wheelDeltaX' in legacy) sX = -legacy.wheelDeltaX / 120;
    let pX = sX * PIXEL_STEP;
    let pY = sY * PIXEL_STEP;
    if ('deltaY' in event) pY = event.deltaY;
    if ('deltaX' in event) pX = event.deltaX;
    if ((pX || pY) && event.deltaMode) {
        if (event.deltaMode === 1) {
            pX *= LINE_HEIGHT;
            pY *= LINE_HEIGHT;
        } else {
            pX *= PAGE_HEIGHT;
            pY *= PAGE_HEIGHT;
        }
    }
    return { pixelX: pX, pixelY: pY };
}

class Input {
    isDown = false;
    wasDown = false;
    isWheelScrolling = false;
    isDragScrollingX = false;
    isDragScrollingY = false;
    deltaWheel = 0;
    deltaScrollX = 0;
    deltaScrollY = 0;
    deltaDragScrollX = 0;
    deltaDragScrollY = 0;
    deltaPixelXY = { x: 0, y: 0 };

    deltaXY = new Vector2();

    currThroughElems: Element[] = [];
    downPixelXY = { x: 0, y: 0 };
    prevMovePixelXY = { x: 0, y: 0 };

    mouseXY = new Vector2();

    mousePixelXY = new Vector2();

    prevMousePixelXY = new Vector2();

    hasMoved = false;

    hadMoved = false;

    easedMouseDynamics: Record<string, SecondOrderDynamics> = {};

    onClicked = new MinSignal<PointerEvent>();

    onUped = new MinSignal<PointerEvent>();

    onDowned = new MinSignal<PointerEvent>();

    private downTarget: EventTarget | null = null;
    private downTime = 0;

    init(): void {
        window.addEventListener('wheel', this._onWheel.bind(this), { passive: true });
        window.addEventListener('pointerdown', this._onDown.bind(this));
        window.addEventListener('pointermove', this._onMove.bind(this));
        window.addEventListener('pointerup', this._onUp.bind(this));
        window.addEventListener('pointercancel', this._onUp.bind(this));

        this.addEasedInput('default', 1.35, 0.5, 1.25);
        this.addEasedInput('dragScroll', 2, 1, 1);
        this.addEasedInput('gobo', 1, 0.3, 2);

        this.onUped.addOnce(() => {
            properties.onFirstClicked.dispatch();
        });
    }

    addEasedInput(name: string, f = 1.5, z = 0.8, r = 2): SecondOrderDynamics {
        this.easedMouseDynamics[name] = new SecondOrderDynamics(new Vector2(), f, z, r);
        return this.easedMouseDynamics[name];
    }

    update(dt: number): void {
        for (const name in this.easedMouseDynamics) {
            const dynamics = this.easedMouseDynamics[name];
            dynamics.target.copy(this.mouseXY);
            dynamics.update(dt);
        }
    }

    postUpdate(): void {
        this.deltaWheel = 0;
        this.deltaDragScrollX = 0;
        this.deltaDragScrollY = 0;
        this.deltaScrollX = 0;
        this.deltaScrollY = 0;
        this.deltaPixelXY.x = 0;
        this.deltaPixelXY.y = 0;
        this.deltaXY.set(0, 0);
        this.prevMousePixelXY.copy(this.mousePixelXY);
        this.hadMoved = this.hasMoved;
        this.wasDown = this.isDown;
        this.isWheelScrolling = false;
    }

    hasThroughElem(elem: Element | Window, _phase: string): boolean {
        if (elem === window) return true;
        const t = this.downTarget;
        return t instanceof Node && elem instanceof Element && elem.contains(t);
    }

    private _onWheel(e: WheelEvent): void {
        let { pixelY } = normalizeWheel(e);
        pixelY = clamp(pixelY, -200, 200);
        this.deltaWheel += pixelY;
        this.deltaScrollX = this.deltaDragScrollX + this.deltaWheel;
        this.deltaScrollY = this.deltaDragScrollY + this.deltaWheel;
        this.isWheelScrolling = true;
    }

    private _onDown(e: PointerEvent): void {
        this.isDown = true;
        this.downTarget = e.target;
        this.downTime = +new Date();
        this.downPixelXY.x = this.prevMovePixelXY.x = e.clientX;
        this.downPixelXY.y = this.prevMovePixelXY.y = e.clientY;
        this.isDragScrollingX = false;
        this.isDragScrollingY = false;
        this.onDowned.dispatch(e);
    }

    private _onMove(e: PointerEvent): void {
        const prevX = this.mouseXY.x;
        const prevY = this.mouseXY.y;
        this.mouseXY.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouseXY.y = -((e.clientY / window.innerHeight) * 2 - 1);
        this.deltaXY.x += this.mouseXY.x - prevX;
        this.deltaXY.y += this.mouseXY.y - prevY;
        this.mousePixelXY.set(e.clientX, e.clientY);
        this.hasMoved = true;

        let node = e.target as Node | null;
        this.currThroughElems.length = 0;
        while (node && node.parentNode) {
            this.currThroughElems.push(node as Element);
            node = node.parentNode;
        }
        if (!this.isDown) return;
        const dx = e.clientX - this.prevMovePixelXY.x;
        const dy = e.clientY - this.prevMovePixelXY.y;
        this.prevMovePixelXY.x = e.clientX;
        this.prevMovePixelXY.y = e.clientY;
        this.deltaPixelXY.x += dx;
        this.deltaPixelXY.y += dy;

        if (e.pointerType === 'touch') {
            if (!this.isDragScrollingX && !this.isDragScrollingY) {
                const totalX = Math.abs(e.clientX - this.downPixelXY.x);
                const totalY = Math.abs(e.clientY - this.downPixelXY.y);
                if (totalX > 4 || totalY > 4) {
                    if (totalY >= totalX) this.isDragScrollingY = true;
                    else this.isDragScrollingX = true;
                }
            }
            if (this.isDragScrollingY) this.deltaDragScrollY -= dy;
            if (this.isDragScrollingX) this.deltaDragScrollX -= dx;
            this.deltaScrollX = this.deltaDragScrollX + this.deltaWheel;
            this.deltaScrollY = this.deltaDragScrollY + this.deltaWheel;
        }
    }

    private _onUp(e: PointerEvent): void {

        if (this.isDown && e.clientX !== undefined) {
            const dx = e.clientX - this.downPixelXY.x;
            const dy = e.clientY - this.downPixelXY.y;
            if (Math.sqrt(dx * dx + dy * dy) < 40 && +new Date() - this.downTime < 300) {
                this.onClicked.dispatch(e);
            }
        }
        this.isDown = false;
        this.isDragScrollingX = false;
        this.isDragScrollingY = false;
        this.onUped.dispatch(e);
    }
}

export const input = new Input();