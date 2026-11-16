
import { SplitText } from 'gsap/SplitText';
import { ease } from '../core/ease';
import { clamp, fit, hash, mix } from '../core/math';
import { input } from '../core/input';
import { properties } from '../core/properties';
import { scrollManager } from '../core/ScrollPane';
import { tableGripMicro, tableGripMicroWaterBear } from '../scenes/tableGrip';
import { tableScene } from '../scenes/tableScene';

let _domContainer: HTMLElement | null = null;
let _domInner: Element | null = null;
let _domTagline: HTMLElement | null = null;
let _domTaglineSplitText: SplitText | null = null;
let _domTitle: HTMLElement | null = null;
let _domTitleSplitText: SplitText | null = null;
let _domDesc: HTMLElement | null = null;
let _domDescSplitText: SplitText | null = null;
let _domZoomBox: HTMLElement | null = null;
let _domZoomBoxInner: HTMLElement | null = null;
let _domZoomBoxImg: HTMLElement | null = null;
let _domZoomBoxContent: HTMLElement | null = null;
let _domZoomBoxContentBg: HTMLElement | null = null;
let _domZoomBoxContentLabel: HTMLElement | null = null;
let _domCoeff: HTMLElement | null = null;
let _domInstruction: HTMLElement | null = null;
let _domInstructionWheel: HTMLElement | null = null;
let _domInstructionWheelCircle: HTMLElement | null = null;
let _domInstructionIcon: HTMLElement | null = null;

let _wheelWidth = 0;
let _isDragging = false;
let _zoomBoxContentHeight = 0;
let _zoomBoxWidth = 0;
let _zoomBoxHeight = 0;
let _zoomBoxX = 0;
let _zoomBoxTargetX = 0;
let _prevZoomBoxX = 0;
let _accumulatedOffsetX = 0;
let _maxZoomBoxDragRange = 0;
let _coeffRand = -1;
let _mouseOffsetX = 0;
let _mouseOffsetY = 0;
let _mouseOffsetTargetX = 0;
let _mouseOffsetTargetY = 0;
let _mouseIsInside = false;
let _hasDragged = false;
let _instructionDraggedTime = 0;
let _zoomBoxLocalOffsetX = 0;
let _zoomBoxLocalOffsetY = 0;
let _zoomBoxImgWidth = 0;
let _zoomBoxImgHeight = 0;
let _isDraggable = false;

export class GripSection {
    private initialized = false;
    private inputHandlerAdded = false;

    private getElement<T extends HTMLElement>(
        root: ParentNode,
        selector: string,
    ): T {
        const element = root.querySelector<T>(selector);

        if (!element) {
            throw new Error(
                `[GripSection] Missing required HTML element: ${selector}. Check your HTML markup.`
            );
        }

        return element;
    }

    preInit(root: Element): void {
        // Find the main Grip section.
        _domContainer = this.getElement<HTMLElement>(root, '#grip');

        // Find all required elements.
        _domInner = this.getElement(_domContainer, '.section__inner');

        _domTagline = this.getElement(_domContainer, '#grip-tagline');
        _domTitle = this.getElement(_domContainer, '#grip-title');
        _domDesc = this.getElement(_domContainer, '#grip-desc');

        _domZoomBox = this.getElement(_domContainer, '#grip-zoom-box');
        _domZoomBoxInner = this.getElement(_domContainer, '#grip-zoom-box__inner');
        _domZoomBoxImg = this.getElement(_domContainer, '#grip-zoom-box__image');

        _domZoomBoxContent = this.getElement(
            _domContainer,
            '#grip-zoom-box__content'
        );

        _domZoomBoxContentBg = this.getElement(
            _domContainer,
            '#grip-zoom-box__content-bg'
        );

        _domZoomBoxContentLabel = this.getElement(
            _domContainer,
            '#grip-zoom-box__content-label'
        );

        _domCoeff = this.getElement(
            _domContainer,
            '#grip-zoom-box__content-coeff'
        );

        _domInstruction = this.getElement(
            _domContainer,
            '#grip-instruction'
        );

        _domInstructionWheel = this.getElement(
            _domInstruction,
            '#grip-instruction-wheel'
        );

        _domInstructionWheelCircle = this.getElement(
            _domInstructionWheel,
            '#grip-instruction-wheel-circle'
        );

        _domInstructionIcon = this.getElement(
            _domInstruction,
            '#grip-instruction-icon'
        );

        // Create GSAP SplitText instances.
        _domTaglineSplitText = SplitText.create(_domTagline, {
            type: 'words',
            autoSplit: false,
            mask: 'words',
        });

        _domTitleSplitText = SplitText.create(_domTitle, {
            type: 'lines,chars',
            autoSplit: false,
        });

        _domDescSplitText = SplitText.create(_domDesc, {
            type: 'lines',
            autoSplit: false,
            mask: 'lines',
        });

        // Prevent duplicate event listeners.
        if (!this.inputHandlerAdded) {
            input.onDowned.add((e) => {
                if (
                    _domZoomBoxInner &&
                    input.hasThroughElem(_domZoomBoxInner, 'down')
                ) {
                    if (e.preventDefault) e.preventDefault();

                    if (_isDraggable) {
                        _isDragging = true;
                    }
                }
            });

            this.inputHandlerAdded = true;
        }

        this.initialized = true;
    }

