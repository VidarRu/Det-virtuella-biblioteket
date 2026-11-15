// Efterbehandling: det som gor att varlden ser ut som en liten modell
// av lera och papp i stallet for platta fargytor.
//
// Bilden ritas forst till en egen yta och far sedan tva saker pa vagen
// till skarmen:
//
//   1. Mjuka skuggor i vinklar och springor (dar golv moter vagg, mellan
//      bocker, under mobler). De raknas ut ur bildens djup.
//   2. Farger: mjuk tonkurva, och bilden blir en aning morkare ut mot
//      hornen sa att blicken dras mot mitten.
//
// Inget sken eller glitter laggs pa. Det gav prickiga flackar pa ljusa
// golv, som konfetti.
//
// Ingenting har ror sig eller blinkar. Bilden ar stilla nar varlden ar
// stilla.
//
// Klarar inte grafikkortet det har ritas bilden som forut, rakt till
// skarmen. Gar det for trogt stangs stegen av ett i taget (se sank()).

import * as THREE from "three";

const HORN = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Skuggor i vinklar. For varje bildpunkt jamfors djupet med nagra
// punkter runt omkring: ligger de framfor ytan skymmer de ljuset.
const SKRYMSLEN = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDjup;
  uniform mat4 projektion;
  uniform mat4 projektionInv;
  uniform vec2 punkt;          // en bildpunkt i den har ytan, i uv
  uniform float radie;         // meter
  uniform float langt;         // kamerans bortre grans

  vec3 plats(vec2 uv) {
    float d = texture2D(tDjup, uv).x;
    vec4 p = projektionInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  void main() {
    float d = texture2D(tDjup, vUv).x;
    if (d >= 0.99999) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); return; }
    vec3 p = plats(vUv);

    // Ytans riktning ur grannarna. Den narmaste grannen at varje hall
    // valjs, annars blir det fel vid kanter.
    vec3 hx = plats(vUv + vec2(punkt.x, 0.0)) - p;
    vec3 vx = p - plats(vUv - vec2(punkt.x, 0.0));
    vec3 hy = plats(vUv + vec2(0.0, punkt.y)) - p;
    vec3 vy = p - plats(vUv - vec2(0.0, punkt.y));
    vec3 dx = abs(hx.z) < abs(vx.z) ? hx : vx;
    vec3 dy = abs(hy.z) < abs(vy.z) ? hy : vy;
    vec3 n = normalize(cross(dx, dy));

    // Sexton olika vridningar i ett rutmonster om 4 x 4 bildpunkter.
    // Utjamningen efterat tar bort monstret helt.
    vec2 ruta = mod(floor(gl_FragCoord.xy), 4.0);
    float vrid = (ruta.x + ruta.y * 4.0) * 0.3927 + ruta.x * 1.7;

    vec2 skala = radie * 0.5 * vec2(projektion[0][0], projektion[1][1]) / max(-p.z, 0.1);
    float skymt = 0.0;
    for (int i = 0; i < PROV; i++) {
      float a = vrid + float(i) * 2.39996;
      float l = sqrt((float(i) + 0.5) / float(PROV));
      vec2 uv = vUv + vec2(cos(a), sin(a)) * l * skala;
      vec3 v = plats(uv) - p;
      float vv = dot(v, v);
      float nara = 1.0 - smoothstep(0.35, 1.0, vv / (radie * radie));
      skymt += max(dot(n, v) / sqrt(vv + 0.0001) - 0.14, 0.0) * nara;
    }
    float ljus = clamp(1.0 - 1.75 * skymt / float(PROV), 0.0, 1.0);
    // Langt bort blir radien bara nagon bildpunkt stor, och da blir
    // skuggorna fel. Dar tonar de bort, marken langt bort ar anda tom.
    float bildpunkter = skala.y / punkt.y;
    ljus = mix(1.0, ljus, smoothstep(1.5, 4.0, bildpunkter));

    // Djupet foljer med i tva kanaler, till utjamningen.
    float z = clamp(-p.z / langt, 0.0, 1.0) * 255.0;
    gl_FragColor = vec4(ljus, floor(z) / 255.0, fract(z), 1.0);
  }
`;

const SLUTBILD = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tFarg;
  uniform sampler2D tDjup;
  uniform sampler2D tSkrymslen;
  uniform vec2 skrymslePunkt;
  uniform float nara;
  uniform float langt;
  uniform float exponering;
  uniform float skrymsleStyrka;
  uniform vec3 skuggfarg;

  // Samma mjuka tonkurva som three.js "Neutral".
  vec3 tonkurva(vec3 c) {
    const float start = 0.76;
    const float blek = 0.15;
    float x = min(c.r, min(c.g, c.b));
    float lyft = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c -= lyft;
    float topp = max(c.r, max(c.g, c.b));
    if (topp < start) return c;
    float d = 1.0 - start;
    float nyTopp = 1.0 - d * d / (topp + d - start);
    c *= nyTopp / topp;
    float g = 1.0 - 1.0 / (blek * (topp - nyTopp) + 1.0);
    return mix(c, vec3(nyTopp), g);
  }

  vec3 tillSkarm(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }

  void main() {
    vec3 c = texture2D(tFarg, vUv).rgb;

    #ifdef SKRYMSLEN
      float d = texture2D(tDjup, vUv).x;
      float z = nara * langt / (langt - d * (langt - nara));
      float summa = 0.0, vikt = 0.0;
      for (int x = 0; x < 4; x++) for (int y = 0; y < 4; y++) {
        vec4 s = texture2D(tSkrymslen, vUv + (vec2(float(x), float(y)) - 1.5) * skrymslePunkt);
        float sz = (s.g + s.b / 255.0) * langt;
        float w = max(0.0, 1.0 - abs(sz - z) / (0.04 * z + 0.25)) + 0.0001;
        summa += s.r * w;
        vikt += w;
      }
      float ljus = mix(1.0, summa / vikt, skrymsleStyrka);
      // Skuggan ar varmt brun och inte gra, som i en modell av lera.
      c *= mix(skuggfarg, vec3(1.0), ljus);
    #endif

    c = tonkurva(c * exponering);

    // Lite morkare ut mot hornen.
    vec2 m = vUv - 0.5;
    c *= 1.0 - 0.16 * smoothstep(0.25, 0.85, dot(m, m) * 2.0);

    c = tillSkarm(clamp(c, 0.0, 1.0));
    // Ett knappt synligt brus, sa att himlens toning inte blir randig.
    float brus = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    gl_FragColor = vec4(c + (brus - 0.5) / 255.0, 1.0);
  }
`;

