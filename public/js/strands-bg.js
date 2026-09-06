import { Renderer, Program, Mesh, Color, Triangle, RenderTarget } from 'https://esm.sh/ogl';

const MAX_STRANDS = 12;
const MAX_COLORS = 8;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform int uStrandCount;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaviness;
uniform float uThickness;
uniform float uGlow;
uniform float uTaper;
uniform float uSpread;
uniform float uHueShift;
uniform float uIntensity;
uniform float uOpacity;
uniform float uScale;
uniform float uSaturation;

out vec4 fragColor;

const float PI = 3.14159265;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(2.0 * PI * (t + vec3(0.00, 0.33, 0.67)));
}

vec3 samplePalette(float t) {
  t = fract(t);
  float scaled = t * float(uColorCount);
  int idx = int(floor(scaled));
  float blend = fract(scaled);
  int nextIdx = idx + 1;
  if (nextIdx >= uColorCount) nextIdx = 0;
  return mix(uColors[idx], uColors[nextIdx], blend);
}

vec3 strandColor(float t) {
  if (uColorCount > 0) return samplePalette(t);
  return spectrum(t);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  uv /= max(uScale, 0.0001);

  float e = 0.06 + uIntensity * 0.94;
  float env = pow(max(cos(uv.x * PI * 1.3), 0.0), uTaper);

  vec3 col = vec3(0.0);

  for (int i = 0; i < ${MAX_STRANDS}; i++) {
    if (i >= uStrandCount) break;

    float fi = float(i);
    float ph = fi * 1.7 * uSpread;
    float freq = (2.0 + fi * 0.35) * uWaviness;
    float spd = 1.4 + fi * 1.2;

    float tt = uTime * uSpeed;
    float w = sin(uv.x * freq + tt * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - tt * spd * 0.7 + ph * 1.7) * 0.40;

    float amp = (0.1 + 0.02 * e) * env * uAmplitude;
    float y = w * amp;

    float d = abs(uv.y - y);
    float thick = (0.001 + 0.05 * e) * (0.35 + env) * uThickness;
    float g = thick / (d + thick * 0.45);
    g = g * g;

    float h = fi / float(uStrandCount) + uv.x * 0.30 + uTime * 0.04 + uHueShift;
    col += strandColor(h) * g * env;
  }

  col *= 0.45 + 0.7 * e;
  col = 1.0 - exp(-col * uGlow);

  float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(gray), col, uSaturation), 0.0);

  float lum = max(max(col.r, col.g), col.b);
  float alpha = clamp(lum, 0.0, 1.0) * uOpacity;

  fragColor = vec4(col * uOpacity, alpha);
}
`;

const GLASS_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uRadius;
uniform float uRefraction;
uniform float uDispersion;

out vec4 fragColor;

vec2 toUv(vec2 p) {
  return p * (uResolution.y / uResolution) + 0.5;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float d = length(p);
  float r = uRadius;

  float edge = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(r - edge, r + edge, d);
  if (mask <= 0.0) {
    fragColor = vec4(0.0);
    return;
  }

  // sphere height: 0 at the rim, 1 at the center
  float z = sqrt(max(r * r - d * d, 0.0)) / r;
  float nd = d / r; // 0 at the center, 1 at the rim

  // refraction is confined to a narrow band near the rim; the rest stays undistorted
  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
  vec2 offset = -dir * lens * uRefraction * 0.15;
  vec2 disp = -dir * lens * uDispersion * 0.012;

  vec3 light;
  light.r = texture(uScene, toUv(p + offset - disp)).r;
  light.g = texture(uScene, toUv(p + offset)).g;
  light.b = texture(uScene, toUv(p + offset + disp)).b;

  // neutral fresnel rim (no color tint so the glass stays clear)
  float fres = pow(1.0 - z, 3.0);
  vec3 rim = vec3(1.0) * fres * 0.18;

  // specular highlight from the upper-left
  vec2 lightDir = normalize(vec2(-0.55, 0.6));
  float spec = pow(max(dot(p / max(r, 1e-4), lightDir), 0.0), 6.0);
  spec *= smoothstep(r, r * 0.55, d);

  vec3 emissive = light + rim + vec3(spec) * 0.4;
  float emissiveA = clamp(max(max(emissive.r, emissive.g), emissive.b), 0.0, 1.0);

  // almost clear glass body: only a faint neutral darkening, mostly near the rim
  float bodyA = 0.05 + fres * 0.05;

  // composite emissive light over the clear body (premultiplied)
  float outA = emissiveA + bodyA * (1.0 - emissiveA);
  vec3 outRGB = emissive;

  outRGB *= mask;
  outA *= mask;

  fragColor = vec4(outRGB, outA);
}
`;

const buildPalette = colors => {
  const filled = colors && colors.length ? colors : ['#ffffff'];
  const padded = [];
  for (let i = 0; i < MAX_COLORS; i++) {
    const hex = filled[i] ?? filled[filled.length - 1];
    const c = new Color(hex);
    padded.push([c.r, c.g, c.b]);
  }
  return padded;
};

