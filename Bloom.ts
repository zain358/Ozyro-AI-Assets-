// 1:1 port of the source Bloom (pretty line 16425-16709), non-convolution
// path — the source's addQueue sets USE_CONVOLUTION = false, so the FFT
// branch is never taken on the live site and is not ported.

import { Color, HalfFloatType, NoBlending, Vector2 } from 'three';
import type { RawShaderMaterial, Texture, WebGLRenderTarget } from 'three';
import { fboHelper } from '../core/fboHelper';
import { bloomBlurFrag, bloomCompositeFrag, highPassFrag } from '../glsl';
import { PostEffect } from './PostEffect';
import type { Postprocessing } from './postprocessing';

export class Bloom extends PostEffect {
    ITERATION = 5;
    USE_CONVOLUTION = false;
    USE_HD = true;
    USE_LENS_DIRT = false;
    amount = 1;
    radius = 0;
    threshold = 0.1;
    smoothWidth = 1;
    lumaStrength = 0.5;
    selectiveStrength = 1;
    saturation = 1;
    haloWidth = 0.8;
    haloRGBShift = 0.03;
    haloStrength = 0.21;
    haloLeftColorHex = '#ff0000';
    haloMidColorHex = '#00ff00';
    haloRightColorHex = '#0000ff';
    haloLeftColor = new Color();
    haloMidColor = new Color();
    haloRightColor = new Color();
    haloMaskInner = 0.3;
    haloMaskOuter = 0.5;
    highPassMaterial!: RawShaderMaterial;
    highPassRenderTarget!: WebGLRenderTarget;
    renderTargetsHorizontal: WebGLRenderTarget[] = [];
    renderTargetsVertical: WebGLRenderTarget[] = [];
    blurMaterials: RawShaderMaterial[] = [];
    directionX = new Vector2(1, 0);
    directionY = new Vector2(0, 1);

    init(options?: Record<string, unknown>): void {
        Object.assign(this, options);
        super.init();
        if (this.USE_CONVOLUTION) {
            throw new Error('Bloom convolution path not ported (unused by the source site)');
        }
        const floatType = this.USE_HD ? HalfFloatType : false;
        this.highPassRenderTarget = fboHelper.createRenderTarget(1, 1, !this.USE_HD, floatType);
        this.highPassMaterial = fboHelper.createRawShaderMaterial({
            uniforms: {
                u_texture: { value: null },
                u_luminosityThreshold: { value: 1 },
                u_smoothWidth: { value: 1 },
                u_lumaStrength: { value: 1 },
                u_selectiveStrength: { value: 1 },
                u_haloWidth: { value: 1 },
                u_haloRGBShift: { value: 1 },
                u_haloLeftColor: { value: this.haloLeftColor },
                u_haloMidColor: { value: this.haloMidColor },
                u_haloRightColor: { value: this.haloRightColor },
                u_haloStrength: { value: 1 },
                u_haloMaskInner: { value: 1 },
                u_haloMaskOuter: { value: 1 },
                u_texelSize: null as never,
                u_aspect: { value: new Vector2() },
                u_dirtTexture: { value: null },
                u_dirtAspect: { value: new Vector2() },
            },
            fragmentShader: highPassFrag,
        });
        (this.highPassMaterial.defines as Record<string, unknown>).USE_LENS_DIRT = this.USE_LENS_DIRT;
        for (let i = 0; i < this.ITERATION; i++) {
            this.renderTargetsHorizontal.push(fboHelper.createRenderTarget(1, 1, false, floatType));
            this.renderTargetsVertical.push(fboHelper.createRenderTarget(1, 1, false, floatType));
            const kernelRadius = 3 + i * 2;
            this.blurMaterials[i] = fboHelper.createRawShaderMaterial({
                uniforms: {
                    u_texture: { value: null },
                    u_resolution: { value: new Vector2() },
                    u_direction: { value: null },
                },
                fragmentShader: bloomBlurFrag,
                defines: { KERNEL_RADIUS: kernelRadius, SIGMA: kernelRadius },
            });
        }
        this.material = fboHelper.createRawShaderMaterial({
            uniforms: {
                u_texture: { value: null },
                u_bloomStrength: { value: 1 },
                u_bloomWeights: { value: [] as number[] },
                u_saturation: { value: 0 },
            },
            fragmentShader: bloomCompositeFrag,
            blending: NoBlending,
            defines: { ITERATION: this.ITERATION },
        });
        for (let i = 0; i < this.ITERATION; i++) {
            (this.material.uniforms as Record<string, { value: unknown }>)['u_blurTexture' + i] = {
                value: this.renderTargetsVertical[i].texture,
            };
        }
    }

