// Det som finns runt huset: en stenlagd sockel, gras och runda trad.
//
// Huset star som en modell pa en platta, mitt i en liten park. Inget av
// det har gar att ga pa och inget ror sig. Det finns for att huset inte
// ska svava i tomma intet, och for att det ska synas nagot genom
// fonstren.
//
// Traden star alltid en bit fran huset och ar lagre an kameran, sa att
// de aldrig skymmer figuren.

import * as THREE from "three";
import { mat, slump } from "./former.js";

/** Varifran solen lyser, raknat fran husets mitt. */
export const SOL = new THREE.Vector3(0.62, 0.72, 0.38).normalize();

const RADIE = 150;           // markens radie i meter
const SOCKEL_LUFT = 1.3;     // sa langt sticker sockeln ut utanfor golvet
const SOCKEL_HOJD = 0.16;
const TRAD_LUFT = 3.6;       // narmaste trad fran sockelns kant
const BILDPUNKTER = 2048;

/** Allt golv, och det man ser av huset fran en ovre vaning. */
const husetsRutor = layout =>
  [...layout.floors, ...(layout.utsikt?.tak || []), ...(layout.utsikt?.stengolv || [])];

/** Var traden och buskarna star. Samma varje gang. */
function planteraTrad(rutor, mitt) {
  const slp = slump("parken");
  const trad = [];
  const fritt = (x, z, luft) => rutor.every(r =>
    x < r.x - luft || x > r.x + r.bredd + luft || z < r.z - luft || z > r.z + r.djup + luft);
  for (let i = 0; i < 900 && trad.length < 110; i++) {
    const v = slp() * Math.PI * 2;
    // Tatare nara huset, glesare langre bort.
    const l = 14 + Math.pow(slp(), 1.6) * 95;
    const x = mitt.x + Math.cos(v) * l, z = mitt.z + Math.sin(v) * l;
    const buske = slp() < 0.22;
    const luft = SOCKEL_LUFT + (buske ? 2.6 : TRAD_LUFT);
    if (!fritt(x, z, luft)) continue;
    const storlek = buske ? 0.55 + slp() * 0.35 : 1.05 + slp() * 0.5;
    if (trad.some(t => Math.hypot(t.x - x, t.z - z) < (t.storlek + storlek) * 1.7)) continue;
    trad.push({ x, z, buske, storlek, farg: Math.floor(slp() * 3), vrid: slp() * Math.PI * 2,
                stam: buske ? 0 : 0.9 + slp() * 0.5 });
  }
  return trad;
}

