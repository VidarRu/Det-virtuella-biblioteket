// Det som finns runt huset: en stenlagd sockel, och kvarteret omkring
// med gator, torg, gras, grannhus och trad.
//
// Kvarteret beskrivs i src/data/omgivning.json, sa att det stammer med
// verkligheten for varje bibliotek. Har finns bara hur det ritas.
//
// Huset star som en modell pa en platta. Narmast huset syns kvarteret
// tydligt. Langre bort tonar allt sakta bort i en gravit dimma, sa att
// blicken stannar vid biblioteket. Inget av det gar att ga pa och inget
// ror sig.
//
// Traden och grannhusen ar lagre an kameran och star en bit fran huset,
// sa att de aldrig skymmer figuren.

import * as THREE from "three";
import { RoundedBoxGeometry } from "../vendor/addons/RoundedBoxGeometry.js";
import { slump } from "./former.js";

/** Varifran solen lyser, raknat fran husets mitt. */
export const SOL = new THREE.Vector3(0.62, 0.72, 0.38).normalize();

const RADIE = 110;           // markens radie i meter
const SOCKEL_LUFT = 1.3;     // sa langt sticker sockeln ut utanfor golvet
const SOCKEL_HOJD = 0.16;
const TRAD_LUFT = 3.6;       // narmaste trad fran sockelns kant
const BILDPUNKTER = 2048;

/** Allt golv, och det man ser av huset fran en ovre vaning. */
const husetsRutor = layout =>
  [...layout.floors, ...(layout.utsikt?.tak || []), ...(layout.utsikt?.stengolv || [])];

// ------------------------------------------------------- bortre dimman

// Delas av alla material utomhus. Satts av byggOmgivning.
const BORTOM = {
  bortomFarg: { value: new THREE.Color("#ebe9e4") },
  bortomRuta: { value: new THREE.Vector4(0, 0, 1, 1) },   // husets x1, z1, x2, z2
  bortomAvst: { value: new THREE.Vector2(14, 62) }        // borjar, slutar
};

/**
 * Lagger till att ytan tonar over i den gravita dimman ju langre fran
 * huset den ligger. Avstandet raknas fran husets vaggar, inte fran
 * kameran, sa att huset sjalvt alltid syns tydligt.
 */
