// Map definitions for Mecha Chameleon v2
// Fully furnished interiors built from a reusable furniture kit + procedural textures.

export type Vec3 = [number, number, number];

export type WallBox = {
  pos: Vec3;
  size: Vec3;
  color?: string;
  tex?: string;                 // procedural texture name (see textures.ts)
  texRepeat?: [number, number];
  glow?: boolean;               // emissive (screens, neon, lamps)
  noTex?: boolean;              // never receive the map's default wall texture
  noCollide?: boolean;          // visual only (rugs, posters, panels, ceiling)
};

export type PropCylinder = {
  kind: "cylinder";
  pos: Vec3;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  color: string;
  collides?: boolean;
  emissive?: boolean;
};

export type PropSphere = {
  kind: "sphere";
  pos: Vec3;
  radius: number;
  color: string;
  collides?: boolean;
  emissive?: boolean;
};

export type Prop = PropCylinder | PropSphere;

export type MapDef = {
  name: string;
  displayName: string;
  floorSize: [number, number];
  floorTex?: string;
  floorColor: string;
  wallColor: string;
  ambientColor: string;
  skyColor: string;
  groundColor: string;
  fogNear: number;
  fogFar: number;
  walls: WallBox[];
  props: Prop[];
  spawnPoints: Vec3[];
};

const PLAYER_EYE = 1.6;

// =============================================================================
// Furniture / interior kit
// =============================================================================

function outerWalls(walls: WallBox[], w: number, d: number, h: number, color: string) {
  const t = 0.8;
  walls.push(
    { pos: [0, h / 2, -d / 2], size: [w, h, t], color, noTex: true },
    { pos: [0, h / 2,  d / 2], size: [w, h, t], color, noTex: true },
    { pos: [-w / 2, h / 2, 0], size: [t, h, d], color, noTex: true },
    { pos: [ w / 2, h / 2, 0], size: [t, h, d], color, noTex: true },
  );
}

function ceiling(walls: WallBox[], w: number, d: number, h: number, color: string) {
  walls.push({ pos: [0, h, 0], size: [w, 0.3, d], color, noTex: true, noCollide: true });
}

/** Wallpaper panel hugging the inside of a wall. side: which outer wall. */
function wallPanel(
  walls: WallBox[], side: "N" | "S" | "E" | "W",
  half: number, center: number, length: number, h: number, tex: string,
) {
  const t = 0.12, off = 0.47, y = h / 2;
  const rep: [number, number] = [Math.max(1, Math.round(length / 4)), Math.max(1, Math.round(h / 4))];
  if (side === "N") walls.push({ pos: [center, y, -half + off], size: [length, h, t], tex, texRepeat: rep, noCollide: true });
  if (side === "S") walls.push({ pos: [center, y,  half - off], size: [length, h, t], tex, texRepeat: rep, noCollide: true });
  if (side === "W") walls.push({ pos: [-half + off, y, center], size: [t, h, length], tex, texRepeat: rep, noCollide: true });
  if (side === "E") walls.push({ pos: [ half - off, y, center], size: [t, h, length], tex, texRepeat: rep, noCollide: true });
}

/** Interior partition wall along an axis, with baseboard. */
function partition(walls: WallBox[], pos: Vec3, size: Vec3, tex?: string, color = "#e8e0d0") {
  const rep: [number, number] = [Math.max(1, Math.round(Math.max(size[0], size[2]) / 4)), Math.max(1, Math.round(size[1] / 4))];
  walls.push({ pos, size, color, tex, texRepeat: tex ? rep : undefined, noTex: !tex });
  walls.push({
    pos: [pos[0], 0.15, pos[2]],
    size: [size[0] + 0.06, 0.3, size[2] + 0.06],
    color: "#5a4632", noTex: true,
  });
}

/** Floor overlay (different flooring per room). */
function floorArea(walls: WallBox[], x: number, z: number, w: number, d: number, tex: string) {
  walls.push({
    pos: [x, 0.03, z], size: [w, 0.06, d],
    tex, texRepeat: [Math.max(1, Math.round(w / 3.2)), Math.max(1, Math.round(d / 3.2))],
    noCollide: true,
  });
}

function rug(walls: WallBox[], x: number, z: number, w: number, d: number, color: string) {
  walls.push({ pos: [x, 0.07, z], size: [w, 0.05, d], color, noTex: true, noCollide: true });
  walls.push({ pos: [x, 0.06, z], size: [w + 0.5, 0.05, d + 0.5], color: "#3a3230", noTex: true, noCollide: true });
}

/** Framed poster on a wall. */
function poster(
  walls: WallBox[], side: "N" | "S" | "E" | "W",
  half: number, along: number, y: number, w: number, h: number, art: number,
) {
  const t = 0.07, off = 0.6; // proud of the wall AND its wallpaper panel
  const tex = `poster${art % 8}`;
  if (side === "N") walls.push({ pos: [along, y, -half + off], size: [w, h, t], tex, noCollide: true });
  if (side === "S") walls.push({ pos: [along, y,  half - off], size: [w, h, t], tex, noCollide: true });
  if (side === "W") walls.push({ pos: [-half + off, y, along], size: [t, h, w], tex, noCollide: true });
  if (side === "E") walls.push({ pos: [ half - off, y, along], size: [t, h, w], tex, noCollide: true });
}

/** Poster placed on an interior partition face at world position. */
function posterAt(walls: WallBox[], x: number, y: number, z: number, w: number, h: number, art: number, facing: "x" | "z") {
  const t = 0.07;
  const tex = `poster${art % 8}`;
  if (facing === "z") walls.push({ pos: [x, y, z], size: [w, h, t], tex, noCollide: true });
  else walls.push({ pos: [x, y, z], size: [t, h, w], tex, noCollide: true });
}

/** Sunny window on an outer wall. */
function windowOn(walls: WallBox[], side: "N" | "S" | "E" | "W", half: number, along: number, w = 3.4, h = 2.6, y = 2.6) {
  const t = 0.1, off = 0.6; // proud of the wall AND its wallpaper panel
  if (side === "N") walls.push({ pos: [along, y, -half + off], size: [w, h, t], tex: "windowDay", glow: true, noCollide: true });
  if (side === "S") walls.push({ pos: [along, y,  half - off], size: [w, h, t], tex: "windowDay", glow: true, noCollide: true });
  if (side === "W") walls.push({ pos: [-half + off, y, along], size: [t, h, w], tex: "windowDay", glow: true, noCollide: true });
  if (side === "E") walls.push({ pos: [ half - off, y, along], size: [t, h, w], tex: "windowDay", glow: true, noCollide: true });
}

/** Sofa. dir: 0 faces +z, 1 faces -z, 2 faces +x, 3 faces -x */
function sofa(walls: WallBox[], x: number, z: number, dir: 0 | 1 | 2 | 3, color: string, len = 3.4) {
  const alongX = dir <= 1;
  const seat: Vec3 = alongX ? [len, 0.55, 1.5] : [1.5, 0.55, len];
  const back: Vec3 = alongX ? [len, 1.0, 0.45] : [0.45, 1.0, len];
  const arm: Vec3 = alongX ? [0.45, 0.85, 1.5] : [1.5, 0.85, 0.45];
  const bo = dir === 0 ? -0.55 : dir === 1 ? 0.55 : 0;
  const boX = dir === 2 ? -0.55 : dir === 3 ? 0.55 : 0;
  walls.push({ pos: [x, 0.35, z], size: seat, color, noTex: true });
  walls.push({ pos: [x + boX * (alongX ? 0 : 1), 0.62, z + bo], size: back, color: shadeHex(color, -20), noTex: true });
  if (alongX) {
    walls.push({ pos: [x - len / 2 + 0.22, 0.5, z], size: arm, color: shadeHex(color, -12), noTex: true });
    walls.push({ pos: [x + len / 2 - 0.22, 0.5, z], size: arm, color: shadeHex(color, -12), noTex: true });
    // cushions
    walls.push({ pos: [x - len / 4 + 0.1, 0.72, z + bo * 0.3], size: [len / 2 - 0.5, 0.22, 1.1], color: shadeHex(color, 18), noTex: true, noCollide: true });
    walls.push({ pos: [x + len / 4 - 0.1, 0.72, z + bo * 0.3], size: [len / 2 - 0.5, 0.22, 1.1], color: shadeHex(color, 26), noTex: true, noCollide: true });
  } else {
    walls.push({ pos: [x, 0.5, z - len / 2 + 0.22], size: arm, color: shadeHex(color, -12), noTex: true });
    walls.push({ pos: [x, 0.5, z + len / 2 - 0.22], size: arm, color: shadeHex(color, -12), noTex: true });
    walls.push({ pos: [x + boX * 0.3, 0.72, z - len / 4 + 0.1], size: [1.1, 0.22, len / 2 - 0.5], color: shadeHex(color, 18), noTex: true, noCollide: true });
    walls.push({ pos: [x + boX * 0.3, 0.72, z + len / 4 - 0.1], size: [1.1, 0.22, len / 2 - 0.5], color: shadeHex(color, 26), noTex: true, noCollide: true });
  }
}

