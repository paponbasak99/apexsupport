import { Renderer, Program, Mesh, Triangle } from './libs/ogl.mjs';

const hexToRgb = hex => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
};

const detailToSteps = detail => {
  if (detail === 'low') return 40.0;
  if (detail === 'high') return 110.0;
  return 70.0;
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, clamp(pos.z * 0.08 + 0.5, 0.0, 1.0));
  vec3 col = mix(uHorizonColor, body, t);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`;

class GradientWavesElement extends HTMLElement {
  constructor() {
    super();
    this.options = {
      horizonColor: '#5a30ff',
      waveColor: '#ffffff',
      crestColor: '#FFFFFF',
      speed: 0.4,
      amplitude: 2.5,
      waveScale: 0.6,
      waveRatio: 0.9,
      swell: 35,
      turbulence: 20,
      tilt: 1.11,
      zoom: 1.0,
      height: 5.5,
      fogDepth: 15,
      detail: 'medium',
      brightness: 1.0,
      opacity: 1.0,
      mouseInteraction: true,
      parallaxStrength: 0.5,
      grain: true,
      grainIntensity: 0.05
    };
    this.raf = 0;
    this.isVisible = true;
    this.isPageVisible = !document.hidden;
    this.currentMouse = [0.5, 0.5];
    this.targetMouse = [0.5, 0.5];
  }

  static get observedAttributes() {
    return [
      'horizon-color', 'data-horizon-color',
      'wave-color', 'data-wave-color',
      'crest-color', 'data-crest-color',
      'speed', 'amplitude', 'wave-scale', 'wave-ratio',
      'swell', 'turbulence', 'tilt', 'zoom', 'height',
      'fog-depth', 'detail', 'brightness', 'opacity',
      'mouse-interaction', 'parallax-strength', 'grain', 'grain-intensity'
    ];
  }

  attributeChangedCallback() {
    this.parseAttributes();
    this.updateUniforms();
  }

  connectedCallback() {
    this.parseAttributes();
    this.initWebGL();
    this.setupListeners();
  }

  disconnectedCallback() {
    this.tryStop();
    if (this.ro) this.ro.disconnect();
    if (this.io) this.io.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    try {
      if (this.canvas && this.contains(this.canvas)) {
        this.removeChild(this.canvas);
      }
    } catch {}
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  parseAttributes() {
    for (const key in this.options) {
      const kebabKey = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
      const attr = this.getAttribute(`data-${kebabKey}`) ??
                   this.getAttribute(kebabKey) ??
                   this.getAttribute(key);
      if (attr !== null) {
        let val = attr;
        if (typeof this.options[key] === 'number') {
          val = parseFloat(val);
          if (isNaN(val)) val = this.options[key];
        } else if (typeof this.options[key] === 'boolean') {
          val = val === 'true' || val === '' || val === '1';
        }
        this.options[key] = val;
      }
    }
  }

  initWebGL() {
    try {
      this.renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
      });
    } catch (e) {
      console.warn('WebGL2 not supported for GradientWaves:', e);
      return;
    }

    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.canvas = this.gl.canvas;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.pointerEvents = 'none';
    this.appendChild(this.canvas);

    const geometry = new Triangle(this.gl);
    
    const hc = hexToRgb(this.options.horizonColor);
    const wc = hexToRgb(this.options.waveColor);
    const cc = hexToRgb(this.options.crestColor);

    this.program = new Program(this.gl, {
      vertex,
      fragment,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uSpeed: { value: this.options.speed },
        uAmplitude: { value: this.options.amplitude },
        uWaveScale: { value: this.options.waveScale },
        uWaveRatio: { value: this.options.waveRatio },
        uSwell: { value: this.options.swell },
        uTurbulence: { value: this.options.turbulence },
        uTilt: { value: this.options.tilt },
        uZoom: { value: this.options.zoom },
        uHeight: { value: this.options.height },
        uFogDepth: { value: this.options.fogDepth },
        uSteps: { value: detailToSteps(this.options.detail) },
        uBrightness: { value: this.options.brightness },
        uOpacity: { value: this.options.opacity },
        uGrain: { value: this.options.grain ? 1.0 : 0.0 },
        uGrainIntensity: { value: this.options.grainIntensity },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uParallax: { value: this.options.parallaxStrength },
        uEnableMouse: { value: this.options.mouseInteraction },
        uHorizonColor: { value: new Float32Array(hc) },
        uWaveColor: { value: new Float32Array(wc) },
        uCrestColor: { value: new Float32Array(cc) }
      }
    });

    this.mesh = new Mesh(this.gl, { geometry, program: this.program });

    this.onResize = () => this.setSize();
    this.ro = new ResizeObserver(() => this.setSize());
    this.ro.observe(this);
    window.addEventListener('resize', this.onResize, { passive: true });
    this.setSize();
  }

  updateUniforms() {
    if (!this.program) return;
    const u = this.program.uniforms;
    u.uSpeed.value = this.options.speed;
    u.uAmplitude.value = this.options.amplitude;
    u.uWaveScale.value = this.options.waveScale;
    u.uWaveRatio.value = this.options.waveRatio;
    u.uSwell.value = this.options.swell;
    u.uTurbulence.value = this.options.turbulence;
    u.uTilt.value = this.options.tilt;
    u.uZoom.value = this.options.zoom;
    u.uHeight.value = this.options.height;
    u.uFogDepth.value = this.options.fogDepth;
    u.uSteps.value = detailToSteps(this.options.detail);
    u.uBrightness.value = this.options.brightness;
    u.uOpacity.value = this.options.opacity;
    u.uGrain.value = this.options.grain ? 1.0 : 0.0;
    u.uGrainIntensity.value = this.options.grainIntensity;
    u.uParallax.value = this.options.parallaxStrength;
    u.uEnableMouse.value = this.options.mouseInteraction;

    const hc = hexToRgb(this.options.horizonColor);
    const wc = hexToRgb(this.options.waveColor);
    const cc = hexToRgb(this.options.crestColor);
    u.uHorizonColor.value.set(hc);
    u.uWaveColor.value.set(wc);
    u.uCrestColor.value.set(cc);
  }

  setSize() {
    if (!this.renderer || !this.program) return;
    const rect = this.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || window.innerWidth));
    const h = Math.max(1, Math.floor(rect.height || window.innerHeight));
    this.renderer.setSize(w, h);
    const res = this.program.uniforms.iResolution.value;
    res[0] = this.gl.drawingBufferWidth;
    res[1] = this.gl.drawingBufferHeight;
    this.renderer.render({ scene: this.mesh });
  }

  setupListeners() {
    this.onPointerMove = e => {
      this.targetMouse[0] = e.clientX / window.innerWidth;
      this.targetMouse[1] = 1.0 - (e.clientY / window.innerHeight);
    };

    this.onPointerLeave = () => {
      this.targetMouse[0] = 0.5;
      this.targetMouse[1] = 0.5;
    };

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });

    this.t0 = performance.now();
    this.loop = this.loop.bind(this);

    this.onVisibility = () => {
      this.isPageVisible = !document.hidden;
      this.isPageVisible ? this.tryStart() : this.tryStop();
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.tryStart();
  }

  loop(t) {
    if (!this.program || !this.renderer) return;
    this.program.uniforms.iTime.value = (t - this.t0) * 0.001;
    const tx = this.options.mouseInteraction ? this.targetMouse[0] : 0.5;
    const ty = this.options.mouseInteraction ? this.targetMouse[1] : 0.5;
    this.currentMouse[0] += 0.05 * (tx - this.currentMouse[0]);
    this.currentMouse[1] += 0.05 * (ty - this.currentMouse[1]);
    this.program.uniforms.uMouse.value[0] = this.currentMouse[0];
    this.program.uniforms.uMouse.value[1] = this.currentMouse[1];
    this.renderer.render({ scene: this.mesh });
    this.raf = requestAnimationFrame(this.loop);
  }

  tryStart() {
    if (this.isPageVisible && this.raf === 0) {
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  tryStop() {
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
}

if (!customElements.get('gradient-waves')) {
  customElements.define('gradient-waves', GradientWavesElement);
}

export { GradientWavesElement };