/** Markens ovansida: gras med mjuka flackar och tradens skuggor. */
function markDuk(tema, mitt, trad) {
  const B = BILDPUNKTER, P = B / (RADIE * 2);
  const duk = document.createElement("canvas");
  duk.width = duk.height = B;
  const c = duk.getContext("2d");
  const slp = slump("gras");
  const px = x => (x - mitt.x) * P + B / 2;
  const pz = z => (z - mitt.z) * P + B / 2;

  c.fillStyle = tema.gras || "#c3c7a6";
  c.fillRect(0, 0, B, B);
  c.filter = "blur(18px)";
  for (let i = 0; i < 520; i++) {
    c.globalAlpha = 0.16 + slp() * 0.2;
    c.fillStyle = slp() < 0.55 ? (tema.grasMonster || "#b4ba96") : (tema.grasLjus || "#d2d3b4");
    c.beginPath();
    c.ellipse(slp() * B, slp() * B, 30 + slp() * 90, 20 + slp() * 60, slp() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }

  // Skuggorna faller bort fran solen.
  const fall = { x: -SOL.x / SOL.y, z: -SOL.z / SOL.y };
  const vinkel = Math.atan2(fall.z, fall.x);
  c.filter = "blur(5px)";
  c.globalAlpha = 1;
  c.fillStyle = "rgba(74, 78, 52, 0.36)";
  for (const t of trad) {
    const h = t.stam + t.storlek * 0.9;
    c.beginPath();
    c.ellipse(px(t.x + fall.x * h * 0.75), pz(t.z + fall.z * h * 0.75),
              t.storlek * 1.75 * P, t.storlek * 1.15 * P, vinkel, 0, Math.PI * 2);
    c.fill();
  }
  c.filter = "none";

  // Langt bort tonar graset over i horisontens farg.
  const g = c.createRadialGradient(B / 2, B / 2, B * 0.2, B / 2, B / 2, B * 0.5);
  const hex = new THREE.Color(tema.bakgrund).getHexString();
  const [r, gr, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  g.addColorStop(0, `rgba(${r}, ${gr}, ${b}, 0)`);
  g.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 1)`);
  c.fillStyle = g;
  c.fillRect(0, 0, B, B);
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

let kronGeo = null, stamGeo = null;

/** Ett runt leksakstrad: en kort stam och en krona av tre klot. */
function trad(t, tema, y0) {
  if (!kronGeo) {
    kronGeo = new THREE.SphereGeometry(1, 14, 9);
    stamGeo = new THREE.CylinderGeometry(0.12, 0.17, 1, 8);
  }
  const g = new THREE.Group();
  const lov = tema.lov || ["#a7b08a", "#98a47e", "#b5ba97"];
  const blad = mat(lov[t.farg % lov.length], { roughness: 0.95 });
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
    const stam = new THREE.Mesh(stamGeo, mat(tema.stam || "#8a6f57", { roughness: 0.95 }));
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
 * Bygger sockeln, graset och traden. niva ar hojden pa sockelns
 * ovansida, och hal ar oppningarna dar trappor gar ner.
 */
export function byggOmgivning(layout, tema, hal, niva) {
  const grupp = new THREE.Group();
  grupp.name = "omgivning";
  const { bredd, djup } = layout.bounds;
  const mitt = { x: bredd / 2, z: djup / 2 };
  const rutor = husetsRutor(layout);
  const allaTrad = planteraTrad(rutor, mitt);

  const tex = new THREE.CanvasTexture(markDuk(tema, mitt, allaTrad));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // En ShapeGeometry har meter som uv, sa texturen skalas till skivan.
  tex.repeat.set(1 / (RADIE * 2), 1 / (RADIE * 2));
  tex.offset.set(0.5, 0.5);
  const skiva = new THREE.Shape();
  skiva.absarc(0, 0, RADIE, 0, Math.PI * 2, false);
  const gras = new THREE.Mesh(new THREE.ShapeGeometry(medHal(skiva, hal, mitt), 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  gras.rotation.x = -Math.PI / 2;
  gras.position.set(mitt.x, niva - SOCKEL_HOJD, mitt.z);
  gras.receiveShadow = true;
  gras.name = "gras";
  grupp.add(gras);

  // Sockeln: en stenlagd platta med rundade horn som foljer husets form.
  const fas = 0.05;
  for (const r of rutor) {
    const form = rundRektangel(r.x - SOCKEL_LUFT - mitt.x, -(r.z + r.djup + SOCKEL_LUFT - mitt.z),
                               r.x + r.bredd + SOCKEL_LUFT - mitt.x, -(r.z - SOCKEL_LUFT - mitt.z), 1.2);
    const sockel = new THREE.Mesh(
      new THREE.ExtrudeGeometry(medHal(form, hal, mitt), {
        depth: SOCKEL_HOJD - fas, bevelEnabled: true, bevelSize: fas, bevelThickness: fas,
        bevelSegments: 2, curveSegments: 8 }),
      mat(tema.sockel || tema.mark, { roughness: 0.95 }));
    sockel.rotation.x = -Math.PI / 2;
    sockel.position.set(mitt.x, niva - SOCKEL_HOJD, mitt.z);
    sockel.receiveShadow = true;
    grupp.add(sockel);
  }

  for (const t of allaTrad) grupp.add(trad(t, tema, niva - SOCKEL_HOJD));
  return grupp;
}