    init(): void {
        if (!this.initialized) {
            console.warn('[GripSection] Cannot initialize before preInit().');
            return;
        }
    }

    resize(): void {
        if (
            !_domContainer ||
            !_domInner ||
            !_domZoomBox ||
            !_domZoomBoxContent ||
            !_domZoomBoxContentBg ||
            !_domZoomBoxImg ||
            !_domInstructionWheel ||
            !_domTaglineSplitText ||
            !_domTitleSplitText ||
            !_domDescSplitText
        ) {
            return;
        }

        _domZoomBox.style.transform = 'translateZ(0)';

        const boxRect = _domZoomBox.getBoundingClientRect();
        const innerRect = _domInner.getBoundingClientRect();

        _zoomBoxWidth = boxRect.width;
        _zoomBoxHeight = boxRect.height;

        _maxZoomBoxDragRange = Math.max(
            0,
            Math.min(
                properties.viewportWidth -
                _zoomBoxWidth -
                properties.paddingX * 2,
                200
            )
        );

        _zoomBoxContentHeight =
            _domZoomBoxContent.getBoundingClientRect().height;

        _domZoomBoxContentBg.style.transformOrigin =
            `0 ${_zoomBoxContentHeight + _zoomBoxHeight}px`;

        _domTaglineSplitText.split({
            type: 'words',
            autoSplit: false,
            mask: 'words',
        });

        _domTitleSplitText.split({
            type: 'lines,chars',
            autoSplit: false,
        });

        _domDescSplitText.split({
            type: 'lines',
            autoSplit: false,
            mask: 'lines',
        });

        _wheelWidth = _domInstructionWheel.getBoundingClientRect().width;

        _zoomBoxLocalOffsetX = boxRect.x - innerRect.x;
        _zoomBoxLocalOffsetY = boxRect.y - innerRect.y;

        const imgRect = _domZoomBoxImg.getBoundingClientRect();

        _zoomBoxImgWidth = imgRect.width;
        _zoomBoxImgHeight = imgRect.height;
    }