function tonaBort(material) {
  material.onBeforeCompile = s => {
    Object.assign(s.uniforms, BORTOM);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBortom;")
      .replace("#include <project_vertex>",
        "#include <project_vertex>\nvBortom = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vBortom;
        uniform vec3 bortomFarg;
        uniform vec4 bortomRuta;
        uniform vec2 bortomAvst;`)
      .replace("#include <fog_fragment>", `#include <fog_fragment>
        {
          vec2 utanfor = max(max(bortomRuta.xy - vBortom.xz, vBortom.xz - bortomRuta.zw), 0.0);
          float bort = smoothstep(bortomAvst.x, bortomAvst.y, length(utanfor));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(bortomFarg, 1.0)).rgb, bort);
        }`);
  };
  material.customProgramCacheKey = () => "tonaBort";
  return material;
}

const utomhus = new Map();
/** Ett matt material som tonar bort langt fran huset. Delas per farg. */
function uteMat(farg) {
  if (!utomhus.has(farg)) {
    utomhus.set(farg, tonaBort(new THREE.MeshStandardMaterial({ color: farg, roughness: 0.95 })));
  }
  return utomhus.get(farg);
}

// --------------------------------------------------------------- marken

/** Marken uppifran: gator, torg, gras och parkeringar, med mjuka skuggor. */
function markDuk(tema, mitt, kvarter, trad) {
  const B = BILDPUNKTER, P = B / (RADIE * 2);
  const duk = document.createElement("canvas");
  duk.width = duk.height = B;
  const c = duk.getContext("2d");
  const slp = slump("marken");
  const px = x => (x - mitt.x) * P + B / 2;
  const pz = z => (z - mitt.z) * P + B / 2;
  const ruta = (r, luft = 0, radie = 0.8) => {
    c.beginPath();
    c.roundRect(px(r.x - luft), pz(r.z - luft),
                (r.bredd + 2 * luft) * P, (r.djup + 2 * luft) * P, radie * P);
  };

  // Grunden ar ljus stenlagd mark, med nagra mjuka flackar.
  c.fillStyle = tema.stadsmark;
  c.fillRect(0, 0, B, B);
  c.filter = "blur(14px)";
  for (let i = 0; i < 300; i++) {
    c.globalAlpha = 0.12 + slp() * 0.14;
    c.fillStyle = slp() < 0.5 ? tema.stadsmarkMork : "#ffffff";
    c.beginPath();
    c.ellipse(slp() * B, slp() * B, 20 + slp() * 60, 14 + slp() * 40, slp() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = "none";
  c.globalAlpha = 1;

  const ytor = kvarter.ytor || [];
  const avTyp = typ => ytor.filter(y => y.typ === typ);

  // Gras med mjuka flackar.
  for (const y of avTyp("gras")) {
    c.save();
    ruta(y, 0, 3);
    c.fillStyle = tema.gras;
    c.fill();
    c.clip();
    c.filter = "blur(10px)";
    for (let i = 0; i < (y.bredd * y.djup) / 12; i++) {
      c.globalAlpha = 0.18 + slp() * 0.2;
      c.fillStyle = slp() < 0.55 ? tema.grasMonster : tema.grasLjus;
      c.beginPath();
      c.ellipse(px(y.x + slp() * y.bredd), pz(y.z + slp() * y.djup),
                (2 + slp() * 5) * P, (1.5 + slp() * 3) * P, slp() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // Parkeringar: asfalt med svaga, ljusa rutor.
  for (const y of avTyp("parkering")) {
    c.save();
    ruta(y, 0, 1.2);
    c.fillStyle = tema.parkering;
    c.fill();
    c.clip();
    c.strokeStyle = tema.gatlinje;
    c.globalAlpha = 0.55;
    c.lineWidth = 0.12 * P;
    const langsX = y.bredd >= y.djup;
    const langd = langsX ? y.bredd : y.djup, tvars = langsX ? y.djup : y.bredd;
    for (let rad = 0; rad + 5 <= tvars; rad += 13) {
      for (let s = 1; s < langd; s += 2.5) {
        const [x1, z1, x2, z2] = langsX
          ? [y.x + s, y.z + rad + 1, y.x + s, y.z + rad + 5.5]
          : [y.x + rad + 1, y.z + s, y.x + rad + 5.5, y.z + s];
        c.beginPath();
        c.moveTo(px(x1), pz(z1));
        c.lineTo(px(x2), pz(z2));
        c.stroke();
      }
    }
    c.restore();
  }

  // Gator: asfalt med en kantsten pa varje sida.
  for (const y of avTyp("gata")) {
    ruta(y, 0.25, 0.4);
    c.fillStyle = tema.kantsten;
    c.fill();
    ruta(y, 0, 0.3);
    c.fillStyle = tema.gata;
    c.fill();
  }

  // Gangar och torg: stenplattor i forskjutna rader.
  const plattor = (y, farg, fog) => {
    c.save();
    ruta(y, 0, 0.6);
    c.fillStyle = fog;
    c.fill();
    c.clip();
    const PL = 0.9 * P, PH = 0.6 * P;
    for (let rad = 0, yy = pz(y.z); yy < pz(y.z + y.djup); rad++, yy += PH) {
      for (let xx = px(y.x) - (rad % 2) * PL / 2; xx < px(y.x + y.bredd); xx += PL) {
        const bas = new THREE.Color(farg).multiplyScalar(0.95 + slp() * 0.08);
        c.fillStyle = "#" + bas.getHexString();
        c.fillRect(xx + 0.6, yy + 0.6, PL - 1.2, PH - 1.2);
      }
    }
    c.restore();
  };
  for (const y of avTyp("gang")) plattor(y, tema.torgsten, tema.torgFog);
  for (const y of avTyp("torg")) {
    plattor(y, tema.torgsten, tema.torgFog);
    // Torgets stora rutor, som pa satellitbilden.
    const nx = y.rutor?.langsX || 0, nz = y.rutor?.langsZ || 0;
    if (!nx || !nz) continue;
    const rb = y.bredd / nx, rd = y.djup / nz;
    c.strokeStyle = tema.torgFog;
    c.lineWidth = 0.35 * P;
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        c.beginPath();
        c.roundRect(px(y.x + i * rb + 0.5), pz(y.z + k * rd + 0.5), (rb - 1) * P, (rd - 1) * P, 0.4 * P);
        c.stroke();
      }
    }
  }

  // Skuggorna faller bort fran solen: forst husen, sedan traden.
  const fall = { x: -SOL.x / SOL.y, z: -SOL.z / SOL.y };
  c.filter = "blur(6px)";
  c.fillStyle = "rgba(74, 66, 52, 0.30)";
  for (const h of kvarter.hus || []) {
    const dx = fall.x * h.hojd, dz = fall.z * h.hojd;
    c.beginPath();
    c.moveTo(px(h.x), pz(h.z));
    c.lineTo(px(h.x + h.bredd), pz(h.z));
    c.lineTo(px(h.x + h.bredd + dx), pz(h.z + dz));
    c.lineTo(px(h.x + h.bredd + dx), pz(h.z + h.djup + dz));
    c.lineTo(px(h.x + dx), pz(h.z + h.djup + dz));
    c.lineTo(px(h.x), pz(h.z + h.djup));
    c.closePath();
    c.fill();
  }
  const vinkel = Math.atan2(fall.z, fall.x);
  c.filter = "blur(4px)";
  c.fillStyle = "rgba(74, 78, 52, 0.34)";
  for (const t of trad) {
    const h = t.stam + t.storlek * 0.9;
    c.beginPath();
    c.ellipse(px(t.x + fall.x * h * 0.75), pz(t.z + fall.z * h * 0.75),
              t.storlek * 1.75 * P, t.storlek * 1.15 * P, vinkel, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = "none";
  return duk;
}

/** Lagger till samma hal som golvet har, dar trappor gar ner. */
function medHal(form, hal, mitt) {
  for (const h of hal) {
    // Formen ligger i x/y och vrids sedan ner, sa z blir -y.
    const x0 = h.x - mitt.x, y0 = -(h.z - mitt.z);
    const p = new THREE.Path();
    p.moveTo(x0, y0);
    p.lineTo(x0, y0 - h.djup);
    p.lineTo(x0 + h.bredd, y0 - h.djup);
    p.lineTo(x0 + h.bredd, y0);
    p.closePath();
    form.holes.push(p);
  }
  return form;
}

function rundRektangel(x1, y1, x2, y2, r) {
  const f = new THREE.Shape();
  f.moveTo(x1 + r, y1);
  f.lineTo(x2 - r, y1);
  f.absarc(x2 - r, y1 + r, r, -Math.PI / 2, 0, false);
  f.lineTo(x2, y2 - r);
  f.absarc(x2 - r, y2 - r, r, 0, Math.PI / 2, false);
  f.lineTo(x1 + r, y2);
  f.absarc(x1 + r, y2 - r, r, Math.PI / 2, Math.PI, false);
  f.lineTo(x1, y1 + r);
  f.absarc(x1 + r, y1 + r, r, Math.PI, Math.PI * 1.5, false);
  return f;
}

// ----------------------------------------------------------- grannhusen

/** En rundad lada, med nordvastra hornet i (x, z) och botten pa y0. */
function lada(x, z, bredd, djup, hojd, y0, farg, radie) {
  const r = Math.min(radie, bredd / 2 - 0.01, djup / 2 - 0.01, hojd / 2 - 0.01);
  const geo = new RoundedBoxGeometry(bredd, hojd, djup, 2, Math.max(r, 0.001));
  const nat = new THREE.Mesh(geo, uteMat(farg));
  nat.position.set(x + bredd / 2, y0 + hojd / 2, z + djup / 2);
  return nat;
}

/**
 * Ett grannhus: en lag lada med platt tak, som en byggkloss. Taket ligger
 * en aning innanfor kanten. Husen kastar ingen riktig skugga, den ar
 * ritad pa marken i stallet, sa att skuggkartan bara behover tacka
 * biblioteket.
 */
function hus(h, tema, y0) {
  const g = new THREE.Group();
  const tak = typ => tema.tak?.[typ] || tema.tak?.ljust || "#d6cfc3";
  g.add(lada(h.x, h.z, h.bredd, h.djup, h.hojd, y0, tema.husvagg, 0.3));
  // Ett band av fonster runt huset, sa att det ser ut som ett hus och
  // inte som en sockel.
  const glas = tema.husfonster || "#b9c2c1";
  const ut = 0.04, upp = y0 + Math.min(1.0, h.hojd * 0.3), hog = Math.min(1.2, h.hojd * 0.35);
  g.add(lada(h.x + 0.8, h.z - ut, h.bredd - 1.6, 0.1, hog, upp, glas, 0.03));
  g.add(lada(h.x + 0.8, h.z + h.djup - 0.1 + ut, h.bredd - 1.6, 0.1, hog, upp, glas, 0.03));
  g.add(lada(h.x - ut, h.z + 0.8, 0.1, h.djup - 1.6, hog, upp, glas, 0.03));
  g.add(lada(h.x + h.bredd - 0.1 + ut, h.z + 0.8, 0.1, h.djup - 1.6, hog, upp, glas, 0.03));
  const kant = 0.4;
  g.add(lada(h.x + kant, h.z + kant, h.bredd - 2 * kant, h.djup - 2 * kant, 0.05,
             y0 + h.hojd, tak(h.tak), 0.02));
  for (const t of h.takytor || []) {
    g.add(lada(t.x, t.z, t.bredd, t.djup, 0.08, y0 + h.hojd, tak(t.tak), 0.03));
  }
  return g;
}

// ------------------------------------------------------------------ trad

let kronGeo = null, stamGeo = null;

/** Ett runt leksakstrad: en kort stam och en krona av tre klot. */
function trad(t, tema, y0) {
  if (!kronGeo) {
    kronGeo = new THREE.SphereGeometry(1, 14, 9);
    stamGeo = new THREE.CylinderGeometry(0.12, 0.17, 1, 8);
  }
  const g = new THREE.Group();
  const lov = tema.lov || ["#a7b08a", "#98a47e", "#b5ba97"];
  const blad = uteMat(lov[t.farg % lov.length]);
  const s = t.storlek;
  const klot = (dx, dy, dz, r) => {
    const k = new THREE.Mesh(kronGeo, blad);
    k.scale.set(r, r * 0.86, r);
    k.position.set(dx, t.stam + dy, dz);
    k.receiveShadow = true;
    g.add(k);
  };
  if (t.buske) {
    klot(0, s * 0.55, 0, s);
    klot(s * 0.7, s * 0.4, s * 0.2, s * 0.7);
  } else {
    const stam = new THREE.Mesh(stamGeo, uteMat(tema.stam || "#8a6f57"));
    stam.scale.y = t.stam + s * 0.5;
    stam.position.y = (t.stam + s * 0.5) / 2;
    g.add(stam);
    klot(0, s * 0.8, 0, s);
    klot(s * 0.62, s * 0.5, s * 0.25, s * 0.68);
    klot(-s * 0.5, s * 0.62, -s * 0.38, s * 0.72);
  }
  g.position.set(t.x, y0, t.z);
  g.rotation.y = t.vrid;
  return g;
}

/**
 * Traden ur kartan, med fast slumpad farg och vridning. Ett trad som
 * star for nara huset hoppas over, sa att det aldrig skymmer figuren.
 */
function planteraTrad(lista, rutor) {
  const slp = slump("parken");
  const fritt = (x, z, luft) => rutor.every(r =>
    x < r.x - luft || x > r.x + r.bredd + luft || z < r.z - luft || z > r.z + r.djup + luft);
  return lista.map(t => ({
    x: t.x, z: t.z, buske: !!t.buske, storlek: t.storlek ?? 1.2,
    stam: t.buske ? 0 : (t.stam ?? 0.9 + slp() * 0.4),
    farg: Math.floor(slp() * 3), vrid: slp() * Math.PI * 2
  })).filter(t => fritt(t.x, t.z, SOCKEL_LUFT + (t.buske ? 2.6 : TRAD_LUFT)));
}

// ----------------------------------------------------------------- allt

/**
 * Bygger sockeln och kvarteret runt huset. niva ar hojden pa sockelns
 * ovansida, hal ar oppningarna dar trappor gar ner, och kvarter ar
 * innehallet i omgivning.json.
 */
export function byggOmgivning(layout, tema, hal, niva, kvarter = {}) {
  const grupp = new THREE.Group();
  grupp.name = "omgivning";
  const { bredd, djup } = layout.bounds;
  const mitt = { x: bredd / 2, z: djup / 2 };
  const rutor = husetsRutor(layout);
  const allaTrad = planteraTrad(kvarter.trad || [], rutor);

  BORTOM.bortomFarg.value.set(tema.bakgrund);
  BORTOM.bortomRuta.value.set(0, 0, bredd, djup);
  BORTOM.bortomAvst.value.set(kvarter.bortom?.borjar ?? 14, kvarter.bortom?.slutar ?? 62);

  const mark = niva - SOCKEL_HOJD;
  const tex = new THREE.CanvasTexture(markDuk(tema, mitt, kvarter, allaTrad));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // En ShapeGeometry har meter som uv, sa texturen skalas till skivan.
  tex.repeat.set(1 / (RADIE * 2), 1 / (RADIE * 2));
  tex.offset.set(0.5, 0.5);
  const skiva = new THREE.Shape();
  skiva.absarc(0, 0, RADIE, 0, Math.PI * 2, false);
  const marken = new THREE.Mesh(new THREE.ShapeGeometry(medHal(skiva, hal, mitt), 64),
    tonaBort(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })));
  marken.rotation.x = -Math.PI / 2;
  marken.position.set(mitt.x, mark, mitt.z);
  marken.receiveShadow = true;
  marken.name = "marken";
  grupp.add(marken);

  // Sockeln: en stenlagd platta med rundade horn som foljer husets form.
  const fas = 0.05;
  for (const r of rutor) {
    const form = rundRektangel(r.x - SOCKEL_LUFT - mitt.x, -(r.z + r.djup + SOCKEL_LUFT - mitt.z),
                               r.x + r.bredd + SOCKEL_LUFT - mitt.x, -(r.z - SOCKEL_LUFT - mitt.z), 1.2);
    const sockel = new THREE.Mesh(
      new THREE.ExtrudeGeometry(medHal(form, hal, mitt), {
        depth: SOCKEL_HOJD - fas, bevelEnabled: true, bevelSize: fas, bevelThickness: fas,
        bevelSegments: 2, curveSegments: 8 }),
      new THREE.MeshStandardMaterial({ color: tema.sockel || tema.stadsmark, roughness: 0.95 }));
    sockel.rotation.x = -Math.PI / 2;
    sockel.position.set(mitt.x, mark, mitt.z);
    sockel.receiveShadow = true;
    grupp.add(sockel);
  }

  for (const h of kvarter.hus || []) grupp.add(hus(h, tema, mark));
  for (const t of allaTrad) grupp.add(trad(t, tema, mark));
  return grupp;
}