    setDirtTexture(texture: Texture): void {
        this.highPassMaterial.uniforms.u_dirtTexture.value = texture;
    }

    needsRender(): boolean {
        return !!this.amount;
    }

    render(post: Postprocessing, toScreen = false): void {
        const width = post.width;
        const height = post.height;
        let halfW = Math.ceil(width / 2);
        let halfH = Math.ceil(height / 2);
        if (halfW !== this.highPassRenderTarget.width || halfH !== this.highPassRenderTarget.height) {
            this.highPassRenderTarget.setSize(halfW, halfH);
            for (let i = 0; i < this.ITERATION; i++) {
                this.renderTargetsHorizontal[i].setSize(halfW, halfH);
                this.renderTargetsVertical[i].setSize(halfW, halfH);
                (this.blurMaterials[i].uniforms.u_resolution.value as Vector2).set(halfW, halfH);
                halfW = Math.ceil(halfW / 2);
                halfH = Math.ceil(halfH / 2);
            }
        }
        const u = this.highPassMaterial.uniforms;
        u.u_texture.value = post.fromTexture;
        u.u_luminosityThreshold.value = this.threshold;
        u.u_smoothWidth.value = this.smoothWidth;
        u.u_lumaStrength.value = this.lumaStrength;
        u.u_selectiveStrength.value = this.selectiveStrength;
        u.u_haloWidth.value = this.haloWidth;
        u.u_haloRGBShift.value = this.haloRGBShift * width;
        const left = this.haloLeftColor.setStyle(this.haloLeftColorHex);
        const mid = this.haloMidColor.setStyle(this.haloMidColorHex);
        const right = this.haloRightColor.setStyle(this.haloRightColorHex);
        const sumR = left.r + mid.r + right.r;
        const sumG = left.g + mid.g + right.g;
        const sumB = left.b + mid.b + right.b;
        left.r = sumR ? left.r / sumR : 1;
        left.g = sumG ? left.g / sumG : 0;
        left.b = sumB ? left.b / sumB : 0;
        mid.r = sumR ? mid.r / sumR : 0;
        mid.g = sumG ? mid.g / sumG : 1;
        mid.b = sumB ? mid.b / sumB : 0;
        right.r = sumR ? right.r / sumR : 0;
        right.g = sumG ? right.g / sumG : 0;
        right.b = sumB ? right.b / sumB : 1;
        u.u_haloStrength.value = this.haloStrength;
        u.u_haloMaskInner.value = this.haloMaskInner;
        u.u_haloMaskOuter.value = this.haloMaskOuter;
        (u as Record<string, unknown>).u_texelSize = post.sharedUniforms.u_texelSize;
        (u as Record<string, unknown>).u_aspect = post.sharedUniforms.u_aspect;
        const useHalo = this.haloStrength > 0;
        let aspect = (height / Math.sqrt(width * width + height * height)) * 2;
        (u.u_aspect.value as Vector2).set((width / height) * aspect, aspect);
        aspect = height / Math.max(width, height);
        (u.u_dirtAspect.value as Vector2).set((width / height) * aspect, aspect);
        this.material!.uniforms.u_saturation.value = this.saturation;
        const defines = this.highPassMaterial.defines as Record<string, unknown>;
        if (defines.USE_HALO !== useHalo) {
            defines.USE_HALO = useHalo;
            this.highPassMaterial.needsUpdate = true;
        }
        fboHelper.render(this.highPassMaterial, this.highPassRenderTarget);
        let source: WebGLRenderTarget = this.highPassRenderTarget;
        for (let i = 0; i < this.ITERATION; i++) {
            const material = this.blurMaterials[i];
            material.uniforms.u_texture.value = source.texture;
            material.uniforms.u_direction.value = this.directionX;
            fboHelper.render(material, this.renderTargetsHorizontal[i]);
            material.uniforms.u_texture.value = this.renderTargetsHorizontal[i].texture;
            material.uniforms.u_direction.value = this.directionY;
            fboHelper.render(material, this.renderTargetsVertical[i]);
            source = this.renderTargetsVertical[i];
        }
        this.material!.uniforms.u_texture.value = post.fromTexture;
        for (let i = 0; i < this.ITERATION; i++) {
            const falloff = (this.ITERATION - i) / this.ITERATION;
            (this.material!.uniforms.u_bloomWeights.value as number[])[i] =
                (this.amount * (falloff + (1.2 - falloff * 2) * this.radius)) / Math.pow(2, this.ITERATION - i - 1);
        }
        super.render(post, toScreen);
    }
}