function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${c((n >> 16) + amt)}${c(((n >> 8) & 0xff) + amt)}${c((n & 0xff) + amt)}`;
}

/** Bookshelf against a wall. facing: "S" means front faces +z etc. */
function bookshelf(walls: WallBox[], x: number, z: number, facing: "N" | "S" | "E" | "W", w = 3, h = 3.2) {
  const d = 0.9;
  const alongX = facing === "N" || facing === "S";
  walls.push({ pos: [x, h / 2, z], size: alongX ? [w, h, d] : [d, h, w], color: "#5a3a1a", noTex: true });
  const off = d / 2 + 0.04;
  const rep: [number, number] = [Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3))];
  if (facing === "S") walls.push({ pos: [x, h / 2, z + off], size: [w - 0.1, h - 0.15, 0.05], tex: "bookshelf", texRepeat: rep, noCollide: true });
  if (facing === "N") walls.push({ pos: [x, h / 2, z - off], size: [w - 0.1, h - 0.15, 0.05], tex: "bookshelf", texRepeat: rep, noCollide: true });
  if (facing === "E") walls.push({ pos: [x + off, h / 2, z], size: [0.05, h - 0.15, w - 0.1], tex: "bookshelf", texRepeat: rep, noCollide: true });
  if (facing === "W") walls.push({ pos: [x - off, h / 2, z], size: [0.05, h - 0.15, w - 0.1], tex: "bookshelf", texRepeat: rep, noCollide: true });
}

/** TV on a stand, screen facing "facing". */
function tvUnit(walls: WallBox[], x: number, z: number, facing: "N" | "S" | "E" | "W") {
  const alongX = facing === "N" || facing === "S";
  walls.push({ pos: [x, 0.4, z], size: alongX ? [3.2, 0.8, 1.1] : [1.1, 0.8, 3.2], color: "#6a4a2a", noTex: true });
  const sOff = facing === "S" ? 0.1 : facing === "N" ? -0.1 : facing === "E" ? 0.1 : -0.1;
  walls.push({ pos: [x, 1.75, z], size: alongX ? [2.8, 1.7, 0.18] : [0.18, 1.7, 2.8], color: "#14141a", noTex: true });
  if (alongX) walls.push({ pos: [x, 1.75, z + sOff], size: [2.55, 1.45, 0.05], tex: "tvScreen", glow: true, noCollide: true });
  else walls.push({ pos: [x + sOff, 1.75, z], size: [0.05, 1.45, 2.55], tex: "tvScreen", glow: true, noCollide: true });
}

function bed(walls: WallBox[], x: number, z: number, alongX: boolean, blanket = "#4a8ad2") {
  const frame: Vec3 = alongX ? [4.2, 0.5, 2.4] : [2.4, 0.5, 4.2];
  walls.push({ pos: [x, 0.3, z], size: frame, color: "#6a4a2a", noTex: true });
  walls.push({ pos: [x, 0.66, z], size: alongX ? [4.0, 0.3, 2.2] : [2.2, 0.3, 4.0], color: "#f0ece0", noTex: true });
  // blanket covers most of the mattress
  walls.push({ pos: [x + (alongX ? 0.5 : 0), 0.84, z + (alongX ? 0 : 0.5)], size: alongX ? [3.0, 0.14, 2.2] : [2.2, 0.14, 3.0], color: blanket, noTex: true, noCollide: true });
  // pillow
  walls.push({ pos: [x - (alongX ? 1.6 : 0), 0.88, z - (alongX ? 0 : 1.6)], size: alongX ? [0.8, 0.2, 1.4] : [1.4, 0.2, 0.8], color: "#ffffff", noTex: true, noCollide: true });
  // headboard
  walls.push({ pos: [x - (alongX ? 2.15 : 0), 0.9, z - (alongX ? 0 : 2.15)], size: alongX ? [0.15, 1.4, 2.4] : [2.4, 1.4, 0.15], color: "#5a3a1a", noTex: true });
}

function wardrobe(walls: WallBox[], x: number, z: number, alongX: boolean) {
  walls.push({ pos: [x, 1.5, z], size: alongX ? [2.6, 3.0, 0.9] : [0.9, 3.0, 2.6], color: "#7a5230", noTex: true });
  const t = 0.05;
  if (alongX) {
    walls.push({ pos: [x - 0.65, 1.5, z + 0.48], size: [1.18, 2.8, t], color: "#8a6240", noTex: true, noCollide: true });
    walls.push({ pos: [x + 0.65, 1.5, z + 0.48], size: [1.18, 2.8, t], color: "#8a6240", noTex: true, noCollide: true });
  } else {
    walls.push({ pos: [x + 0.48, 1.5, z - 0.65], size: [t, 2.8, 1.18], color: "#8a6240", noTex: true, noCollide: true });
    walls.push({ pos: [x + 0.48, 1.5, z + 0.65], size: [t, 2.8, 1.18], color: "#8a6240", noTex: true, noCollide: true });
  }
}

function desk(walls: WallBox[], x: number, z: number) {
  walls.push({ pos: [x, 0.72, z], size: [2.4, 0.12, 1.2], color: "#8a6240", noTex: true });
  walls.push({ pos: [x - 1.05, 0.36, z], size: [0.12, 0.72, 1.1], color: "#6a4a2a", noTex: true });
  walls.push({ pos: [x + 1.05, 0.36, z], size: [0.12, 0.72, 1.1], color: "#6a4a2a", noTex: true });
  walls.push({ pos: [x + 0.4, 1.12, z - 0.3], size: [1.0, 0.68, 0.08], color: "#14141a", noTex: true, noCollide: true }); // monitor
  walls.push({ pos: [x, 0.5, z + 1.0], size: [0.55, 1.0, 0.55], color: "#c23a3a", noTex: true }); // chair
}

function roundTable(walls: WallBox[], props: Prop[], x: number, z: number, top = "#c9963f", withChairs = true) {
  props.push({ kind: "cylinder", pos: [x, 0.4, z], radiusTop: 0.16, radiusBottom: 0.28, height: 0.8, color: "#2a2018", collides: true });
  props.push({ kind: "cylinder", pos: [x, 0.85, z], radiusTop: 1.15, radiusBottom: 1.15, height: 0.1, color: top, collides: true });
  if (withChairs) {
    for (const [dx, dz] of [[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]]) {
      walls.push({ pos: [x + dx, 0.5, z + dz], size: [0.5, 1.0, 0.5], color: "#3a2a1a", noTex: true });
    }
  }
}

function kitchenCounterX(walls: WallBox[], x: number, z: number, len: number, backAt: "N" | "S") {
  walls.push({ pos: [x, 0.55, z], size: [len, 1.1, 1.2], color: "#e8e4dc", noTex: true });
  walls.push({ pos: [x, 1.14, z], size: [len + 0.12, 0.1, 1.32], tex: "marble", texRepeat: [Math.round(len / 2), 1] });
  const bz = backAt === "N" ? z - 0.9 : z + 0.9;
  walls.push({ pos: [x, 1.85, bz], size: [len, 1.3, 0.1], tex: "tileWhite", texRepeat: [Math.round(len / 1.4), 1], noCollide: true });
}

function fridge(walls: WallBox[], x: number, z: number) {
  walls.push({ pos: [x, 1.55, z], size: [1.5, 3.1, 1.5], color: "#e8ecf2", noTex: true });
  walls.push({ pos: [x, 1.55, z + 0.78], size: [1.3, 2.9, 0.05], color: "#d8dce4", noTex: true, noCollide: true });
  walls.push({ pos: [x - 0.45, 1.8, z + 0.82], size: [0.08, 0.9, 0.06], color: "#8a8a92", noTex: true, noCollide: true });
}

function stove(walls: WallBox[], props: Prop[], x: number, z: number) {
  // slightly taller & deeper than the counter run so faces never z-fight
  walls.push({ pos: [x, 0.58, z], size: [1.8, 1.16, 1.3], color: "#3a3a42", noTex: true });
  walls.push({ pos: [x, 1.2, z], size: [1.9, 0.08, 1.4], color: "#14141a", noTex: true });
  for (const [dx, dz] of [[-0.45, -0.28], [0.45, -0.28], [-0.45, 0.28], [0.45, 0.28]]) {
    props.push({ kind: "cylinder", pos: [x + dx, 1.27, z + dz], radiusTop: 0.22, radiusBottom: 0.22, height: 0.06, color: "#1a1a20" });
  }
}

function bathtub(walls: WallBox[], x: number, z: number) {
  walls.push({ pos: [x, 0.45, z], size: [3.4, 0.9, 1.8], color: "#f4f4f0", noTex: true });
  walls.push({ pos: [x, 0.85, z], size: [2.9, 0.1, 1.3], color: "#7ac2e8", noTex: true, noCollide: true }); // water
}

function toilet(wallsArr: WallBox[], propsArr: Prop[], x: number, z: number) {
  propsArr.push({ kind: "cylinder", pos: [x, 0.35, z], radiusTop: 0.42, radiusBottom: 0.34, height: 0.7, color: "#f4f4f0", collides: true });
  wallsArr.push({ pos: [x, 0.95, z - 0.45], size: [0.7, 0.9, 0.35], color: "#f4f4f0", noTex: true });
}

function sink(propsArr: Prop[], x: number, z: number) {
  propsArr.push({ kind: "cylinder", pos: [x, 0.45, z], radiusTop: 0.16, radiusBottom: 0.22, height: 0.9, color: "#e8e8e4", collides: true });
  propsArr.push({ kind: "cylinder", pos: [x, 0.95, z], radiusTop: 0.42, radiusBottom: 0.3, height: 0.22, color: "#f4f4f0", collides: true });
}

function pendant(propsArr: Prop[], x: number, y: number, z: number, color = "#fff2c4") {
  propsArr.push({ kind: "cylinder", pos: [x, y + 0.5, z], radiusTop: 0.02, radiusBottom: 0.02, height: 1.0, color: "#3a3a3a" });
  propsArr.push({ kind: "sphere", pos: [x, y, z], radius: 0.35, color, emissive: true });
}

function floorLamp(propsArr: Prop[], x: number, z: number) {
  propsArr.push({ kind: "cylinder", pos: [x, 0.8, z], radiusTop: 0.05, radiusBottom: 0.16, height: 1.6, color: "#3a3a3a", collides: true });
  propsArr.push({ kind: "cylinder", pos: [x, 1.85, z], radiusTop: 0.3, radiusBottom: 0.45, height: 0.5, color: "#f4e0a0", emissive: true });
}

function plant(propsArr: Prop[], x: number, z: number, big = false) {
  const h = big ? 2.4 : 1.5;
  propsArr.push({ kind: "cylinder", pos: [x, 0.25, z], radiusTop: 0.32, radiusBottom: 0.42, height: 0.5, color: "#b06a3a", collides: true });
  propsArr.push({ kind: "cylinder", pos: [x, 0.55 + h * 0.3, z], radiusTop: 0.08, radiusBottom: 0.11, height: h * 0.6, color: "#6a4a2a", collides: true });
  propsArr.push({ kind: "sphere", pos: [x, 0.65 + h * 0.72, z], radius: big ? 0.95 : 0.58, color: "#3a8a3a" });
}

function statue(wallsArr: WallBox[], propsArr: Prop[], x: number, z: number, color = "#d8d8e0") {
  wallsArr.push({ pos: [x, 0.35, z], size: [1.3, 0.7, 1.3], tex: "marble" });
  propsArr.push({ kind: "cylinder", pos: [x, 1.3, z], radiusTop: 0.26, radiusBottom: 0.38, height: 1.2, color, collides: true });
  propsArr.push({ kind: "sphere", pos: [x, 2.15, z], radius: 0.3, color, collides: true });
}

function cratePile(wallsArr: WallBox[], x: number, z: number) {
  wallsArr.push({ pos: [x, 0.6, z], size: [1.6, 1.2, 1.6], tex: "woodDark", texRepeat: [1, 1] });
  wallsArr.push({ pos: [x + 1.7, 0.6, z + 0.2], size: [1.4, 1.2, 1.4], tex: "woodDark", texRepeat: [1, 1] });
  wallsArr.push({ pos: [x + 0.7, 1.7, z], size: [1.3, 1.0, 1.3], tex: "woodDark", texRepeat: [1, 1] });
}
function washer(walls: WallBox[], props: Prop[], x: number, z: number, dryer = false) {
  walls.push({ pos: [x, 0.85, z], size: [1.4, 1.7, 1.4], color: dryer ? "#d8dce4" : "#f0f0f4", noTex: true });
  props.push({ kind: "sphere", pos: [x, 0.9, z + 0.72], radius: 0.36, color: "#4a6a8a" }); // round door
  walls.push({ pos: [x - 0.4, 1.62, z + 0.6], size: [0.3, 0.12, 0.2], color: "#3a3a44", noTex: true, noCollide: true });
}

function showerStall(walls: WallBox[], props: Prop[], x: number, z: number) {
  // corner glass booth (translucent-looking panels)
  walls.push({ pos: [x - 1.2, 2.0, z], size: [0.08, 4.0, 2.4], color: "#bcd8e8", noTex: true });
  walls.push({ pos: [x, 2.0, z - 1.2], size: [2.4, 4.0, 0.08], color: "#bcd8e8", noTex: true });
  walls.push({ pos: [x, 0.08, z], size: [2.4, 0.16, 2.4], color: "#d8e4ec", noTex: true, noCollide: true });
  props.push({ kind: "cylinder", pos: [x + 0.9, 3.4, z + 0.9], radiusTop: 0.03, radiusBottom: 0.03, height: 1.4, color: "#a8a8b0" });
  props.push({ kind: "cylinder", pos: [x + 0.8, 4.05, z + 0.8], radiusTop: 0.18, radiusBottom: 0.05, height: 0.12, color: "#c8c8d0" });
}

function airHockey(walls: WallBox[], x: number, z: number, rim: string) {
  walls.push({ pos: [x, 0.5, z], size: [3.6, 1.0, 2.2], color: "#1a1a2e", noTex: true });
  walls.push({ pos: [x, 1.03, z], size: [3.4, 0.1, 2.0], color: "#f0f0f8", noTex: true });
  walls.push({ pos: [x, 1.1, z - 1.02], size: [3.6, 0.14, 0.16], color: rim, glow: true, noTex: true, noCollide: true });
  walls.push({ pos: [x, 1.1, z + 1.02], size: [3.6, 0.14, 0.16], color: rim, glow: true, noTex: true, noCollide: true });
  walls.push({ pos: [x - 1.72, 1.1, z], size: [0.16, 0.14, 2.2], color: rim, glow: true, noTex: true, noCollide: true });
  walls.push({ pos: [x + 1.72, 1.1, z], size: [0.16, 0.14, 2.2], color: rim, glow: true, noTex: true, noCollide: true });
}

function hoopMachine(walls: WallBox[], props: Prop[], x: number, z: number) {
  // basketball arcade machine, backboard toward -z
  walls.push({ pos: [x, 0.6, z], size: [2.0, 1.2, 3.0], color: "#a03a3a", noTex: true });
  walls.push({ pos: [x, 3.0, z - 1.35], size: [2.4, 1.8, 0.15], color: "#f4f4f0", noTex: true, noCollide: true });
  props.push({ kind: "cylinder", pos: [x, 2.5, z - 0.9], radiusTop: 0.35, radiusBottom: 0.35, height: 0.06, color: "#f4a83a" });
  props.push({ kind: "sphere", pos: [x - 0.5, 1.4, z + 0.6], radius: 0.22, color: "#e8742a" });
  props.push({ kind: "sphere", pos: [x + 0.4, 1.4, z + 0.9], radius: 0.22, color: "#e8742a" });
}

function coatRack(props: Prop[], x: number, z: number) {
  props.push({ kind: "cylinder", pos: [x, 1.0, z], radiusTop: 0.04, radiusBottom: 0.18, height: 2.0, color: "#5a3a1a", collides: true });
  props.push({ kind: "sphere", pos: [x - 0.2, 1.85, z], radius: 0.16, color: "#c23a3a" });
  props.push({ kind: "sphere", pos: [x + 0.2, 1.7, z + 0.1], radius: 0.16, color: "#3a6ac2" });
}

// =============================================================================
// MAP 1 — 메챠 하우스 (fully furnished home, 110 x 90)
// =============================================================================

function makeHouse(): MapDef {
  const W = 110, D = 90, H = 6;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  outerWalls(walls, W, D, H, "#ece4d4");
  ceiling(walls, W, D, H, "#f6f2e8");

  // ---------- room dividers (door gaps 4 wide) ----------
  // living (x -55..0, z -45..5) | kitchen (x 0..55, z -45..-5), door z -28..-24
  partition(walls, [0, H / 2, -36.5], [0.5, H, 17], undefined, "#e2d8c4");
  partition(walls, [0, H / 2, -14.5], [0.5, H, 19], undefined, "#e2d8c4");
  // kitchen | bedroom (z = -5, x 0..55), door x 24..28
  partition(walls, [12, H / 2, -5], [24, H, 0.5], undefined, "#e2d8c4");
  partition(walls, [41.5, H / 2, -5], [27, H, 0.5], undefined, "#e2d8c4");
  // living | hall+bath (z = 5, x -55..0), door x -16..-12
  partition(walls, [-35.5, H / 2, 5], [39, H, 0.5], undefined, "#e2d8c4");
  partition(walls, [-6, H / 2, 5], [12, H, 0.5], undefined, "#e2d8c4");
  // bath (x -55..-25) | hall (x -25..0), door z 22..26
  partition(walls, [-25, H / 2, 13.5], [0.5, H, 17], undefined, "#e2d8c4");
  partition(walls, [-25, H / 2, 35.5], [0.5, H, 19], undefined, "#e2d8c4");
  // hall | bedroom (x = 0, z 5..45), door z 14..18
  partition(walls, [0, H / 2, 9.5], [0.5, H, 9], undefined, "#e2d8c4");
  partition(walls, [0, H / 2, 31.5], [0.5, H, 27], undefined, "#e2d8c4");

  // ---------- wallpaper per room ----------
  wallPanel(walls, "W", W / 2, -20, 50, H - 0.4, "wallCream");
  wallPanel(walls, "N", D / 2, -27.5, 55, H - 0.4, "wallCream");
  wallPanel(walls, "N", D / 2, 27.5, 55, H - 0.4, "wallBlue");
  wallPanel(walls, "E", W / 2, -25, 40, H - 0.4, "wallBlue");
  wallPanel(walls, "E", W / 2, 25, 40, H - 0.4, "wallGreen");
  wallPanel(walls, "S", D / 2, 27.5, 55, H - 0.4, "wallGreen");
  wallPanel(walls, "W", W / 2, 25, 40, H - 0.4, "tileBlue");
  wallPanel(walls, "S", D / 2, -40, 30, H - 0.4, "tileBlue");
  wallPanel(walls, "S", D / 2, -12.5, 25, H - 0.4, "wallPurple");

  // ---------- floors per room (base = wood) ----------
  floorArea(walls, 27.5, -25, 55, 40, "tileKitchen");
  floorArea(walls, 27.5, 20, 55, 40, "carpetBlue");
  floorArea(walls, -40, 25, 30, 40, "tileBlue");
  floorArea(walls, -12.5, 25, 25, 40, "woodDark");

  // ---------- LIVING ROOM ----------
  rug(walls, -27, -18, 14, 10, "#b04438");
  sofa(walls, -27, -11.5, 1, "#3a6ac2", 4);
  sofa(walls, -35, -18, 2, "#3a6ac2", 3);
  sofa(walls, -18, -18, 3, "#c9963f", 1.8); // armchair
  walls.push({ pos: [-27, 0.45, -18], size: [2.8, 0.5, 1.4], color: "#8a6240", noTex: true }); // coffee table
  tvUnit(walls, -27, -43.6, "S");
  bookshelf(walls, -46, -43.9, "S", 3.4);
  bookshelf(walls, -10, -43.9, "S", 3.4);
  bookshelf(walls, -54, -28, "E", 3);
  roundTable(walls, propsArr, -10, -32, "#e8e4dc"); // reading table
  floorLamp(propsArr, -48, -34);
  floorLamp(propsArr, -14, -8);
  cratePile(walls, -6, -30);
  plant(propsArr, -52, -42, true);
  plant(propsArr, -4, -8);
  plant(propsArr, -20, 2);
  statue(walls, propsArr, -42, 0, "#d8ccb4");
  windowOn(walls, "W", W / 2, -34);
  windowOn(walls, "W", W / 2, -18);
  windowOn(walls, "W", W / 2, -2);
  windowOn(walls, "N", D / 2, -40);
  poster(walls, "N", D / 2, -18, 3.2, 3.4, 2.6, 0);
  posterAt(walls, -0.32, 3.4, -16, 2.6, 2.2, 5, "x");
  pendant(propsArr, -27, H - 1.2, -18);
  pendant(propsArr, -42, H - 1.2, -30);
  pendant(propsArr, -12, H - 1.2, -36);

  // ---------- KITCHEN ----------
  kitchenCounterX(walls, 14, -43, 24, "N");
  stove(walls, propsArr, 20, -43);
  fridge(walls, 50, -43.3);
  // corner counter along E wall
  walls.push({ pos: [53.6, 0.55, -34], size: [1.2, 1.1, 14], color: "#e8e4dc", noTex: true });
  walls.push({ pos: [53.6, 1.14, -34], size: [1.32, 0.1, 14.2], tex: "marble", texRepeat: [1, 6] });
  walls.push({ pos: [53.5, 1.4, -18], size: [1.6, 2.8, 10], color: "#e8e4dc", noTex: true }); // pantry
  // island + stools
  walls.push({ pos: [26, 0.6, -27], size: [7, 1.2, 2.6], color: "#c8b898", noTex: true });
  walls.push({ pos: [26, 1.26, -27], size: [7.3, 0.12, 2.9], tex: "marble", texRepeat: [3, 1] });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "cylinder", pos: [21.5 + i * 3, 0.6, -23.4], radiusTop: 0.32, radiusBottom: 0.32, height: 1.2, color: "#5a3a1a", collides: true });
  }
  propsArr.push({ kind: "sphere", pos: [25, 1.5, -27], radius: 0.22, color: "#e83a3a" });
  propsArr.push({ kind: "sphere", pos: [26, 1.5, -26.7], radius: 0.2, color: "#f4a83a" });
  propsArr.push({ kind: "sphere", pos: [27, 1.5, -27.3], radius: 0.2, color: "#3ae85c" });
  roundTable(walls, propsArr, 10, -14, "#e8e4dc");
  // open shelf with jars
  walls.push({ pos: [36, 1.2, -6.2], size: [4, 2.4, 0.8], color: "#8a6240", noTex: true });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "sphere", pos: [34.6 + i * 0.95, 2.65, -6.2], radius: 0.22, color: ["#c23a3a", "#3aa85a", "#e8a83a", "#7a3aa0"][i] });
  }
  windowOn(walls, "N", D / 2, 14);
  windowOn(walls, "N", D / 2, 40);
  poster(walls, "E", W / 2, -30, 3.2, 3, 2.4, 2);
  posterAt(walls, 0.32, 3.4, -36, 2.6, 2.2, 4, "x");
  pendant(propsArr, 26, H - 1.4, -27, "#ffe8b0");
  pendant(propsArr, 10, H - 1.4, -14, "#ffe8b0");
  pendant(propsArr, 44, H - 1.4, -36, "#ffe8b0");

  // ---------- BEDROOM (형제 방 — 침대 2개!) ----------
  bed(walls, 48, 36, false, "#4a8ad2");
  bed(walls, 48, 20, false, "#e85a8a");
  wardrobe(walls, 20, 43.5, true);
  walls.push({ pos: [30, 0.6, 43.9], size: [2.2, 1.2, 0.9], color: "#8a6240", noTex: true }); // drawers
  desk(walls, 8, 9.5);
  cratePile(walls, 4, 40);
  rug(walls, 28, 24, 10, 8, "#7a4ad2");
  plant(propsArr, 52, 8);
  poster(walls, "E", W / 2, 16, 3.2, 3, 2.4, 3);
  poster(walls, "E", W / 2, 28, 3.2, 3, 2.4, 7);
  poster(walls, "S", D / 2, 36, 3.2, 3, 2.4, 1);
  windowOn(walls, "S", D / 2, 6);
  windowOn(walls, "S", D / 2, 40);
  pendant(propsArr, 28, H - 1.2, 24);
  pendant(propsArr, 44, H - 1.2, 28);

  // ---------- BATHROOM ----------
  bathtub(walls, -49, 41);
  showerStall(walls, propsArr, -29, 41);
  toilet(walls, propsArr, -52.5, 12);
  sink(propsArr, -45, 8.5);
  sink(propsArr, -41, 8.5);
  walls.push({ pos: [-43, 2.6, 5.45], size: [3.4, 1.6, 0.06], color: "#cfe4ec", glow: true, noTex: true, noCollide: true }); // mirror
  washer(walls, propsArr, -29, 9);
  washer(walls, propsArr, -31, 9 + 1.8, true);
  walls.push({ pos: [-27, 1.0, 20], size: [1.2, 2.0, 1.6], color: "#e8e4dc", noTex: true }); // towel cabinet
  propsArr.push({ kind: "sphere", pos: [-27, 2.25, 20], radius: 0.3, color: "#7ac2e8" });
  plant(propsArr, -52, 30);
  pendant(propsArr, -40, H - 1.4, 25, "#eaf6ff");
  pendant(propsArr, -30, H - 1.4, 12, "#eaf6ff");

  // ---------- HALLWAY ----------
  rug(walls, -12.5, 25, 4, 30, "#b04438");
  walls.push({ pos: [-22, 1.0, 43.5], size: [2.4, 0.9, 1.2], color: "#8a6240", noTex: true }); // console
  coatRack(propsArr, -22, 8);
  bench(walls, -3, 30, true);
  statue(walls, propsArr, -5, 42, "#c8b89a");
  plant(propsArr, -22, 36);
  poster(walls, "S", D / 2, -18, 3.2, 2.6, 2.2, 6);
  poster(walls, "S", D / 2, -8, 3.2, 2.6, 2.2, 4);
  pendant(propsArr, -12.5, H - 1.2, 20);
  pendant(propsArr, -12.5, H - 1.2, 36);

  return {
    name: "house",
    displayName: "메챠 하우스",
    floorSize: [W, D],
    floorTex: "woodFloor",
    floorColor: "#c9a878",
    wallColor: "#ece4d4",
    ambientColor: "#fff4e0",
    skyColor: "#ffeccc",
    groundColor: "#8b6a3a",
    fogNear: 70, fogFar: 220,
    walls, props: propsArr,
    spawnPoints: [
      [-48, PLAYER_EYE, -40], [ -8, PLAYER_EYE, -40],
      [ 44, PLAYER_EYE, -36], [  8, PLAYER_EYE, -36],
      [ 40, PLAYER_EYE,  12], [  6, PLAYER_EYE,  28],
      [-12, PLAYER_EYE,  36], [-40, PLAYER_EYE,  30],
      [-27, PLAYER_EYE, -30], [ 16, PLAYER_EYE, -20],
    ],
  };
}

// =============================================================================
// MAP 2 — 레스토랑 (130 x 130)
// =============================================================================

function makeRestaurant(): MapDef {
  const W = 130, D = 130, H = 7;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  outerWalls(walls, W, D, H, "#efe5d2");
  ceiling(walls, W, D, H, "#f6efe0");

  wallPanel(walls, "N", D / 2, 0, 128, H - 0.4, "wallCream");
  wallPanel(walls, "S", D / 2, 0, 128, H - 0.4, "wallCream");
  wallPanel(walls, "W", W / 2, 0, 128, H - 0.4, "wallCream");
  wallPanel(walls, "E", W / 2, 0, 128, H - 0.4, "wallCream");

  // ---------- booths along W wall ----------
  for (let i = 0; i < 5; i++) {
    const z = -50 + i * 18;
    sofa(walls, -59, z - 3.4, 0, "#a03030", 3.2);
    sofa(walls, -59, z + 3.4, 1, "#a03030", 3.2);
    walls.push({ pos: [-59, 0.55, z], size: [2.6, 1.1, 2.2], color: "#7a4a24", noTex: true });
    walls.push({ pos: [-59, 1.14, z], size: [2.8, 0.08, 2.4], tex: "marble", texRepeat: [1, 1] });
    pendant(propsArr, -59, H - 2.2, z);
    posterAt(walls, -64.35, 3.2, z, 2.6, 2.2, i * 2 + 1, "x");
  }

  // ---------- round tables (5 x 3 grid) ----------
  for (let gx = 0; gx < 5; gx++) for (let gz = 0; gz < 3; gz++) {
    const x = -36 + gx * 12, z = -36 + gz * 13;
    roundTable(walls, propsArr, x, z);
    pendant(propsArr, x, H - 1.8, z);
  }
  rug(walls, -12, -23, 60, 38, "#8a3428");

  // ---------- salad bar (center) ----------
  walls.push({ pos: [0, 0.6, 4], size: [9, 1.2, 2.6], color: "#7a4a24", noTex: true });
  walls.push({ pos: [0, 1.26, 4], size: [9.3, 0.12, 2.9], tex: "marble", texRepeat: [4, 1] });
  for (let i = 0; i < 5; i++) {
    propsArr.push({ kind: "sphere", pos: [-3.2 + i * 1.6, 1.55, 4], radius: 0.26, color: ["#3ae85c", "#e83a3a", "#f4ec3a", "#f4a83a", "#c9963f"][i] });
  }

  // ---------- bar (E) ----------
  walls.push({ pos: [50, 0.6, -30], size: [2.0, 1.2, 30], color: "#7a4a24", noTex: true });
  walls.push({ pos: [50, 1.28, -30], size: [2.4, 0.12, 31], tex: "marble", texRepeat: [1, 7] });
  walls.push({ pos: [60, 2.6, -30], size: [1.0, 5.2, 32], tex: "woodDark", texRepeat: [7, 2] });
  walls.push({ pos: [59.1, 3.1, -30], size: [0.7, 0.1, 32], color: "#7a5a2a", noTex: true });
  for (let i = 0; i < 10; i++) {
    const colors = ["#3a8a4a", "#a03a3a", "#3a5aa0", "#c9963f", "#7a3aa0"];
    propsArr.push({ kind: "cylinder", pos: [59.1, 3.55, -44 + i * 3], radiusTop: 0.11, radiusBottom: 0.15, height: 0.8, color: colors[i % colors.length] });
  }
  for (let i = 0; i < 8; i++) {
    propsArr.push({ kind: "cylinder", pos: [47, 0.6, -44 + i * 4], radiusTop: 0.33, radiusBottom: 0.33, height: 1.2, color: "#4a2a14", collides: true });
  }
  walls.push({ pos: [59.35, 4.6, -30], size: [0.15, 2.6, 8], tex: "menuBoard", noCollide: true });

  // ---------- kitchen (SE) ----------
  partition(walls, [34, H / 2, 22], [32, H, 0.5], undefined, "#e8d9b8"); // front x 18..50
  partition(walls, [18, H / 2, 43], [0.5, H, 42], undefined, "#e8d9b8"); // west z 22..64
  floorArea(walls, 41.5, 43, 45, 41, "tileCheckerBW");
  kitchenCounterX(walls, 34, 62.5, 28, "S");
  stove(walls, propsArr, 28, 62.5);
  stove(walls, propsArr, 40, 62.5);
  fridge(walls, 62, 58);
  fridge(walls, 62, 53);
  walls.push({ pos: [40, 0.6, 40], size: [14, 1.2, 3], color: "#bfc4cc", noTex: true }); // prep island
  walls.push({ pos: [40, 1.26, 40], size: [14.3, 0.12, 3.3], tex: "marble", texRepeat: [6, 1] });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "sphere", pos: [32 + i * 4, 3.4, 48], radius: 0.28, color: "#a8a8b0" });
  }
  cratePile(walls, 60, 34);

  // ---------- stage (SW) ----------
  walls.push({ pos: [-44, 0.5, 52], size: [26, 1.0, 20], tex: "woodDark", texRepeat: [8, 5] });
  walls.push({ pos: [-44, 3.6, 61], size: [26, 5.4, 0.6], tex: "curtainRed", texRepeat: [8, 2] });
  walls.push({ pos: [-56.2, 3.4, 55], size: [1.0, 5.8, 9], tex: "curtainRed", texRepeat: [3, 2] });
  walls.push({ pos: [-31.8, 3.4, 55], size: [1.0, 5.8, 9], tex: "curtainRed", texRepeat: [3, 2] });
  walls.push({ pos: [-40, 1.8, 54], size: [4.5, 1.6, 2.2], color: "#141414", noTex: true }); // piano
  propsArr.push({ kind: "cylinder", pos: [-49, 1.75, 51], radiusTop: 0.05, radiusBottom: 0.05, height: 1.5, color: "#333333", collides: true });
  propsArr.push({ kind: "sphere", pos: [-49, 2.6, 51], radius: 0.14, color: "#222222" });
  propsArr.push({ kind: "sphere", pos: [-52, H - 0.8, 50], radius: 0.4, color: "#ffd24a", emissive: true });
  propsArr.push({ kind: "sphere", pos: [-36, H - 0.8, 50], radius: 0.4, color: "#4ad2ff", emissive: true });

  // ---------- private dining rooms (S center) — 숨기 좋은 개별 룸! ----------
  partition(walls, [-18, 2.25, 58], [0.4, 4.5, 12], undefined, "#e2d8c4");
  partition(walls, [0, 2.25, 58], [0.4, 4.5, 12], undefined, "#e2d8c4");
  partition(walls, [12, 2.25, 58], [0.4, 4.5, 12], undefined, "#e2d8c4");
  // room A front (door x -12..-8), room B front (door x 4..8)
  partition(walls, [-15, 2.25, 52], [6, 4.5, 0.4], undefined, "#e2d8c4");
  partition(walls, [-4, 2.25, 52], [8, 4.5, 0.4], undefined, "#e2d8c4");
  partition(walls, [2, 2.25, 52], [4, 4.5, 0.4], undefined, "#e2d8c4");
  partition(walls, [10, 2.25, 52], [4, 4.5, 0.4], undefined, "#e2d8c4");
  roundTable(walls, propsArr, -9, 58, "#c9963f", false);
  roundTable(walls, propsArr, 6, 58, "#c9963f", false);
  rug(walls, -9, 58, 8, 8, "#3a5a8a");
  rug(walls, 6, 58, 8, 8, "#5a3a8a");
  poster(walls, "S", D / 2, -9, 3.2, 3, 2.4, 0);
  poster(walls, "S", D / 2, 6, 3.2, 3, 2.4, 6);
  pendant(propsArr, -9, 4.2, 58);
  pendant(propsArr, 6, 4.2, 58);

  // ---------- entry (N center) ----------
  partition(walls, [0, 1.8, -54], [14, 3.6, 0.5], undefined, "#e2d8c4");
  rug(walls, 0, -59, 10, 6, "#3a5a8a");
  statue(walls, propsArr, -10, -50);
  statue(walls, propsArr, 10, -50);

  // ---------- greenery, windows, posters, crates ----------
  for (const [px, pz] of [[-24, 12], [12, 14], [-8, 34], [-62, 26], [24, -6], [62, 10], [-30, 34], [40, 10]] as [number, number][]) {
    plant(propsArr, px, pz, Math.abs(px) > 30);
  }
  cratePile(walls, -60, -60);
  windowOn(walls, "N", D / 2, -36); windowOn(walls, "N", D / 2, -22);
  windowOn(walls, "N", D / 2, 22);  windowOn(walls, "N", D / 2, 36);
  windowOn(walls, "E", W / 2, 14);  windowOn(walls, "E", W / 2, 2);
  poster(walls, "S", D / 2, -24, 3.2, 3.4, 2.6, 2);
  poster(walls, "E", W / 2, 26, 3.2, 3.4, 2.6, 0);
  poster(walls, "E", W / 2, -8, 3.2, 3.4, 2.6, 5);
  poster(walls, "W", W / 2, -60, 3.2, 3, 2.4, 6);
  poster(walls, "N", D / 2, 0, 3.6, 4, 3, 4);

  return {
    name: "restaurant",
    displayName: "레스토랑",
    floorSize: [W, D],
    floorTex: "woodFloor",
    floorColor: "#c9a878",
    wallColor: "#efe5d2",
    ambientColor: "#fff2d6",
    skyColor: "#ffe4b0",
    groundColor: "#8b6a3a",
    fogNear: 80, fogFar: 240,
    walls, props: propsArr,
    spawnPoints: [
      [-52, PLAYER_EYE, -58], [ 52, PLAYER_EYE, -58],
      [-58, PLAYER_EYE,  30], [ 56, PLAYER_EYE,  30],
      [  0, PLAYER_EYE, -48], [  0, PLAYER_EYE,  44],
      [-40, PLAYER_EYE,   0], [ 40, PLAYER_EYE,   0],
      [-20, PLAYER_EYE,  30], [ 20, PLAYER_EYE, -50],
    ],
  };
}

// =============================================================================
// MAP 3 — 오락실 (120 x 120, neon night)
// =============================================================================

function makeArcade(): MapDef {
  const W = 120, D = 120, H = 6.5;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  const neon = ["#ff3aa0", "#3affe0", "#f4ff3a", "#a83aff", "#3aff8a", "#ff8a3a"];
  outerWalls(walls, W, D, H, "#241830");
  ceiling(walls, W, D, H, "#150c22");

  wallPanel(walls, "N", D / 2, 0, 118, H - 0.4, "brickDark");
  wallPanel(walls, "S", D / 2, 0, 118, H - 0.4, "brickDark");
  wallPanel(walls, "W", W / 2, 0, 118, H - 0.4, "brickDark");
  wallPanel(walls, "E", W / 2, 0, 118, H - 0.4, "brickDark");

  // neon wall strips
  for (const [side, along, c] of [["N", -30, 0], ["N", 30, 1], ["W", -30, 2], ["W", 10, 3], ["E", -30, 4], ["E", 10, 5], ["S", -34, 1], ["S", 34, 0]] as ["N" | "S" | "E" | "W", number, number][]) {
    const t = 0.1, off = 0.6, half = side === "N" || side === "S" ? D / 2 : W / 2;
    const sz: Vec3 = side === "N" || side === "S" ? [12, 0.5, t] : [t, 0.5, 12];
    const pos: Vec3 = side === "N" ? [along, 4.6, -half + off]
      : side === "S" ? [along, 4.6, half - off]
      : side === "W" ? [-half + off, 4.6, along] : [half - off, 4.6, along];
    walls.push({ pos, size: sz, color: neon[c], glow: true, noTex: true, noCollide: true });
  }

  // ---------- arcade cabinet rows (5 x 10) ----------
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < 10; i++) {
      const x = -40.5 + i * 9;
      const z = -44 + row * 14;
      if (row >= 1 && row <= 3 && i >= 4 && i <= 5) continue; // dance floor gap
      walls.push({ pos: [x, 1.25, z], size: [2.0, 2.5, 1.5], color: "#181030", noTex: true });
      walls.push({ pos: [x, 1.85, z - 0.79], size: [1.5, 1.2, 0.06], tex: `poster${(i + row) % 8}`, glow: true, noCollide: true });
      walls.push({ pos: [x, 2.72, z], size: [2.0, 0.4, 1.5], color: neon[(i + row * 2) % 6], glow: true, noTex: true });
      walls.push({ pos: [x, 1.3, z - 0.85], size: [1.7, 0.18, 0.35], color: "#3a3a4a", noTex: true, noCollide: true });
    }
  }

  // ---------- dance floor + DJ ----------
  floorArea(walls, 0, -16, 18, 18, "neonGrid");
  walls.push({ pos: [0, 1.0, -27], size: [6, 2.0, 2], color: "#100820", noTex: true });
  walls.push({ pos: [0, 2.3, -27], size: [6.4, 0.35, 2.4], color: "#3affe0", glow: true, noTex: true });
  propsArr.push({ kind: "sphere", pos: [0, H - 1.0, -16], radius: 0.55, color: "#f0f0ff", emissive: true });

  // ---------- prize counter (S) ----------
  walls.push({ pos: [0, 0.6, 52], size: [18, 1.2, 1.6], color: "#a03a5a", noTex: true });
  walls.push({ pos: [0, 1.28, 52], size: [18.4, 0.12, 2.0], tex: "marble", texRepeat: [7, 1] });
  walls.push({ pos: [0, 2.9, 56.5], size: [18, 4.6, 0.5], tex: "woodDark", texRepeat: [7, 2] });
  walls.push({ pos: [0, 4.7, 56.1], size: [12, 0.7, 0.15], color: "#3affe0", glow: true, noTex: true, noCollide: true });
  for (let i = 0; i < 9; i++) {
    propsArr.push({ kind: "sphere", pos: [-7 + i * 1.75, 2.2, 56], radius: 0.36, color: neon[i % 6] });
    propsArr.push({ kind: "sphere", pos: [-7 + i * 1.75, 3.35, 56], radius: 0.3, color: neon[(i + 3) % 6] });
  }

  // ---------- claw machines ----------
  for (const x of [-48, -38, -28, 28, 38, 48]) {
    walls.push({ pos: [x, 1.55, 46], size: [2.3, 3.1, 2.3], color: "#2a1040", noTex: true });
    walls.push({ pos: [x, 3.25, 46], size: [2.5, 0.3, 2.5], color: "#ff3aa0", glow: true, noTex: true });
    propsArr.push({ kind: "sphere", pos: [x - 0.4, 0.85, 46], radius: 0.3, color: neon[Math.abs(x) % 6] });
    propsArr.push({ kind: "sphere", pos: [x + 0.4, 0.85, 46.3], radius: 0.26, color: "#3aff8a" });
  }

  // ---------- vending + snack bar (W) ----------
  for (let i = 0; i < 5; i++) {
    walls.push({ pos: [-56.5, 1.5, -30 + i * 10], size: [1.8, 3.0, 2.6], color: i % 2 ? "#3a6ac2" : "#c23a3a", noTex: true });
    walls.push({ pos: [-55.5, 1.6, -30 + i * 10], size: [0.08, 2.6, 2.3], tex: "vending", noCollide: true });
  }
  walls.push({ pos: [-52, 0.6, 30], size: [2.0, 1.2, 16], color: "#4a2a6a", noTex: true });
  walls.push({ pos: [-52, 1.3, 30], size: [2.4, 0.15, 16.5], color: "#f4ff3a", glow: true, noTex: true });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "cylinder", pos: [-48.5, 0.6, 24 + i * 4], radiusTop: 0.33, radiusBottom: 0.33, height: 1.2, color: "#241830", collides: true });
  }

  // ---------- pool + air hockey (E) ----------
  for (const z of [-20, -6, 8, 22]) {
    walls.push({ pos: [52, 0.55, z], size: [4.9, 0.9, 2.9], tex: "woodDark", texRepeat: [2, 1] });
    walls.push({ pos: [52, 1.02, z], size: [4.4, 0.2, 2.4], color: "#2a8a4a", noTex: true });
    propsArr.push({ kind: "sphere", pos: [51.3, 1.24, z + 0.3], radius: 0.12, color: "#f4ec3a" });
    propsArr.push({ kind: "sphere", pos: [52.5, 1.24, z - 0.4], radius: 0.12, color: "#e83a3a" });
    propsArr.push({ kind: "sphere", pos: [53, 1.24, z + 0.5], radius: 0.12, color: "#ffffff" });
    pendant(propsArr, 52, 3.6, z, "#e8f4a0");
  }
  airHockey(walls, 40, 34, "#3affe0");
  airHockey(walls, 28, 34, "#ff3aa0");

  // ---------- basketball machines (N) ----------
  hoopMachine(walls, propsArr, -20, -54);
  hoopMachine(walls, propsArr, 20, -54);

  // ---------- 노래방 (karaoke room, SW) — 숨기 최고! ----------
  partition(walls, [-42, 2.25, 48], [0.4, 4.5, 16], undefined, "#32204a");
  partition(walls, [-55, 2.25, 40], [6, 4.5, 0.4], undefined, "#32204a");
  partition(walls, [-45, 2.25, 40], [6, 4.5, 0.4], undefined, "#32204a"); // door x -52..-48
  sofa(walls, -50, 56, 1, "#7a3aa0", 3);
  walls.push({ pos: [-50, 0.5, 50], size: [2.4, 1.0, 1.4], color: "#241830", noTex: true }); // table
  walls.push({ pos: [-59.0, 2.2, 48], size: [0.06, 2, 3.2], tex: "tvScreen", glow: true, noCollide: true });
  rug(walls, -50, 49, 10, 12, "#3a1a5a");
  propsArr.push({ kind: "sphere", pos: [-50, 4.4, 49], radius: 0.4, color: "#f0f0ff", emissive: true });
  pendant(propsArr, -50, 4.2, 54, "#ff9ad2");

  // ---------- pillars, disco, statues, crates ----------
  for (const [px, pz] of [[-22, -9], [22, -9], [-22, 21], [22, 21], [0, 32]] as [number, number][]) {
    propsArr.push({ kind: "cylinder", pos: [px, H / 2, pz], radiusTop: 0.6, radiusBottom: 0.7, height: H, color: "#32204a", collides: true });
    walls.push({ pos: [px, 3.4, pz], size: [1.5, 0.25, 1.5], color: neon[(Math.abs(px + pz)) % 6], glow: true, noTex: true, noCollide: true });
  }
  for (const x of [-26, 26]) {
    propsArr.push({ kind: "sphere", pos: [x, H - 0.9, 0], radius: 0.5, color: "#f0f0ff", emissive: true });
  }
  statue(walls, propsArr, -8, 40, "#b8b8d0");
  statue(walls, propsArr, 8, 40, "#b8b8d0");
  cratePile(walls, -56, -52);
  cratePile(walls, 54, -52);
  cratePile(walls, 54, 40);

  return {
    name: "arcade",
    displayName: "오락실",
    floorSize: [W, D],
    floorTex: "arcadeCarpet",
    floorColor: "#141030",
    wallColor: "#241830",
    ambientColor: "#e8d0ff",
    skyColor: "#2a1444",
    groundColor: "#140a24",
    fogNear: 65, fogFar: 210,
    walls, props: propsArr,
    spawnPoints: [
      [-50, PLAYER_EYE, -52], [ 50, PLAYER_EYE, -46],
      [-36, PLAYER_EYE,  52], [ 36, PLAYER_EYE,  54],
      [  0, PLAYER_EYE, -56], [  0, PLAYER_EYE,  36],
      [-52, PLAYER_EYE,   5], [ 56, PLAYER_EYE,  30],
      [-16, PLAYER_EYE, -56], [ 16, PLAYER_EYE,   0],
    ],
  };
}


// =============================================================================
// MAP 4 — 목장 (cardboard-cow farm, 130 x 110, outdoors)
// =============================================================================

function fenceRun(walls: WallBox[], x1: number, z1: number, x2: number, z2: number) {
  const alongX = z1 === z2;
  const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  // two rails
  for (const y of [0.55, 1.0]) {
    walls.push({ pos: [cx, y, cz], size: alongX ? [len, 0.12, 0.1] : [0.1, 0.12, len], color: "#f0f0ec", noTex: true });
  }
  // posts
  const n = Math.max(2, Math.round(len / 3.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    walls.push({ pos: [x1 + (x2 - x1) * t, 0.62, z1 + (z2 - z1) * t], size: [0.16, 1.24, 0.16], color: "#e4e4de", noTex: true });
  }
}

/** Cardboard cow cutout on wooden stands — hide behind it, paint yourself like it! */
function cowCutout(walls: WallBox[], x: number, z: number, alongX: boolean) {
  const panel: Vec3 = alongX ? [3.8, 2.5, 0.12] : [0.12, 2.5, 3.8];
  walls.push({ pos: [x, 1.55, z], size: panel, tex: "cowArt", texRepeat: [1, 1] });
  const legOff = alongX ? [1.5, 0.35] : [0.35, 1.5];
  for (const sgn of [-1, 1]) {
    walls.push({
      pos: [x + (alongX ? sgn * legOff[0] : 0.3), 0.7, z + (alongX ? 0.3 : sgn * legOff[0])],
      size: [0.16, 1.4, 0.16], color: "#c8a878", noTex: true,
    });
  }
}

function hayBox(walls: WallBox[], x: number, z: number, stacked = false) {
  walls.push({ pos: [x, 0.6, z], size: [1.9, 1.2, 1.3], tex: "hay", texRepeat: [1, 1] });
  if (stacked) walls.push({ pos: [x + 0.3, 1.75, z], size: [1.6, 1.1, 1.2], tex: "hay", texRepeat: [1, 1] });
}

function makeFarm(): MapDef {
  const W = 130, D = 110;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];

  // perimeter fence (the floor clamp is the real boundary)
  fenceRun(walls, -63, -53, 63, -53);
  fenceRun(walls, -63, 53, 63, 53);
  fenceRun(walls, -63, -53, -63, 53);
  fenceRun(walls, 63, -53, 63, 53);

  // ---------- barn (NW) ----------
  walls.push({ pos: [-38, 4, -48], size: [26, 8, 0.7], tex: "barnWood", texRepeat: [6, 2] }); // back
  walls.push({ pos: [-50.7, 4, -39], size: [0.7, 8, 18], tex: "barnWood", texRepeat: [4, 2] });
  walls.push({ pos: [-25.3, 4, -39], size: [0.7, 8, 18], tex: "barnWood", texRepeat: [4, 2] });
  walls.push({ pos: [-38, 7.4, -32], size: [26, 1.4, 0.7], tex: "barnWood", texRepeat: [6, 1], noCollide: true }); // front beam
  walls.push({ pos: [-38, 8.2, -39.5], size: [27.5, 0.5, 19.5], color: "#7a3226", noTex: true, noCollide: true }); // roof
  hayBox(walls, -46, -44, true);
  hayBox(walls, -30, -44);
  hayBox(walls, -42, -36);
  propsArr.push({ kind: "cylinder", pos: [-33, 0.8, -37], radiusTop: 1.1, radiusBottom: 1.1, height: 1.6, color: "#d8b04a", collides: true });
  // silo
  propsArr.push({ kind: "cylinder", pos: [-14, 6, -46], radiusTop: 4, radiusBottom: 4, height: 12, color: "#b8bcc4", collides: true });
  propsArr.push({ kind: "sphere", pos: [-14, 12.2, -46], radius: 4, color: "#9aa0aa" });

  // ---------- cardboard cow herd! ----------
  const cows: [number, number, boolean][] = [
    [-6, -30, true], [12, -36, false], [30, -28, true], [48, -38, true],
    [-24, -12, false], [-46, -8, true], [8, -8, true], [34, -10, false],
    [52, 4, true], [-8, 12, false], [22, 14, true], [-34, 20, true],
    [44, 26, false], [6, 32, true], [-18, 38, true], [28, 42, false],
  ];
  for (const [cx, cz, ax] of cows) cowCutout(walls, cx, cz, ax);

  // ---------- paddocks (inner fences) ----------
  fenceRun(walls, -20, -20, 20, -20);
  fenceRun(walls, 20, -20, 20, 2);
  fenceRun(walls, -48, 28, -10, 28);
  fenceRun(walls, -48, 28, -48, 46);

  // ---------- hay, troughs, barrels, crates ----------
  hayBox(walls, 40, -46, true); hayBox(walls, 56, -20); hayBox(walls, -56, 36, true);
  for (const [tx, tz] of [[0, -18], [-30, 30]] as [number, number][]) {
    walls.push({ pos: [tx, 0.35, tz], size: [3, 0.7, 1.1], color: "#8a5a30", noTex: true });
    walls.push({ pos: [tx, 0.62, tz], size: [2.7, 0.1, 0.85], color: "#4a9ad8", noTex: true, noCollide: true });
  }
  for (const [bx, bz] of [[-52, -22], [-50, -20], [56, 40], [58, 42], [50, -8]] as [number, number][]) {
    propsArr.push({ kind: "cylinder", pos: [bx, 0.65, bz], radiusTop: 0.5, radiusBottom: 0.55, height: 1.3, color: "#8a5a30", collides: true });
  }
  cratePile(walls, 54, 46);

  // ---------- scarecrows ----------
  for (const [sx, sz] of [[-2, 22], [36, -20]] as [number, number][]) {
    propsArr.push({ kind: "cylinder", pos: [sx, 1.1, sz], radiusTop: 0.07, radiusBottom: 0.09, height: 2.2, color: "#8a6240", collides: true });
    walls.push({ pos: [sx, 1.7, sz], size: [1.8, 0.14, 0.14], color: "#8a6240", noTex: true, noCollide: true });
    propsArr.push({ kind: "sphere", pos: [sx, 2.4, sz], radius: 0.26, color: "#e8d0a0" });
    propsArr.push({ kind: "cylinder", pos: [sx, 2.72, sz], radiusTop: 0.02, radiusBottom: 0.42, height: 0.3, color: "#c8a04a" });
  }

  // ---------- pond (SE) + stones ----------
  propsArr.push({ kind: "cylinder", pos: [46, 0.04, 38], radiusTop: 7, radiusBottom: 7, height: 0.08, color: "#4a9ad8" });
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    propsArr.push({ kind: "sphere", pos: [46 + Math.cos(a) * 7.4, 0.3, 38 + Math.sin(a) * 7.4], radius: 0.35 + (i % 3) * 0.12, color: "#9a9a92", collides: true });
  }

  // ---------- trees ----------
  for (const [tx, tz] of [[-58, -40], [-58, 14], [58, -44], [60, 16], [-40, 46], [16, 48], [60, -2], [-12, -48]] as [number, number][]) {
    propsArr.push({ kind: "cylinder", pos: [tx, 1.5, tz], radiusTop: 0.24, radiusBottom: 0.34, height: 3.0, color: "#6a4a2a", collides: true });
    propsArr.push({ kind: "sphere", pos: [tx, 3.9, tz], radius: 1.8, color: "#3a9a4a" });
    propsArr.push({ kind: "sphere", pos: [tx + 0.9, 3.3, tz + 0.4], radius: 1.1, color: "#44aa54" });
  }

  // ---------- tractor ----------
  walls.push({ pos: [24, 1.0, -44], size: [3.2, 1.4, 1.9], color: "#c23a2a", noTex: true });
  walls.push({ pos: [25.1, 2.1, -44], size: [1.6, 1.2, 1.7], color: "#a82a1a", noTex: true });
  propsArr.push({ kind: "sphere", pos: [23, 0.7, -43], radius: 0.7, color: "#2a2a2e", collides: true });
  propsArr.push({ kind: "sphere", pos: [23, 0.7, -45], radius: 0.7, color: "#2a2a2e", collides: true });
  propsArr.push({ kind: "sphere", pos: [25.6, 0.9, -43], radius: 0.9, color: "#222226", collides: true });
  propsArr.push({ kind: "sphere", pos: [25.6, 0.9, -45], radius: 0.9, color: "#222226", collides: true });

  return {
    name: "farm",
    displayName: "목장",
    floorSize: [W, D],
    floorTex: "grass",
    floorColor: "#7ab85a",
    wallColor: "#f0f0ec",
    ambientColor: "#ffffff",
    skyColor: "#8ecdf2",
    groundColor: "#5a9a4a",
    fogNear: 100, fogFar: 300,
    walls, props: propsArr,
    spawnPoints: [
      [-58, PLAYER_EYE, -48], [ 58, PLAYER_EYE, -48],
      [-58, PLAYER_EYE,  48], [ 34, PLAYER_EYE,  48],
      [  0, PLAYER_EYE, -48], [  0, PLAYER_EYE,  46],
      [-58, PLAYER_EYE,   4], [ 58, PLAYER_EYE,  10],
      [-14, PLAYER_EYE,   2], [ 16, PLAYER_EYE, -28],
    ],
  };
}

const house = makeHouse();
const restaurant = makeRestaurant();
const arcade = makeArcade();
const farm = makeFarm();

export const MAPS: Record<string, MapDef> = { house, farm, restaurant, arcade };
export const MAP_LIST = [house, farm, restaurant, arcade];

// Legacy names from older rooms — alias to the new maps
MAPS["warehouse"] = house;
MAPS["office"] = house;
MAPS["market"] = farm;
MAPS["arena"] = arcade;

export const PLAYER_EYE_HEIGHT = PLAYER_EYE;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;
