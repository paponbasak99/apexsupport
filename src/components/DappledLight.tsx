import React, { useEffect, useRef, useImperativeHandle, forwardRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import {
  PlantType,
  PlacementType,
  generatePlantBranches,
  BranchInstance,
  PLACEMENTS,
  clamp,
} from '../lib/botany';

const TWO_PI = 2 * Math.PI;

const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (6 * t - 15) + 10);
};

const wrapAngle = (x: number): number => {
  let t = (x + Math.PI) % TWO_PI;
  if (t < 0) t += TWO_PI;
  return t - Math.PI;
};

const subscribeReducedMotion = (cb: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const getReducedMotionSnapshot = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const parseColor = (col: string): [number, number, number] | null => {
  const s = col.trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none' || s === 'auto') return null;
  try {
    const c = new THREE.Color(s);
    return [c.r, c.g, c.b];
  } catch {
    return null;
  }
};

const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

// Shaders
const vertexQuad = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const leafVertexShader = `
attribute vec4 iLeaf;
attribute vec4 iShape;
uniform vec2 uHalf;
varying vec2 vLocal;
varying vec4 vShape;
varying float vLength;
void main() {
  float r = iLeaf.w * 0.5;
  float halfWidth = r * iShape.x;
  vec2 extent = vec2(r, halfWidth) + iShape.y * 2.4 + 0.003;
  vec2 local = position.xy * extent;
  float c = cos(iLeaf.z);
  float s = sin(iLeaf.z);
  vec2 world = iLeaf.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  gl_Position = vec4(world / uHalf, 0.0, 1.0);
  vLocal = local;
  vShape = iShape;
  vLength = iLeaf.w;
}
`;

const leafFragmentShader = `
varying vec2 vLocal;
varying vec4 vShape;
varying float vLength;
float sdLeaf(vec2 p, float len, float ratio) {
  float r = len * 0.5;
  float w = max(r * ratio, 1e-4);
  float R = (r * r + w * w) / (2.0 * w);
  float d = R - w;
  vec2 q = abs(p);
  return max(length(vec2(q.x, q.y + d)) - R, q.x - r);
}
void main() {
  float sd = sdLeaf(vLocal, vLength, vShape.x);
  float occ = 1.0 - smoothstep(-vShape.y, vShape.y, sd);
  gl_FragColor = vec4(occ * vShape.z);
}
`;

const stemVertexShader = `
attribute vec4 iStem;
attribute vec4 iStemShape;
uniform vec2 uHalf;
varying vec2 vWorld;
varying vec4 vSegment;
varying vec4 vShape;
void main() {
  vec2 a = iStem.xy;
  vec2 b = iStem.zw;
  vec2 axis = b - a;
  float len = max(length(axis), 1e-5);
  vec2 dir = axis / len;
  vec2 perp = vec2(-dir.y, dir.x);
  float pad = iStemShape.x + iStemShape.y * 2.4 + 0.003;
  vec2 center = (a + b) * 0.5;
  vec2 world = center + dir * position.x * (len * 0.5 + pad) + perp * position.y * pad;
  gl_Position = vec4(world / uHalf, 0.0, 1.0);
  vWorld = world;
  vSegment = iStem;
  vShape = iStemShape;
}
`;

const stemFragmentShader = `
varying vec2 vWorld;
varying vec4 vSegment;
varying vec4 vShape;
void main() {
  vec2 pa = vWorld - vSegment.xy;
  vec2 ba = vSegment.zw - vSegment.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float sd = length(pa - ba * h) - vShape.x;
  float occ = 1.0 - smoothstep(-vShape.y, vShape.y, sd);
  gl_FragColor = vec4(occ * vShape.z);
}
`;

const windowMaskSnippet = `
uniform vec2 uHalf;
uniform vec4 uWindow;
uniform float uWindowAngle;
uniform float uWindowOn;
float windowMask(vec2 p, out float falloff) {
  falloff = 1.0;
  if (uWindowOn < 0.5) return 1.0;
  vec2 d = p - uWindow.xy;
  if (uWindowOn > 1.5) {
    vec2 e = d / vec2(uWindow.z * 1.35, uWindow.z);
    float r = length(e);
    falloff = mix(0.55, 1.0, 1.0 - smoothstep(0.0, 1.0, r));
    return 1.0 - smoothstep(0.35, 1.0, r);
  }
  float c = cos(uWindowAngle);
  float s = sin(uWindowAngle);
  vec2 r = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  float size = uWindow.z;
  float soft = uWindow.w;
  float halfLen = size * 1.3;
  float persp = 1.0 + 0.3 * clamp(r.x / halfLen, -1.0, 1.0);
  float y = r.y / persp;
  float halfW = size * 0.5;
  float across = smoothstep(-halfW - soft, -halfW + soft, y) * (1.0 - smoothstep(halfW - soft, halfW + soft, y));
  float along = smoothstep(-halfLen - soft * 2.0, -halfLen + soft * 2.0, r.x) * (1.0 - smoothstep(halfLen - soft * 2.0, halfLen + soft * 2.0, r.x));
  float bar = size * 0.016;
  float mullion = 1.0 - (1.0 - smoothstep(bar, bar + soft * 0.8, abs(y))) * 0.94;
  float transom = 1.0 - (1.0 - smoothstep(bar, bar + soft * 0.8, abs(r.x + halfLen * 0.28))) * 0.9;
  falloff = mix(0.5, 1.0, 1.0 - smoothstep(-halfLen, halfLen, r.x)) * mix(0.8, 1.0, 1.0 - smoothstep(0.0, halfW, abs(y)));
  return across * along * mullion * transom;
}
`;

const lightBackgroundShader = `
uniform sampler2D uMask;
uniform vec3 uBackground;
uniform vec3 uShadowTint;
uniform float uSun;
uniform float uStrength;
uniform float uGrain;
uniform float uTime;
varying vec2 vUv;
${windowMaskSnippet}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uHalf;
  float shade = texture2D(uMask, vUv).r;
  float falloff;
  float win = windowMask(p, falloff);
  float lit = win * (1.0 - shade);
  float amount = clamp((1.0 - lit) * uSun * uStrength, 0.0, 1.0);
  vec3 color = uBackground * (1.0 - amount * (1.0 - uShadowTint));
  float n = hash(gl_FragCoord.xy + fract(uTime * 17.0) * 911.0) - 0.5;
  float mask = smoothstep(0.0, 0.05, amount);
  color += n * uGrain * 0.09 * mask;
  color += (hash(gl_FragCoord.xy * 1.7) - 0.5) / 255.0 * mask;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const darkEmissionShader = `
uniform sampler2D uMask;
uniform vec3 uLightColor;
uniform vec3 uShadowColor;
uniform float uSun;
uniform float uIntensity;
varying vec2 vUv;
${windowMaskSnippet}
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uHalf;
  float shade = texture2D(uMask, vUv).r;
  float falloff;
  float win = windowMask(p, falloff);
  vec3 light = uLightColor * (1.0 - shade) + uShadowColor * shade * 0.08;
  vec3 emission = light * win * falloff * uSun * uIntensity;
  gl_FragColor = vec4(emission, 1.0);
}
`;

const downsampleBloomShader = `
uniform sampler2D uSource;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap(vec2 d) {
  return texture2D(uSource, vUv + d * uTexel).rgb;
}
void main() {
  vec3 a = tap(vec2(-2.0, 2.0));
  vec3 b = tap(vec2(0.0, 2.0));
  vec3 c = tap(vec2(2.0, 2.0));
  vec3 d = tap(vec2(-2.0, 0.0));
  vec3 e = tap(vec2(0.0, 0.0));
  vec3 f = tap(vec2(2.0, 0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2(0.0, -2.0));
  vec3 i = tap(vec2(2.0, -2.0));
  vec3 j = tap(vec2(-1.0, 1.0));
  vec3 k = tap(vec2(1.0, 1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2(1.0, -1.0));
  vec3 color = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(color, 1.0);
}
`;

const upsampleBloomShader = `
uniform sampler2D uSource;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap(vec2 d) {
  return texture2D(uSource, vUv + d * uTexel).rgb;
}
void main() {
  vec3 color = tap(vec2(0.0)) * 4.0
    + (tap(vec2(-1.0, 0.0)) + tap(vec2(1.0, 0.0)) + tap(vec2(0.0, -1.0)) + tap(vec2(0.0, 1.0))) * 2.0
    + tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(color / 16.0, 1.0);
}
`;

const darkCompositeShader = `
uniform sampler2D uEmission;
uniform sampler2D uBloom;
uniform vec3 uBackground;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform float uGrain;
uniform float uTime;
varying vec2 vUv;
vec3 neutral(vec3 color) {
  const float start = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  const float d = 1.0 - start;
  float next = 1.0 - d * d / (peak + d - start);
  color *= next / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - next) + 1.0);
  return mix(color, vec3(next), g);
}
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 c = vUv - 0.5;
  vec2 shift = c * 1.4 / uResolution.y;
  vec3 emission;
  emission.r = texture2D(uEmission, vUv + shift).r;
  emission.g = texture2D(uEmission, vUv).g;
  emission.b = texture2D(uEmission, vUv - shift).b;
  emission += texture2D(uBloom, vUv).rgb * uBloomStrength;
  vec3 light = neutral(max(emission, 0.0));
  light = pow(light, vec3(1.0 / 2.2));
  vec3 color = 1.0 - (1.0 - uBackground) * (1.0 - light);
  float l = max(light.r, max(light.g, light.b));
  float mask = smoothstep(0.0, 0.04, l);
  float n = hash(gl_FragCoord.xy + fract(uTime * 17.0) * 911.0) - 0.5;
  color += n * uGrain * 0.1 * mask;
  color += (hash(gl_FragCoord.xy * 1.7) - 0.5) / 255.0 * mask;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export interface DappledLightProps {
  plant?: PlantType;
  placement?: PlacementType;
  scale?: number;
  density?: number;
  depth?: number;
  softness?: number;
  shadowStrength?: number;
  lightColor?: string;
  shadowColor?: string;
  backgroundColor?: string;
  window?: 'auto' | 'on' | 'off';
  windowAngle?: number;
  windowSize?: number;
  intensity?: number;
  bloom?: number;
  wind?: number;
  windSpeed?: number;
  clouds?: number;
  breeze?: boolean;
  grain?: number;
  seed?: number;
  intro?: boolean;
  paused?: boolean;
  dpr?: number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export interface DappledLightRef {
  gust: (strength?: number) => void;
  replay: () => void;
}

export const DappledLight = forwardRef<DappledLightRef, DappledLightProps>(function DappledLight(
  {
    plant = 'ficus',
    placement = 'top-right',
    scale = 1,
    density = 1,
    depth = 0.7,
    softness = 1,
    shadowStrength = 1,
    lightColor = 'auto',
    shadowColor = 'auto',
    backgroundColor = 'transparent',
    window = 'auto',
    windowAngle = 28,
    windowSize = 0.52,
    intensity = 0.9,
    bloom = 0.6,
    wind = 0.6,
    windSpeed = 1,
    clouds = 0.25,
    breeze = true,
    grain = 0.25,
    seed = 1,
    intro = true,
    paused = false,
    dpr = 2,
    children,
    className = '',
    style,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<any>(null);

  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, () => false);

  const currentProps = {
    plant,
    placement,
    scale,
    density,
    depth,
    softness,
    shadowStrength,
    lightColor,
    shadowColor,
    backgroundColor,
    window,
    windowAngle,
    windowSize,
    intensity,
    bloom,
    wind,
    windSpeed,
    clouds,
    breeze,
    grain,
    seed,
    intro,
    paused,
    dpr,
    reduced: reducedMotion,
  };

  const propsRef = useRef(currentProps);
  useEffect(() => {
    propsRef.current = currentProps;
    engineRef.current?.sync();
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvasHost = canvasHostRef.current;
    if (!container || !canvasHost) return;

    let renderer: THREE.WebGLRenderer | null = null;
    const doc = container.ownerDocument;
    const canvas = doc.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    canvasHost.appendChild(canvas);
    renderer.autoClear = false;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const planeGeo = new THREE.PlaneGeometry(2, 2);
    const postScene = new THREE.Scene();
    const postMesh = new THREE.Mesh(planeGeo);
    postMesh.frustumCulled = false;
    postScene.add(postMesh);

    const halfVec = new THREE.Vector2(1, 0.5);

    // Instanced foliage
    const leafGeo = new THREE.InstancedBufferGeometry();
    leafGeo.index = planeGeo.index;
    leafGeo.setAttribute('position', planeGeo.getAttribute('position'));

    const leafArray = new Float32Array(768);
    const shapeArray = new Float32Array(768);
    const leafAttr = new THREE.InstancedBufferAttribute(leafArray, 4);
    const shapeAttr = new THREE.InstancedBufferAttribute(shapeArray, 4);
    leafAttr.setUsage(THREE.DynamicDrawUsage);
    shapeAttr.setUsage(THREE.DynamicDrawUsage);
    leafGeo.setAttribute('iLeaf', leafAttr);
    leafGeo.setAttribute('iShape', shapeAttr);
    leafGeo.instanceCount = 0;

    const stemGeo = new THREE.InstancedBufferGeometry();
    stemGeo.index = planeGeo.index;
    stemGeo.setAttribute('position', planeGeo.getAttribute('position'));

    const stemArray = new Float32Array(384);
    const stemShapeArray = new Float32Array(384);
    const stemAttr = new THREE.InstancedBufferAttribute(stemArray, 4);
    const stemShapeAttr = new THREE.InstancedBufferAttribute(stemShapeArray, 4);
    stemAttr.setUsage(THREE.DynamicDrawUsage);
    stemShapeAttr.setUsage(THREE.DynamicDrawUsage);
    stemGeo.setAttribute('iStem', stemAttr);
    stemGeo.setAttribute('iStemShape', stemShapeAttr);
    stemGeo.instanceCount = 0;

    const matCommon = {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    };

    const leafMat = new THREE.ShaderMaterial({
      uniforms: { uHalf: { value: halfVec } },
      vertexShader: leafVertexShader,
      fragmentShader: leafFragmentShader,
      ...matCommon,
    });

    const stemMat = new THREE.ShaderMaterial({
      uniforms: { uHalf: { value: halfVec } },
      vertexShader: stemVertexShader,
      fragmentShader: stemFragmentShader,
      ...matCommon,
    });

    const shadowScene = new THREE.Scene();
    const leafMesh = new THREE.Mesh(leafGeo, leafMat);
    const stemMesh = new THREE.Mesh(stemGeo, stemMat);
    leafMesh.frustumCulled = false;
    stemMesh.frustumCulled = false;
    shadowScene.add(stemMesh);
    shadowScene.add(leafMesh);

    // Uniforms and Render Targets
    const sharedUniforms = {
      uHalf: { value: halfVec },
      uWindow: { value: new THREE.Vector4(0, 0, 0.6, 0.03) },
      uWindowAngle: { value: 0 },
      uWindowOn: { value: 0 },
    };

    const bgVec = new THREE.Vector3(1, 1, 1);
    const shadowTintVec = new THREE.Vector3(0.8, 0.78, 0.88);
    const lightColVec = new THREE.Vector3(0.6, 0.5, 1.2);
    const shadowColVec = new THREE.Vector3(0.2, 0.15, 0.45);

    const createTarget = (hdr: boolean) =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });

    const maskTarget = createTarget(false);
    const emissionTarget = createTarget(true);
    const bloomPyramid = Array.from({ length: 5 }, () => createTarget(true));

    const lightMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sharedUniforms,
        uMask: { value: maskTarget.texture },
        uBackground: { value: bgVec },
        uShadowTint: { value: shadowTintVec },
        uSun: { value: 1 },
        uStrength: { value: 1 },
        uGrain: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: vertexQuad,
      fragmentShader: lightBackgroundShader,
      depthTest: false,
      depthWrite: false,
    });

    const emissionMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sharedUniforms,
        uMask: { value: maskTarget.texture },
        uLightColor: { value: lightColVec },
        uShadowColor: { value: shadowColVec },
        uSun: { value: 1 },
        uIntensity: { value: 1 },
      },
      vertexShader: vertexQuad,
      fragmentShader: darkEmissionShader,
      depthTest: false,
      depthWrite: false,
    });

    const downsampleMat = new THREE.ShaderMaterial({
      uniforms: {
        uSource: { value: null },
        uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: vertexQuad,
      fragmentShader: downsampleBloomShader,
      depthTest: false,
      depthWrite: false,
    });

    const upsampleMat = new THREE.ShaderMaterial({
      uniforms: {
        uSource: { value: null },
        uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: vertexQuad,
      fragmentShader: upsampleBloomShader,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        uEmission: { value: emissionTarget.texture },
        uBloom: { value: bloomPyramid[0].texture },
        uBackground: { value: bgVec },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBloomStrength: { value: 0.5 },
        uGrain: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: vertexQuad,
      fragmentShader: darkCompositeShader,
      depthTest: false,
      depthWrite: false,
    });

    let curWidth = 0;
    let curHeight = 0;
    let curDpr = 1;
    let hasSize = false;
    let branches: BranchInstance[] = [];
    let branchCacheKey = '';
    const centerPoint = { x: 0, y: 0 };
    let isLightBg = true;
    let bgColorRGB = [1, 1, 1];
    let colorCacheKey = '';
    let lastColorCheck = -10;
    let simTime = 0;
    let windTime = 0;
    let gustImpulse = 0;
    const pointerVel = { x: 0, y: 0 };
    let pointerState: { x: number; y: number; t: number } | null = null;
    let introStartTime = -1;
    let introDone = false;
    let rafId = 0;
    let lastFrameTime = 0;
    let isIntersecting = false;
    let isDestroyed = false;
    let contextLost = false;

    const getTime = () => performance.now() / 1000;

    const updateSize = () => {
      const cfg = propsRef.current;
      const w = Math.round(container.clientWidth);
      const h = Math.round(container.clientHeight);
      if (w < 2 || h < 2) {
        hasSize = false;
        return false;
      }
      const winView = container.ownerDocument.defaultView ?? globalThis.window;
      const s = Math.min(winView.devicePixelRatio || 1, Math.max(cfg.dpr, 0.5));
      if (hasSize && w === curWidth && h === curHeight && s === curDpr) return false;

      hasSize = true;
      curWidth = w;
      curHeight = h;
      curDpr = s;
      renderer!.setPixelRatio(curDpr);
      renderer!.setSize(curWidth, curHeight, false);
      maskTarget.setSize(curWidth, curHeight);
      emissionTarget.setSize(curWidth, curHeight);

      let bw = curWidth;
      let bh = curHeight;
      for (const target of bloomPyramid) {
        bw = Math.max(1, Math.round(bw / 2));
        bh = Math.max(1, Math.round(bh / 2));
        target.setSize(bw, bh);
      }

      halfVec.set(curWidth / curHeight / 2, 0.5);
      compositeMat.uniforms.uResolution.value.set(curWidth, curHeight);
      branchCacheKey = '';
      return true;
    };

    const detectBackgroundColor = () => {
      const winView = container.ownerDocument.defaultView ?? globalThis.window;
      bgColorRGB = parseColor(propsRef.current.backgroundColor) ?? (() => {
        let el: HTMLElement | null = container.parentElement;
        while (el) {
          const bg = winView.getComputedStyle(el).backgroundColor;
          const match = bg.match(/rgba?\(([^)]+)\)/);
          if (match) {
            const vals = match[1].split(',').map((v: string) => Number.parseFloat(v));
            if (vals.length < 4 || vals[3] > 0.05) return [vals[0] / 255, vals[1] / 255, vals[2] / 255];
          }
          el = el.parentElement;
        }
        return [0.035, 0.04, 0.06];
      })();
    };

    const updateColors = () => {
      const cfg = propsRef.current;
      const key = [bgColorRGB.join(','), cfg.lightColor, cfg.shadowColor].join('|');
      if (key === colorCacheKey) return;
      colorCacheKey = key;

      isLightBg = 0.2126 * bgColorRGB[0] + 0.7152 * bgColorRGB[1] + 0.0722 * bgColorRGB[2] > 0.5;
      bgVec.set(bgColorRGB[0], bgColorRGB[1], bgColorRGB[2]);

      const shadow = parseColor(cfg.shadowColor) ?? (isLightBg ? [0.71, 0.69, 0.82] : [0.24, 0.18, 0.5]);
      const light = parseColor(cfg.lightColor) ?? (isLightBg ? [1, 0.96, 0.9] : [0.56, 0.49, 1]);

      shadowTintVec.set(shadow[0], shadow[1], shadow[2]);
      lightColVec.set(toLinear(light[0]), toLinear(light[1]), toLinear(light[2]));
      shadowColVec.set(toLinear(shadow[0]), toLinear(shadow[1]), toLinear(shadow[2]));
    };

    const triggerGust = (strength = 1) => {
      if (propsRef.current.reduced) return;
      const str = clamp(strength, 0, 3);
      const now = getTime();
      branches.forEach((b, idx) => {
        b.kick = Math.min(b.kick + str * (0.75 + 0.2 * Math.sin(2.3 * idx)), 2.2);
        b.kickAt = now + 0.05 + 0.09 * idx + 0.08 * b.depth;
      });
      gustImpulse = Math.min(gustImpulse + 0.6 * str, 1.5);
      scheduleRender();
    };

    const windNoise = (t: number, phase: number) =>
      0.55 * Math.sin(0.71 * t + phase) +
      0.3 * Math.sin(1.37 * t + 2.1 * phase) +
      0.15 * Math.sin(2.93 * t + 0.7 * phase);

    const scheduleRender = () => {
      if (isDestroyed || contextLost || !isIntersecting || rafId) return;
      rafId = requestAnimationFrame(renderLoop);
    };

    function renderLoop(time: number) {
      rafId = 0;
      if (isDestroyed || contextLost || (!hasSize && (updateSize(), !hasSize))) return;

      const cfg = propsRef.current;
      const dt = lastFrameTime && time - lastFrameTime < 100 ? Math.min(Math.max((time - lastFrameTime) / 1000, 0), 0.05) : 1 / 60;
      lastFrameTime = time;

      const now = getTime();
      const reduced = cfg.reduced;

      updateSize();
      if (now - lastColorCheck > 1.2) {
        lastColorCheck = now;
        detectBackgroundColor();
      }
      updateColors();

      const aspect = curWidth / curHeight;
      const geomKey = [cfg.plant, cfg.placement, cfg.scale, cfg.density, cfg.seed, aspect.toFixed(3)].join('|');
      if (geomKey !== branchCacheKey) {
        branchCacheKey = geomKey;
        branches = generatePlantBranches(cfg.plant, cfg.placement, cfg.scale, cfg.density, cfg.seed, aspect);

        let totalLen = 0;
        centerPoint.x = 0;
        centerPoint.y = 0;
        for (const b of branches) {
          centerPoint.x += (b.base[0] + Math.cos(b.angle) * b.length * 0.55) * b.length;
          centerPoint.y += (b.base[1] + Math.sin(b.angle) * b.length * 0.55) * b.length;
          totalLen += b.length;
        }
        if (totalLen > 0) {
          centerPoint.x /= totalLen;
          centerPoint.y /= totalLen;
        }
      }

      const activeAnim = !cfg.paused && !reduced;
      if (activeAnim) {
        simTime += dt;
        windTime += dt * clamp(cfg.windSpeed, 0, 4) * (1 + 0.8 * Math.min(Math.hypot(pointerVel.x, pointerVel.y), 1.5) + gustImpulse);
      }

      const decay = Math.exp(-dt / 1.3);
      pointerVel.x *= decay;
      pointerVel.y *= decay;
      gustImpulse *= Math.exp(-dt / 1.6);
      if (gustImpulse < 0.001) gustImpulse = 0;

      if (introStartTime < 0) {
        introStartTime = now;
        introDone = reduced || !cfg.intro;
      }

      let introProgress = 1;
      if (!introDone) {
        introProgress = smooth((now - introStartTime) / 2.4);
        if (introProgress >= 1) introDone = true;
      }

      const cloudFreq = reduced ? 0 : clamp(cfg.clouds, 0, 1);
      const cloudFactor = cloudFreq > 0 ? smooth((Math.sin(0.037 * simTime + 1.3) * Math.sin(0.023 * simTime) - 0.25) / 0.45) : 0;
      const sunIntensity = introProgress * (1 - 0.6 * cloudFreq * cloudFactor);

      const effectiveWind = reduced ? 0 : clamp(cfg.wind, 0, 2);
      const softness = clamp(cfg.softness, 0, 3);
      const depthScale = clamp(cfg.depth, 0, 1.5);
      const windSway = 0.55 + 0.45 * Math.sin(0.21 * windTime) * Math.sin(0.13 * windTime + 1.1);

      let leafCount = 0;
      let stemCount = 0;

      for (const b of branches) {
        const perpX = -Math.sin(b.angle);
        const perpY = Math.cos(b.angle);
        const pointerDot = pointerVel.x * perpX + pointerVel.y * perpY;
        const windForce = effectiveWind * windNoise(windTime, b.phase) * windSway * 0.16 + 0.3 * pointerDot;

        if (b.kick > 0 && now >= b.kickAt && !reduced) {
          b.velocity += b.kick * (b.angle > -Math.PI / 2 && b.angle < Math.PI / 2 ? 1 : -1) * 0.55;
          b.kick = 0;
        }

        const natFreq = TWO_PI / (1.5 + 0.9 * b.depth + 0.4 * b.length);
        if (reduced) {
          b.bend = 0;
          b.velocity = 0;
        } else {
          const subSteps = Math.max(1, Math.ceil(120 * dt));
          const subDt = dt / subSteps;
          for (let s = 0; s < subSteps; s++) {
            b.velocity += (natFreq * natFreq * (windForce - b.bend) - 0.6 * natFreq * b.velocity) * subDt;
            b.bend += b.velocity * subDt;
          }
        }

        const depth = b.depth * depthScale;
        const blurRadius = (0.0016 + 0.028 * depth * depth + 0.004 * depth) * (0.3 + 0.7 * softness) * (1 + 1.6 * cloudFreq * cloudFactor) * (1 + 2.6 * (1 - introProgress));
        const shadowOpacity = clamp(0.98 - 0.36 * depth, 0.3, 1);
        const segLen = b.length / b.segments;

        let curX = b.base[0];
        let curY = b.base[1];
        let curAngle = b.angle;
        const backbone: [number, number, number][] = [[curX, curY, curAngle]];

        for (let seg = 1; seg <= b.segments; seg++) {
          const t = seg / b.segments;
          const curveWeight = Math.pow(t, 1.4);
          curAngle += (b.curl / b.segments) * 2;
          curAngle += wrapAngle(-Math.PI / 2 - curAngle) * b.droop * 0.5;
          curAngle += b.bend * curveWeight * 0.9 + (reduced ? 0 : 0.012 * effectiveWind * Math.sin(3.1 * windTime + seg + b.phase));

          const nextX = curX + Math.cos(curAngle) * segLen;
          const nextY = curY + Math.sin(curAngle) * segLen;

          if (stemCount < 96) {
            stemArray.set([curX, curY, nextX, nextY], 4 * stemCount);
            stemShapeArray.set([b.thickness * (1.25 - 0.8 * t) * clamp(cfg.scale, 0.3, 2.5) * clamp(aspect / 1.5, 0.48, 1), blurRadius, shadowOpacity, 0], 4 * stemCount);
            stemCount++;
          }

          curX = nextX;
          curY = nextY;
          backbone.push([curX, curY, curAngle]);
        }

        for (const leaf of b.leaves) {
          if (leafCount >= 192) break;
          const node = backbone[Math.min(leaf.at, backbone.length - 1)];
          const leafFlutter = reduced ? 0 : Math.sin(windTime * leaf.rate + leaf.flutter) * (0.05 + 0.22 * Math.abs(windForce) * 6) * effectiveWind;
          let leafAngle = node[2] + (leaf.side === 0 ? leaf.tilt + 0.6 * leafFlutter : leaf.side * (leaf.tilt + leafFlutter));
          leafAngle += wrapAngle(-Math.PI / 2 - leafAngle) * leaf.droop * 0.35;

          const leafOffset = 0.55 * leaf.length;
          const leafX = node[0] + Math.cos(leafAngle) * leafOffset;
          const leafY = node[1] + Math.sin(leafAngle) * leafOffset;

          leafArray.set([leafX, leafY, leafAngle, leaf.length], 4 * leafCount);
          shapeArray.set([leaf.width, blurRadius, shadowOpacity, leaf.kind], 4 * leafCount);
          leafCount++;
        }
      }

      leafGeo.instanceCount = leafCount;
      stemGeo.instanceCount = stemCount;
      leafAttr.needsUpdate = true;
      shapeAttr.needsUpdate = true;
      stemAttr.needsUpdate = true;
      stemShapeAttr.needsUpdate = true;

      const isWindowOn = cfg.window === 'on' || (cfg.window === 'auto' && !isLightBg);
      sharedUniforms.uWindowOn.value = isWindowOn ? 1 : 2 * (!isLightBg ? 1 : 0);

      const placeMeta = PLACEMENTS[cfg.placement] ?? PLACEMENTS['top-right'];
      const winSize = clamp(cfg.windowSize, 0.2, 2) * clamp(aspect / 1.5, 0.48, 1) * (isWindowOn ? 1 : 1.25);
      const winLimit = aspect * 0.5 - 0.35 * winSize;
      const winSoftness = (0.018 + 0.03 * clamp(cfg.softness, 0, 3)) * (1 + 0.8 * cloudFreq * cloudFactor + 1.5 * (1 - introProgress));

      sharedUniforms.uWindow.value.set(
        clamp(0.68 * centerPoint.x, -Math.max(winLimit, 0), Math.max(winLimit, 0)),
        clamp(0.62 * centerPoint.y, -0.32, 0.32),
        winSize,
        winSoftness
      );

      sharedUniforms.uWindowAngle.value = (clamp(cfg.windowAngle, -90, 90) * Math.PI * placeMeta.x * (placeMeta.y < 0 ? -1 : 1)) / 180;

      // Render Shadow Occlusion Mask
      renderer!.setRenderTarget(maskTarget);
      renderer!.setClearColor(0, 0);
      renderer!.clear();
      renderer!.render(shadowScene, camera);

      if (isLightBg) {
        lightMat.uniforms.uSun.value = sunIntensity;
        lightMat.uniforms.uStrength.value = clamp(cfg.shadowStrength, 0, 1.5);
        lightMat.uniforms.uGrain.value = clamp(cfg.grain, 0, 1);
        lightMat.uniforms.uTime.value = simTime;
        postMesh.material = lightMat;
        renderer!.setRenderTarget(null);
        renderer!.render(postScene, camera);
      } else {
        emissionMat.uniforms.uSun.value = sunIntensity;
        emissionMat.uniforms.uIntensity.value = clamp(cfg.intensity, 0, 4);
        postMesh.material = emissionMat;
        renderer!.setRenderTarget(emissionTarget);
        renderer!.render(postScene, camera);

        const bloomPower = clamp(cfg.bloom, 0, 2);
        if (bloomPower > 0) {
          postMesh.material = downsampleMat;
          let currentSrc = emissionTarget;
          for (const target of bloomPyramid) {
            downsampleMat.uniforms.uSource.value = currentSrc.texture;
            downsampleMat.uniforms.uTexel.value.set(1 / currentSrc.width, 1 / currentSrc.height);
            renderer!.setRenderTarget(target);
            renderer!.render(postScene, camera);
            currentSrc = target;
          }

          postMesh.material = upsampleMat;
          for (let i = bloomPyramid.length - 1; i > 0; i--) {
            const highLevel = bloomPyramid[i];
            const lowerLevel = bloomPyramid[i - 1];
            upsampleMat.uniforms.uSource.value = highLevel.texture;
            upsampleMat.uniforms.uTexel.value.set(1 / highLevel.width, 1 / highLevel.height);
            renderer!.setRenderTarget(lowerLevel);
            renderer!.render(postScene, camera);
          }
        }

        compositeMat.uniforms.uBloomStrength.value = 0.6 * bloomPower;
        compositeMat.uniforms.uGrain.value = clamp(cfg.grain, 0, 1);
        compositeMat.uniforms.uTime.value = simTime;
        postMesh.material = compositeMat;
        renderer!.setRenderTarget(null);
        renderer!.render(postScene, camera);
      }

      const hasPhysicsMotion =
        Math.abs(pointerVel.x) + Math.abs(pointerVel.y) > 0.001 ||
        gustImpulse > 0 ||
        branches.some((b) => Math.abs(b.velocity) > 0.0001 || Math.abs(b.bend) > 0.0001 || b.kick > 0);

      if (activeAnim || !introDone || hasPhysicsMotion) {
        scheduleRender();
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const cfg = propsRef.current;
      if (!cfg.breeze || cfg.reduced) return;
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const now = performance.now();

      if (pointerState) {
        const dt = Math.max((now - pointerState.t) / 1000, 1 / 240);
        const invH = 1 / Math.max(curHeight, 1);
        const vx = ((px - pointerState.x) * invH) / dt;
        const vy = -((py - pointerState.y) * invH) / dt;
        const smoothFactor = 0.35 * clamp(dt / 0.12, 0, 1);
        pointerVel.x += (clamp(vx, -4, 4) - pointerVel.x) * smoothFactor;
        pointerVel.y += (clamp(vy, -4, 4) - pointerVel.y) * smoothFactor;
        const speed = Math.hypot(pointerVel.x, pointerVel.y);
        if (speed > 2) {
          pointerVel.x *= 2 / speed;
          pointerVel.y *= 2 / speed;
        }
      }

      pointerState = { x: px, y: py, t: now };
      scheduleRender();
    };

    const onPointerLeave = () => {
      pointerState = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!propsRef.current.breeze || !e.isPrimary || e.button > 0) return;
      const target = e.target;
      if (target instanceof Element && target.closest('a, button, input, textarea, select, label, [role=button]')) {
        return;
      }
      triggerGust(0.9);
    };

    const winObj = container.ownerDocument.defaultView ?? globalThis.window;
    winObj.addEventListener('pointermove', onPointerMove);
    winObj.addEventListener('pointerleave', onPointerLeave);
    winObj.addEventListener('pointerdown', onPointerDown);

    const resizeObserver = new ResizeObserver(() => {
      if (updateSize()) scheduleRender();
    });
    resizeObserver.observe(container);

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              isIntersecting = entry.isIntersecting;
              if (isIntersecting) {
                lastFrameTime = 0;
                scheduleRender();
              } else if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
              }
            },
            { rootMargin: '80px' }
          )
        : null;

    if (intersectionObserver) {
      intersectionObserver.observe(container);
    } else {
      isIntersecting = true;
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const onContextRestored = () => {
      contextLost = false;
      colorCacheKey = '';
      renderer?.resetState();
      maskTarget.setSize(curWidth, curHeight);
      emissionTarget.setSize(curWidth, curHeight);
      leafAttr.needsUpdate = true;
      shapeAttr.needsUpdate = true;
      stemAttr.needsUpdate = true;
      stemShapeAttr.needsUpdate = true;
      [leafMat, stemMat, lightMat, emissionMat, downsampleMat, upsampleMat, compositeMat].forEach((m) => {
        m.needsUpdate = true;
      });
      scheduleRender();
    };

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    updateSize();
    detectBackgroundColor();
    updateColors();
    scheduleRender();

    const engineInstance = {
      sync: () => {
        updateSize();
        detectBackgroundColor();
        scheduleRender();
      },
      gust: triggerGust,
      replay: () => {
        introStartTime = -1;
        introDone = false;
        scheduleRender();
      },
      destroy: () => {
        isDestroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        intersectionObserver?.disconnect();
        resizeObserver.disconnect();
        winObj.removeEventListener('pointermove', onPointerMove);
        winObj.removeEventListener('pointerleave', onPointerLeave);
        winObj.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        canvas.removeEventListener('webglcontextrestored', onContextRestored);

        maskTarget.dispose();
        emissionTarget.dispose();
        bloomPyramid.forEach((t) => t.dispose());
        [leafMat, stemMat, lightMat, emissionMat, downsampleMat, upsampleMat, compositeMat].forEach((m) => m.dispose());
        leafGeo.dispose();
        stemGeo.dispose();
        planeGeo.dispose();
        renderer?.dispose();
        canvas.remove();
      },
    };

    engineRef.current = engineInstance;

    return () => {
      engineInstance.destroy();
      engineRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      gust: (str?: number) => engineRef.current?.gust(str),
      replay: () => engineRef.current?.replay(),
    }),
    []
  );

  const cleanBg = backgroundColor.trim().toLowerCase();

  return (
    <div
      ref={containerRef}
      className={`relative isolate h-full min-h-[320px] w-full overflow-hidden ${className}`}
      style={{
        backgroundColor: cleanBg === 'transparent' || cleanBg === '' ? undefined : backgroundColor,
        ...style,
      }}
    >
      <div ref={canvasHostRef} aria-hidden="true" className="absolute inset-0 z-0 pointer-events-none" />
      {children && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
});

DappledLight.displayName = 'DappledLight';