    update(dt: number): void {
        if (
            !this.initialized ||
            !_domContainer ||
            !_domInner ||
            !_domTaglineSplitText ||
            !_domTitleSplitText ||
            !_domDescSplitText ||
            !_domZoomBoxInner ||
            !_domZoomBoxContent ||
            !_domZoomBoxContentBg ||
            !_domZoomBoxContentLabel ||
            !_domCoeff ||
            !_domInstruction ||
            !_domInstructionWheel ||
            !_domInstructionWheelCircle ||
            !_domInstructionIcon
        ) {
            return;
        }

        const useMobileLayout = properties.useMobileLayout;

        const r = scrollManager.getDomRange(_domContainer).showScreenOffset;

        const show = fit(r, 0.5, 1, 0, 1);
        const hide = fit(r, 2.5, 3, 0, 1);

        const isVisible = show * (1 - hide) > 0;

        _domContainer.style.visibility = isVisible ? 'visible' : 'hidden';

        _isDraggable = show > 0.6 && hide < 0.4;

        _domZoomBoxInner.style.pointerEvents = _isDraggable
            ? 'auto'
            : 'none';

        if (input.isDown) {
            if (_isDragging && _maxZoomBoxDragRange > 0) {
                _zoomBoxTargetX +=
                    (input.deltaPixelXY.x / _maxZoomBoxDragRange) * 2;
            }
        } else {
            _isDragging = false;
            _zoomBoxTargetX = 0;
        }

        if (isVisible) {
            if (_isDragging && _mouseIsInside) {
                _hasDragged = true;
            }

            if (_hasDragged) {
                _instructionDraggedTime += dt;
            }

            // Tagline animation.
            const taglineCount = _domTaglineSplitText.words.length;

            for (let w = 0; w < taglineCount; w++) {
                const ratio =
                    taglineCount > 1 ? w / (taglineCount - 1) : 0;

                const word = _domTaglineSplitText.words[w] as HTMLElement;

                const slide = fit(
                    show,
                    ratio * 0.15,
                    0.45 + ratio * 0.15,
                    1,
                    0,
                    ease.cubicOut
                );

                word.style.transform =
                    `translate3d(0,${slide}em,0)`;

                word.style.opacity = String(
                    fit(hide, ratio * 0.15, ratio * 0.15 + 0.4, 1, 0)
                );
            }

            // Title animation.
            const titleCount = _domTitleSplitText.chars.length;

            for (let c = 0; c < titleCount; c++) {
                const ratio =
                    titleCount > 1 ? c / (titleCount - 1) : 0;

                const char = _domTitleSplitText.chars[c] as HTMLElement;

                char.style.filter = useMobileLayout
                    ? 'none'
                    : `blur(${fit(
                        show,
                        0.15 + ratio * 0.3,
                        ratio * 0.3 + 0.7,
                        0.3,
                        0
                    ).toFixed(2)}em)`;

                char.style.opacity = String(
                    fit(
                        show,
                        ratio * 0.3,
                        ratio * 0.3 + 0.6,
                        0,
                        1,
                        ease.cubicOut
                    ) *
                    fit(
                        hide,
                        ratio * 0.2,
                        ratio * 0.2 + 0.8,
                        1,
                        0
                    )
                );
            }

            // Description animation.
            const descCount = _domDescSplitText.lines.length;

            for (let l = 0; l < descCount; l++) {
                const ratio =
                    descCount > 1 ? l / (descCount - 1) : 0;

                const line = _domDescSplitText.lines[l] as HTMLElement;

                const slide = fit(
                    show,
                    0.4 + ratio * 0.3,
                    0.7 + ratio * 0.3,
                    1,
                    0,
                    ease.cubicOut
                );

                line.style.transform =
                    `translate3d(0,${slide * 1.2}em,0)`;

                line.style.opacity = String(
                    fit(hide, ratio * 0.3, ratio * 0.3 + 0.6, 1, 0)
                );
            }

            // Zoom box animation.
            _domZoomBoxContentBg.style.width =
                fit(show, 0.3, 0.6, 0, 100) + '%';

            _domZoomBoxContentBg.style.opacity = String(
                fit(show, 0, 0.05, 0, 1)
            );

            _domZoomBoxContent.style.opacity = String(
                fit(hide, 0, 1, 1, 0)
            );

            _domZoomBoxContentLabel.style.opacity = String(
                fit(show, 0.6, 1, 0, 1)
            );

            _domCoeff.style.opacity = String(
                fit(show, 0.6, 1, 0, 1)
            );

            // Drag instruction animation.
            const instructionOpacity =
                fit(show, 0.5, 1, 0, 1) *
                fit(hide, 0, 1, 1, 0) *
                fit(_instructionDraggedTime, 0, 1, 1, 0);

            _domInstruction.style.opacity = String(instructionOpacity);

            const wheelTime = properties.time * 4;

            let iconX = Math.cos(wheelTime) * _wheelWidth * 0.1;

            const iconY =
                (1 - Math.cos(Math.abs(Math.cos(wheelTime) * 0.2))) *
                _wheelWidth *
                -0.2;

            _domInstructionIcon.style.transform =
                `translate3d(${iconX}px, ${iconY}px, 0) translateX(-50%) rotate(${Math.cos(wheelTime) * 4}deg)`;

            iconX = Math.cos(wheelTime + 0.1) * _wheelWidth * 0.1;

            _domInstructionWheelCircle.style.transform =
                _wheelWidth > 0
                    ? `translate3d(${(iconX * 100) / _wheelWidth}%, ${(iconY * 100) / _wheelWidth}%, 0)`
                    : 'none';
        } else {
            _hasDragged = false;
            _instructionDraggedTime = 0;
        }

        // Smooth drag movement.
        _zoomBoxX = mix(
            _zoomBoxX,
            clamp(_zoomBoxTargetX, -1, 1),
            input.isDown ? 1 : 1 - Math.exp(dt * -10)
        );

        const dragOffsetX =
            (_zoomBoxX * _maxZoomBoxDragRange) / 2;

        const dragOffsetY =
            ((Math.pow(Math.abs(_zoomBoxX), 4) *
                _maxZoomBoxDragRange) /
                Math.max(1, properties.viewportHeight)) *
            -40;

        _domZoomBoxInner.style.transform =
            `translate3d(${dragOffsetX}px, ${dragOffsetY}px, 0)`;

        // Three.js scene animation.
        tableScene.animation = fit(
            r,
            -1,
            0.5,
            tableScene.animation,
            9
        );

        tableScene.animation = fit(
            r,
            2,
            3,
            tableScene.animation,
            10
        );

        tableGripMicro.offsetX = _zoomBoxX;

        const boxX = _zoomBoxLocalOffsetX + dragOffsetX;
        const boxY = _zoomBoxLocalOffsetY + dragOffsetY;

        tableGripMicro.rect.set(
            boxX,
            boxY,
            _zoomBoxImgWidth,
            _zoomBoxImgHeight
        );

        // Mouse interaction.
        if (_zoomBoxImgWidth > 0 && _zoomBoxImgHeight > 0) {
            _mouseOffsetTargetX =
                (input.mousePixelXY.x - boxX) /
                _zoomBoxImgWidth -
                0.5;

            _mouseOffsetTargetY =
                (input.mousePixelXY.y - boxY) /
                _zoomBoxImgHeight -
                0.5;
        } else {
            _mouseOffsetTargetX = 0;
            _mouseOffsetTargetY = 0;
        }

        if (
            _mouseOffsetTargetX < -0.5 ||
            _mouseOffsetTargetX > 0.5 ||
            _mouseOffsetTargetY < -0.5 ||
            _mouseOffsetTargetY > 0.5
        ) {
            _mouseOffsetTargetX = 0;
            _mouseOffsetTargetY = 0;
            _mouseIsInside = false;
        } else {
            _mouseIsInside = true;
        }

        _mouseOffsetX = mix(
            _mouseOffsetX,
            _mouseOffsetTargetX,
            1 - Math.exp(dt * -10)
        );

        _mouseOffsetY = mix(
            _mouseOffsetY,
            _mouseOffsetTargetY,
            1 - Math.exp(dt * -10)
        );

        tableGripMicro.mouseOffset.set(
            _mouseOffsetX,
            -_mouseOffsetY
        );

        tableGripMicro.mouseZoom = mix(
            tableGripMicro.mouseZoom,
            _mouseIsInside ? 1.4 : 1,
            1 - Math.exp(dt * -10)
        );

        tableGripMicro.showRatio = fit(show, 0.3, 1, 0, 1);
        tableGripMicro.hideRatio = hide;

        // Coefficient.
        const coeffHash = hash(
            Math.floor(_zoomBoxX * 1e3 + 0.5)
        );

        if (_coeffRand !== coeffHash) {
            _coeffRand = coeffHash;

            _domCoeff.textContent = fit(
                coeffHash,
                0,
                1,
                0.8,
                0.93
            ).toFixed(2);
        }

        // Water bear activation.
        if (isVisible) {
            _accumulatedOffsetX += Math.abs(
                _zoomBoxX - _prevZoomBoxX
            );

            _prevZoomBoxX = _zoomBoxX;

            if (_accumulatedOffsetX > 10) {
                tableGripMicroWaterBear.isActive = true;
            }
        } else {
            _zoomBoxX = 0;
            _prevZoomBoxX = 0;
            _zoomBoxTargetX = 0;
            _accumulatedOffsetX = 0;

            tableGripMicroWaterBear.isActive = false;
        }
    }
}

export const gripSection = new GripSection();