/**
 * Skapar efterbehandlingen. Ger null om grafikkortet inte klarar den.
 * niva 2 ar allt, 1 ar utan skuggor i vinklar, 0 ar rakt till skarmen.
 */
export function skapaEfterbehandling(renderare, { enkel = false, niva = 2 } = {}) {
  const gl = renderare.getContext();
  if (!renderare.capabilities.isWebGL2 && !(gl instanceof WebGL2RenderingContext)) return null;
  if (!gl.getExtension("EXT_color_buffer_half_float") && !gl.getExtension("EXT_color_buffer_float")) return null;

  const yta = (typ, filter) => new THREE.WebGLRenderTarget(4, 4, {
    type: typ, minFilter: filter, magFilter: filter, depthBuffer: false });

  const bild = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType, samples: 4,
    depthTexture: new THREE.DepthTexture(4, 4, THREE.UnsignedIntType) });
  bild.depthTexture.minFilter = bild.depthTexture.magFilter = THREE.NearestFilter;
  const skrymslen = yta(THREE.UnsignedByteType, THREE.NearestFilter);

  const material = (kod, uniforms, defines = {}) => new THREE.ShaderMaterial({
    vertexShader: HORN, fragmentShader: kod, uniforms, defines,
    depthTest: false, depthWrite: false, toneMapped: false });

  const mSkrymslen = material(SKRYMSLEN, {
    tDjup: { value: bild.depthTexture },
    projektion: { value: new THREE.Matrix4() },
    projektionInv: { value: new THREE.Matrix4() },
    punkt: { value: new THREE.Vector2() },
    radie: { value: 0.6 },
    langt: { value: 400 }
  }, { PROV: enkel ? 7 : 11 });
  const mSlut = material(SLUTBILD, {
    tFarg: { value: bild.texture },
    tDjup: { value: bild.depthTexture },
    tSkrymslen: { value: skrymslen.texture },
    skrymslePunkt: { value: new THREE.Vector2() },
    nara: { value: 0.1 }, langt: { value: 400 },
    exponering: { value: renderare.toneMappingExposure },
    skrymsleStyrka: { value: 1.0 },
    skuggfarg: { value: new THREE.Color("#6f5648") }
  });

  const fyrkant = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mSlut);
  fyrkant.frustumCulled = false;
  const plattKamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function kor(m, mal) {
    fyrkant.material = m;
    renderare.setRenderTarget(mal);
    renderare.render(fyrkant, plattKamera);
  }

  let bredd = 0, hojd = 0;
  const till = { niva };

  function satNiva(n) {
    till.niva = n;
    mSlut.defines = {};
    if (n >= 2) mSlut.defines.SKRYMSLEN = "";
    mSlut.needsUpdate = true;
  }
  satNiva(niva);

  return {
    get niva() { return till.niva; },
    satNiva,
    /** Ett steg enklare. Ger false nar det inte gar att sanka mer. */
    sank() {
      if (till.niva <= 0) return false;
      satNiva(till.niva - 1);
      return true;
    },

    /** Storleken i verkliga bildpunkter. */
    storlek(b, h) {
      bredd = b; hojd = h;
      bild.setSize(b, h);
      const hb = Math.max(1, Math.ceil(b / 2)), hh = Math.max(1, Math.ceil(h / 2));
      skrymslen.setSize(hb, hh);
      mSkrymslen.uniforms.punkt.value.set(1 / hb, 1 / hh);
      mSlut.uniforms.skrymslePunkt.value.set(1 / hb, 1 / hh);
    },

    rita(scen, kamera) {
      if (till.niva <= 0 || !bredd) {
        renderare.setRenderTarget(null);
        renderare.render(scen, kamera);
        return;
      }
      renderare.setRenderTarget(bild);
      renderare.render(scen, kamera);

      if (till.niva >= 2) {
        mSkrymslen.uniforms.projektion.value.copy(kamera.projectionMatrix);
        mSkrymslen.uniforms.projektionInv.value.copy(kamera.projectionMatrixInverse);
        mSkrymslen.uniforms.langt.value = kamera.far;
        kor(mSkrymslen, skrymslen);
      }

      mSlut.uniforms.nara.value = kamera.near;
      mSlut.uniforms.langt.value = kamera.far;
      mSlut.uniforms.exponering.value = renderare.toneMappingExposure;
      kor(mSlut, null);
    }
  };
}