class StrandsElement extends HTMLElement {
  constructor() {
    super();
    this.options = {
      colors: ['#F97316', '#7C3AED', '#06B6D4'], // Match user request colors
      count: 3,
      speed: 0.5,
      amplitude: 1,
      waviness: 1,
      thickness: 0.7,
      glow: 2.6,
      taper: 3,
      spread: 1,
      hueShift: 0,
      intensity: 0.6,
      saturation: 1.5,
      opacity: 1,
      scale: 1.5,
      glass: false,
      refraction: 1,
      dispersion: 1,
      glassSize: 1
    };
    this.raf = 0;
  }

  connectedCallback() {
    this.parseAttributes();
    this.initWebGL();
  }

  disconnectedCallback() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resizeHandler);
    try {
      this.removeChild(this.gl.canvas);
    } catch {}
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  parseAttributes() {
    for (const key in this.options) {
      const kebabKey = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
      if (this.hasAttribute(`data-${kebabKey}`)) {
        let val = this.getAttribute(`data-${kebabKey}`);
        if (key === 'colors') {
          val = val.split(',').map(c => c.trim());
        } else if (typeof this.options[key] === 'number') {
          val = parseFloat(val);
        } else if (typeof this.options[key] === 'boolean') {
          val = val === 'true';
        }
        this.options[key] = val;
      }
    }
  }

  initWebGL() {
    this.renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.canvas.style.backgroundColor = 'transparent';

    const geometry = new Triangle(this.gl);
    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    this.program = new Program(this.gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [this.offsetWidth, this.offsetHeight] },
        uColors: { value: buildPalette(this.options.colors) },
        uColorCount: { value: Math.min(this.options.colors.length, MAX_COLORS) },
        uStrandCount: { value: Math.min(this.options.count, MAX_STRANDS) },
        uSpeed: { value: this.options.speed },
        uAmplitude: { value: this.options.amplitude },
        uWaviness: { value: this.options.waviness },
        uThickness: { value: this.options.thickness },
        uGlow: { value: this.options.glow },
        uTaper: { value: this.options.taper },
        uSpread: { value: this.options.spread },
        uHueShift: { value: this.options.hueShift },
        uIntensity: { value: this.options.intensity },
        uOpacity: { value: this.options.opacity },
        uScale: { value: this.options.scale },
        uSaturation: { value: this.options.saturation }
      }
    });

    this.mesh = new Mesh(this.gl, { geometry, program: this.program });

    this.renderTarget = new RenderTarget(this.gl, {
      width: this.offsetWidth,
      height: this.offsetHeight
    });

    this.glassProgram = new Program(this.gl, {
      vertex: VERT,
      fragment: GLASS_FRAG,
      uniforms: {
        uScene: { value: this.renderTarget.texture },
        uResolution: { value: [this.offsetWidth, this.offsetHeight] },
        uRadius: { value: 0.46 * this.options.glassSize },
        uRefraction: { value: this.options.refraction },
        uDispersion: { value: this.options.dispersion }
      }
    });
    this.glassMesh = new Mesh(this.gl, { geometry, program: this.glassProgram });

    this.appendChild(this.gl.canvas);

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener('resize', this.resizeHandler);
    this.resize();

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  resize() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;
    this.renderer.setSize(width, height);
    this.program.uniforms.uResolution.value = [width, height];
    this.renderTarget.setSize(width, height);
    this.glassProgram.uniforms.uResolution.value = [width, height];
  }

  loop(t) {
    this.raf = requestAnimationFrame(this.loop);
    
    this.program.uniforms.uTime.value = t * 0.001;
    this.program.uniforms.uColors.value = buildPalette(this.options.colors);
    this.program.uniforms.uColorCount.value = Math.min(this.options.colors.length, MAX_COLORS);
    this.program.uniforms.uStrandCount.value = Math.min(Math.max(Math.round(this.options.count), 1), MAX_STRANDS);
    this.program.uniforms.uSpeed.value = this.options.speed;
    this.program.uniforms.uAmplitude.value = this.options.amplitude;
    this.program.uniforms.uWaviness.value = this.options.waviness;
    this.program.uniforms.uThickness.value = this.options.thickness;
    this.program.uniforms.uGlow.value = this.options.glow;
    this.program.uniforms.uTaper.value = this.options.taper;
    this.program.uniforms.uSpread.value = this.options.spread;
    this.program.uniforms.uHueShift.value = this.options.hueShift;
    this.program.uniforms.uIntensity.value = this.options.intensity;
    this.program.uniforms.uOpacity.value = this.options.opacity;
    this.program.uniforms.uScale.value = this.options.scale;
    this.program.uniforms.uSaturation.value = this.options.saturation;

    if (this.options.glass) {
      this.renderer.render({ scene: this.mesh, target: this.renderTarget });
      this.glassProgram.uniforms.uScene.value = this.renderTarget.texture;
      this.glassProgram.uniforms.uRefraction.value = this.options.refraction;
      this.glassProgram.uniforms.uDispersion.value = this.options.dispersion;
      this.glassProgram.uniforms.uRadius.value = 0.46 * this.options.glassSize;
      this.renderer.render({ scene: this.glassMesh });
    } else {
      this.renderer.render({ scene: this.mesh });
    }
  }
}

customElements.define('strands-bg', StrandsElement);
