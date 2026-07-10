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

// =============================================================================
// MAP 1 — 메챠 하우스 (the flagship: a fully furnished home, 90 x 70)
// =============================================================================

function makeHouse(): MapDef {
  const W = 90, D = 70, H = 6;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  outerWalls(walls, W, D, H, "#ece4d4");
  ceiling(walls, W, D, H, "#f6f2e8");

  // ---------- room dividers (with door gaps) ----------
  // living (W side, z -35..5) | kitchen (E side, z -35..-5)
  partition(walls, [0, H / 2, -28.5], [0.5, H, 13], undefined, "#e2d8c4"); // z -35..-22
  partition(walls, [0, H / 2, -12],   [0.5, H, 14], undefined, "#e2d8c4"); // z -19..-5
  // kitchen | bedroom (z = -5, x 0..45), door x 20..23
  partition(walls, [10, H / 2, -5], [20, H, 0.5], undefined, "#e2d8c4");
  partition(walls, [34, H / 2, -5], [22, H, 0.5], undefined, "#e2d8c4");
  // living | hall+bath (z = 5, x -45..0), door x -12..-9
  partition(walls, [-28.5, H / 2, 5], [33, H, 0.5], undefined, "#e2d8c4");
  partition(walls, [-4.5, H / 2, 5],  [9, H, 0.5], undefined, "#e2d8c4");
  // bath | hall (x = -20, z 5..35), door z 18..21
  partition(walls, [-20, H / 2, 11.5], [0.5, H, 13], undefined, "#e2d8c4");
  partition(walls, [-20, H / 2, 28],   [0.5, H, 14], undefined, "#e2d8c4");
  // hall | bedroom (x = 0, z 5..35), door z 12..15
  partition(walls, [0, H / 2, 8.5], [0.5, H, 7], undefined, "#e2d8c4");
  partition(walls, [0, H / 2, 25],  [0.5, H, 20], undefined, "#e2d8c4");

  // ---------- wallpaper per room ----------
  wallPanel(walls, "W", W / 2, -15, 40, H - 0.4, "wallCream");   // living W
  wallPanel(walls, "N", D / 2, -22.5, 45, H - 0.4, "wallCream"); // living N
  wallPanel(walls, "N", D / 2, 22.5, 45, H - 0.4, "wallBlue");   // kitchen N
  wallPanel(walls, "E", W / 2, -20, 30, H - 0.4, "wallBlue");    // kitchen E
  wallPanel(walls, "E", W / 2, 15, 40, H - 0.4, "wallGreen");    // bedroom E
  wallPanel(walls, "S", D / 2, 22.5, 45, H - 0.4, "wallGreen");  // bedroom S
  wallPanel(walls, "W", W / 2, 20, 30, H - 0.4, "tileBlue");     // bath W
  wallPanel(walls, "S", D / 2, -32.5, 25, H - 0.4, "tileBlue");  // bath S
  wallPanel(walls, "S", D / 2, -10, 20, H - 0.4, "wallPurple");  // hall S

  // ---------- floors per room (base = wood) ----------
  floorArea(walls, 22.5, -20, 45, 30, "tileKitchen"); // kitchen
  floorArea(walls, 22.5, 15, 45, 40, "carpetBlue");   // bedroom
  floorArea(walls, -32.5, 20, 25, 30, "tileBlue");    // bathroom
  floorArea(walls, -10, 20, 20, 30, "woodDark");      // hallway

  // ---------- LIVING ROOM ----------
  rug(walls, -22, -14, 12, 8, "#b04438");
  sofa(walls, -22, -8.6, 1, "#3a6ac2");            // faces the TV (北)
  sofa(walls, -29.5, -14, 2, "#3a6ac2", 2.6);      // corner piece faces +x
  walls.push({ pos: [-22, 0.45, -13.6], size: [2.6, 0.5, 1.3], color: "#8a6240", noTex: true }); // coffee table
  tvUnit(walls, -22, -33.6, "S");
  bookshelf(walls, -38, -33.9, "S", 3.4);
  bookshelf(walls, -8, -33.9, "S", 3.4);
  bookshelf(walls, -44, -8, "E", 3);
  floorLamp(propsArr, -14, -8);
  plant(propsArr, -42, -30, true);
  plant(propsArr, -3.5, -8);
  statue(walls, propsArr, -36, 1, "#d8ccb4");
  windowOn(walls, "W", W / 2, -24);
  windowOn(walls, "W", W / 2, -6);
  poster(walls, "N", D / 2, -14, 3.2, 3.4, 2.6, 0);
  posterAt(walls, -0.32, 3.4, -12, 2.6, 2.2, 5, "x"); // on divider, living side
  pendant(propsArr, -22, H - 1.2, -14);
  pendant(propsArr, -36, H - 1.2, -22);

  // ---------- KITCHEN ----------
  kitchenCounterX(walls, 11, -33, 18, "N");
  stove(walls, propsArr, 16, -33);
  fridge(walls, 42.5, -32.5);
  walls.push({ pos: [43.5, 1.4, -20], size: [1.6, 2.8, 8], color: "#e8e4dc", noTex: true }); // pantry cabinet
  // island + stools
  walls.push({ pos: [24, 0.6, -19], size: [6, 1.2, 2.4], color: "#c8b898", noTex: true });
  walls.push({ pos: [24, 1.26, -19], size: [6.3, 0.12, 2.7], tex: "marble", texRepeat: [3, 1] });
  for (let i = 0; i < 3; i++) {
    propsArr.push({ kind: "cylinder", pos: [21 + i * 3, 0.6, -15.8], radiusTop: 0.32, radiusBottom: 0.32, height: 1.2, color: "#5a3a1a", collides: true });
  }
  // fruit bowl on island
  propsArr.push({ kind: "sphere", pos: [23.3, 1.5, -19], radius: 0.22, color: "#e83a3a" });
  propsArr.push({ kind: "sphere", pos: [24.2, 1.5, -18.7], radius: 0.2, color: "#f4a83a" });
  propsArr.push({ kind: "sphere", pos: [24.9, 1.5, -19.3], radius: 0.2, color: "#3ae85c" });
  roundTable(walls, propsArr, 10, -12, "#e8e4dc");
  windowOn(walls, "N", D / 2, 30);
  poster(walls, "E", W / 2, -12, 3.2, 3, 2.4, 2); // pizza poster
  pendant(propsArr, 24, H - 1.4, -19, "#ffe8b0");
  pendant(propsArr, 10, H - 1.4, -12, "#ffe8b0");

  // ---------- BEDROOM ----------
  bed(walls, 40, 26, false, "#4a8ad2");
  wardrobe(walls, 20, 33.5, true);
  desk(walls, 40, 2.5 + 5);   // desk near divider (z 7.5)
  cratePile(walls, 5, 31);    // toy boxes
  rug(walls, 28, 18, 8, 6, "#7a4ad2");
  plant(propsArr, 3, 8);
  poster(walls, "E", W / 2, 12, 3.2, 3, 2.4, 3);
  poster(walls, "E", W / 2, 20, 3.2, 3, 2.4, 7);
  poster(walls, "S", D / 2, 30, 3.2, 3, 2.4, 1);
  windowOn(walls, "S", D / 2, 12);
  pendant(propsArr, 28, H - 1.2, 20);

  // ---------- BATHROOM ----------
  bathtub(walls, -40, 31.5);
  toilet(walls, propsArr, -42.5, 10);
  sink(propsArr, -36, 8.5);
  // mirror
  walls.push({ pos: [-36, 2.6, 5.45], size: [2.2, 1.6, 0.06], color: "#cfe4ec", glow: true, noTex: true, noCollide: true });
  walls.push({ pos: [-24, 1.0, 32], size: [1.6, 2.0, 1.2], color: "#e8e4dc", noTex: true }); // towel cabinet
  propsArr.push({ kind: "sphere", pos: [-24, 2.25, 32], radius: 0.3, color: "#7ac2e8" }); // towels
  pendant(propsArr, -34, H - 1.4, 20, "#eaf6ff");

  // ---------- HALLWAY ----------
  rug(walls, -10, 20, 3, 22, "#b04438");
  walls.push({ pos: [-17, 1.0, 33.5], size: [2.4, 0.9, 1.2], color: "#8a6240", noTex: true }); // console table
  plant(propsArr, -17, 30);
  statue(walls, propsArr, -4, 32, "#c8b89a");
  poster(walls, "S", D / 2, -14, 3.2, 2.6, 2.2, 6);
  poster(walls, "S", D / 2, -6, 3.2, 2.6, 2.2, 4);
  pendant(propsArr, -10, H - 1.2, 20);

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
    fogNear: 60, fogFar: 190,
    walls, props: propsArr,
    spawnPoints: [
      [-40, PLAYER_EYE, -30], [-6, PLAYER_EYE, -30],
      [ 40, PLAYER_EYE, -30], [ 6, PLAYER_EYE, -10],
      [ 40, PLAYER_EYE,  12], [ 10, PLAYER_EYE,  30],
      [-10, PLAYER_EYE,  30], [-40, PLAYER_EYE,  20],
      [-30, PLAYER_EYE, -20], [ 30, PLAYER_EYE, -20],
    ],
  };
}

// =============================================================================
// MAP 2 — 레스토랑 (110 x 110)
// =============================================================================

function makeRestaurant(): MapDef {
  const W = 110, D = 110, H = 7;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  outerWalls(walls, W, D, H, "#efe5d2");
  ceiling(walls, W, D, H, "#f6efe0");

  // wallpaper all around
  wallPanel(walls, "N", D / 2, 0, 108, H - 0.4, "wallCream");
  wallPanel(walls, "S", D / 2, 0, 108, H - 0.4, "wallCream");
  wallPanel(walls, "W", W / 2, 0, 108, H - 0.4, "wallCream");
  wallPanel(walls, "E", W / 2, 0, 108, H - 0.4, "wallCream");

  // ---------- dining hall: booths along W wall ----------
  for (let i = 0; i < 4; i++) {
    const z = -36 + i * 18;
    sofa(walls, -49, z - 3.4, 0, "#a03030", 3.2);
    sofa(walls, -49, z + 3.4, 1, "#a03030", 3.2);
    walls.push({ pos: [-49, 0.55, z], size: [2.6, 1.1, 2.2], color: "#7a4a24", noTex: true }); // booth table
    walls.push({ pos: [-49, 1.14, z], size: [2.8, 0.08, 2.4], tex: "marble", texRepeat: [1, 1] });
    pendant(propsArr, -49, H - 2.2, z);
    posterAt(walls, -54.4, 3.2, z, 2.6, 2.2, i * 2 + 1, "x");
  }

  // round tables (center)
  const tableSpots: [number, number][] = [];
  for (let gx = 0; gx < 4; gx++) for (let gz = 0; gz < 3; gz++) {
    tableSpots.push([-24 + gx * 12, -26 + gz * 13]);
  }
  for (const [x, z] of tableSpots) {
    roundTable(walls, propsArr, x, z);
    pendant(propsArr, x, H - 1.8, z);
  }
  rug(walls, -6, -13, 52, 44, "#8a3428");

  // ---------- bar (NE) ----------
  walls.push({ pos: [40, 0.6, -34], size: [2.0, 1.2, 26], color: "#7a4a24", noTex: true });
  walls.push({ pos: [40, 1.28, -34], size: [2.4, 0.12, 27], tex: "marble", texRepeat: [1, 6] });
  walls.push({ pos: [50, 2.6, -34], size: [1.0, 5.2, 28], tex: "woodDark", texRepeat: [6, 2] });
  walls.push({ pos: [49.1, 3.1, -34], size: [0.7, 0.1, 28], color: "#7a5a2a", noTex: true });
  for (let i = 0; i < 9; i++) {
    const colors = ["#3a8a4a", "#a03a3a", "#3a5aa0", "#c9963f", "#7a3aa0"];
    propsArr.push({ kind: "cylinder", pos: [-0 + 49.1, 3.55, -46 + i * 3], radiusTop: 0.11, radiusBottom: 0.15, height: 0.8, color: colors[i % colors.length] });
  }
  for (let i = 0; i < 7; i++) {
    propsArr.push({ kind: "cylinder", pos: [37, 0.6, -46 + i * 4], radiusTop: 0.33, radiusBottom: 0.33, height: 1.2, color: "#4a2a14", collides: true });
  }
  walls.push({ pos: [44, 4.2, -47.5], size: [8, 3.2, 0.15], tex: "menuBoard", noCollide: true });

  // ---------- kitchen (SE) ----------
  partition(walls, [24, H / 2, 14], [30, H, 0.5], undefined, "#e8d9b8");   // kitchen front wall x 9..39
  partition(walls, [12, H / 2, 33], [0.5, H, 38], undefined, "#e8d9b8");   // kitchen west wall z 14..52
  floorArea(walls, 33, 34, 42, 38, "tileWhite");
  kitchenCounterX(walls, 30, 51, 24, "S");
  stove(walls, propsArr, 24, 51);
  stove(walls, propsArr, 34, 51);
  fridge(walls, 51, 44);
  fridge(walls, 51, 39);
  walls.push({ pos: [30, 0.6, 30], size: [12, 1.2, 3], color: "#bfc4cc", noTex: true }); // prep island
  walls.push({ pos: [30, 1.26, 30], size: [12.3, 0.12, 3.3], tex: "marble", texRepeat: [5, 1] });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "sphere", pos: [26 + i * 3, 3.4, 40], radius: 0.28, color: "#a8a8b0" }); // hanging pots
  }

  // ---------- stage (SW) ----------
  walls.push({ pos: [-34, 0.5, 42], size: [26, 1.0, 18], tex: "woodDark", texRepeat: [8, 5] });
  walls.push({ pos: [-34, 3.6, 50.5], size: [26, 5.4, 0.6], tex: "curtainRed", texRepeat: [8, 2] });
  walls.push({ pos: [-46.2, 3.4, 45], size: [1.0, 5.8, 9], tex: "curtainRed", texRepeat: [3, 2] });
  walls.push({ pos: [-21.8, 3.4, 45], size: [1.0, 5.8, 9], tex: "curtainRed", texRepeat: [3, 2] });
  walls.push({ pos: [-30, 1.8, 44], size: [4.5, 1.6, 2.2], color: "#141414", noTex: true }); // piano
  propsArr.push({ kind: "cylinder", pos: [-39, 1.75, 41], radiusTop: 0.05, radiusBottom: 0.05, height: 1.5, color: "#333333", collides: true });
  propsArr.push({ kind: "sphere", pos: [-39, 2.6, 41], radius: 0.14, color: "#222222" });
  propsArr.push({ kind: "sphere", pos: [-42, H - 0.8, 40], radius: 0.4, color: "#ffd24a", emissive: true });
  propsArr.push({ kind: "sphere", pos: [-26, H - 0.8, 40], radius: 0.4, color: "#4ad2ff", emissive: true });

  // ---------- entry (N center) ----------
  partition(walls, [0, 1.8, -48], [12, 3.6, 0.5], undefined, "#e2d8c4");
  rug(walls, 0, -51.5, 10, 5, "#3a5a8a");
  statue(walls, propsArr, -8, -44);
  statue(walls, propsArr, 8, -44);

  // ---------- greenery, windows, posters ----------
  for (const [px, pz] of [[-20, 10], [8, 10], [-6, 30], [-52, 20], [20, -10], [52, 8]] as [number, number][]) {
    plant(propsArr, px, pz, Math.abs(px) > 30);
  }
  windowOn(walls, "N", D / 2, -30); windowOn(walls, "N", D / 2, -18);
  windowOn(walls, "N", D / 2, 18);  windowOn(walls, "N", D / 2, 30);
  poster(walls, "S", D / 2, 8, 3.2, 3.4, 2.6, 2);
  poster(walls, "S", D / 2, 0, 3.2, 3.4, 2.6, 4);
  poster(walls, "E", W / 2, 20, 3.2, 3.4, 2.6, 0);
  poster(walls, "E", W / 2, -8, 3.2, 3.4, 2.6, 5);
  poster(walls, "W", W / 2, -50, 3.2, 3, 2.4, 6);

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
    fogNear: 70, fogFar: 210,
    walls, props: propsArr,
    spawnPoints: [
      [-50, PLAYER_EYE, -50], [ 50, PLAYER_EYE, -50],
      [-50, PLAYER_EYE,  30], [ 46, PLAYER_EYE,  24],
      [  0, PLAYER_EYE, -40], [  0, PLAYER_EYE,  40],
      [-42, PLAYER_EYE,   0], [ 50, PLAYER_EYE,   0],
      [-16, PLAYER_EYE,  44], [ 30, PLAYER_EYE,  20],
    ],
  };
}

// =============================================================================
// MAP 3 — 오락실 (100 x 100, neon night)
// =============================================================================

function makeArcade(): MapDef {
  const W = 100, D = 100, H = 6.5;
  const walls: WallBox[] = [];
  const propsArr: Prop[] = [];
  const neon = ["#ff3aa0", "#3affe0", "#f4ff3a", "#a83aff", "#3aff8a", "#ff8a3a"];
  outerWalls(walls, W, D, H, "#241830");
  ceiling(walls, W, D, H, "#150c22");

  wallPanel(walls, "N", D / 2, 0, 98, H - 0.4, "brickDark");
  wallPanel(walls, "S", D / 2, 0, 98, H - 0.4, "brickDark");
  wallPanel(walls, "W", W / 2, 0, 98, H - 0.4, "brickDark");
  wallPanel(walls, "E", W / 2, 0, 98, H - 0.4, "brickDark");

  // neon wall strips
  for (const [side, along, c] of [["N", -20, 0], ["N", 20, 1], ["W", -20, 2], ["W", 24, 3], ["E", -20, 4], ["E", 24, 5], ["S", -28, 1], ["S", 28, 0]] as ["N" | "S" | "E" | "W", number, number][]) {
    const t = 0.1, off = 0.6, half = side === "N" || side === "S" ? D / 2 : W / 2;
    const sz: Vec3 = side === "N" || side === "S" ? [10, 0.5, t] : [t, 0.5, 10];
    const pos: Vec3 = side === "N" ? [along, 4.6, -half + off]
      : side === "S" ? [along, 4.6, half - off]
      : side === "W" ? [-half + off, 4.6, along] : [half - off, 4.6, along];
    walls.push({ pos, size: sz, color: neon[c], glow: true, noTex: true, noCollide: true });
  }

  // ---------- arcade cabinet rows ----------
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 8; i++) {
      const x = -31.5 + i * 9;
      const z = -32 + row * 14;
      if (row >= 1 && row <= 2 && i >= 3 && i <= 4) continue; // dance floor gap
      walls.push({ pos: [x, 1.25, z], size: [2.0, 2.5, 1.5], color: "#181030", noTex: true });
      walls.push({ pos: [x, 1.85, z - 0.79], size: [1.5, 1.2, 0.06], tex: `poster${(i + row) % 8}`, glow: true, noCollide: true });
      walls.push({ pos: [x, 2.72, z], size: [2.0, 0.4, 1.5], color: neon[(i + row * 2) % 6], glow: true, noTex: true });
      walls.push({ pos: [x, 1.3, z - 0.85], size: [1.7, 0.18, 0.35], color: "#3a3a4a", noTex: true, noCollide: true }); // control deck
    }
  }

  // ---------- dance floor + DJ ----------
  floorArea(walls, 0, -11, 16, 16, "neonGrid");
  walls.push({ pos: [0, 1.0, -20], size: [6, 2.0, 2], color: "#100820", noTex: true });
  walls.push({ pos: [0, 2.3, -20], size: [6.4, 0.35, 2.4], color: "#3affe0", glow: true, noTex: true });
  propsArr.push({ kind: "sphere", pos: [0, H - 1.0, -11], radius: 0.55, color: "#f0f0ff", emissive: true });

  // ---------- prize counter (S) ----------
  walls.push({ pos: [0, 0.6, 42], size: [16, 1.2, 1.6], color: "#a03a5a", noTex: true });
  walls.push({ pos: [0, 1.28, 42], size: [16.4, 0.12, 2.0], tex: "marble", texRepeat: [6, 1] });
  walls.push({ pos: [0, 2.9, 46.5], size: [16, 4.6, 0.5], tex: "woodDark", texRepeat: [6, 2] });
  walls.push({ pos: [0, 4.7, 46.1], size: [10, 0.7, 0.15], color: "#3affe0", glow: true, noTex: true, noCollide: true });
  for (let i = 0; i < 8; i++) {
    propsArr.push({ kind: "sphere", pos: [-6.2 + i * 1.75, 2.2, 46], radius: 0.36, color: neon[i % 6] });
    propsArr.push({ kind: "sphere", pos: [-6.2 + i * 1.75, 3.35, 46], radius: 0.3, color: neon[(i + 3) % 6] });
  }

  // ---------- claw machines ----------
  for (const x of [-40, -31, 31, 40]) {
    walls.push({ pos: [x, 1.55, 36], size: [2.3, 3.1, 2.3], color: "#2a1040", noTex: true });
    walls.push({ pos: [x, 3.25, 36], size: [2.5, 0.3, 2.5], color: "#ff3aa0", glow: true, noTex: true });
    propsArr.push({ kind: "sphere", pos: [x - 0.4, 0.85, 36], radius: 0.3, color: neon[Math.abs(x) % 6] });
    propsArr.push({ kind: "sphere", pos: [x + 0.4, 0.85, 36.3], radius: 0.26, color: "#3aff8a" });
  }

  // ---------- vending + snack bar (W) ----------
  for (let i = 0; i < 4; i++) {
    walls.push({ pos: [-46.5, 1.5, -24 + i * 9], size: [1.8, 3.0, 2.6], color: "#c23a3a", noTex: true });
    walls.push({ pos: [-45.5, 1.6, -24 + i * 9], size: [0.08, 2.6, 2.3], tex: "vending", noCollide: true });
  }
  walls.push({ pos: [-42, 0.6, 20], size: [2.0, 1.2, 14], color: "#4a2a6a", noTex: true });
  walls.push({ pos: [-42, 1.3, 20], size: [2.4, 0.15, 14.5], color: "#f4ff3a", glow: true, noTex: true });
  for (let i = 0; i < 4; i++) {
    propsArr.push({ kind: "cylinder", pos: [-38.5, 0.6, 15 + i * 3.4], radiusTop: 0.33, radiusBottom: 0.33, height: 1.2, color: "#241830", collides: true });
  }

  // ---------- pool tables (E) ----------
  for (const z of [-14, 2, 18]) {
    walls.push({ pos: [42, 0.55, z], size: [4.9, 0.9, 2.9], tex: "woodDark", texRepeat: [2, 1] });
    walls.push({ pos: [42, 1.02, z], size: [4.4, 0.2, 2.4], color: "#2a8a4a", noTex: true });
    propsArr.push({ kind: "sphere", pos: [41.3, 1.24, z + 0.3], radius: 0.12, color: "#f4ec3a" });
    propsArr.push({ kind: "sphere", pos: [42.5, 1.24, z - 0.4], radius: 0.12, color: "#e83a3a" });
    propsArr.push({ kind: "sphere", pos: [43, 1.24, z + 0.5], radius: 0.12, color: "#ffffff" });
    pendant(propsArr, 42, 3.6, z, "#e8f4a0");
  }

  // ---------- pillars + disco ----------
  for (const [px, pz] of [[-18, -4], [18, -4], [-18, 12], [18, 12]] as [number, number][]) {
    propsArr.push({ kind: "cylinder", pos: [px, H / 2, pz], radiusTop: 0.6, radiusBottom: 0.7, height: H, color: "#32204a", collides: true });
    walls.push({ pos: [px, 3.4, pz], size: [1.5, 0.25, 1.5], color: neon[(Math.abs(px + pz)) % 6], glow: true, noTex: true, noCollide: true });
  }
  for (const x of [-24, 24]) {
    propsArr.push({ kind: "sphere", pos: [x, H - 0.9, 0], radius: 0.5, color: "#f0f0ff", emissive: true });
  }
  statue(walls, propsArr, -8, 30, "#b8b8d0");
  statue(walls, propsArr, 8, 30, "#b8b8d0");
  cratePile(walls, -44, 42);
  cratePile(walls, 44, -44);

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
    fogNear: 55, fogFar: 180,
    walls, props: propsArr,
    spawnPoints: [
      [-44, PLAYER_EYE, -44], [ 36, PLAYER_EYE, -40],
      [-44, PLAYER_EYE,  28], [ 44, PLAYER_EYE,  28],
      [  0, PLAYER_EYE, -44], [  0, PLAYER_EYE,  32],
      [-44, PLAYER_EYE,   0], [ 44, PLAYER_EYE,  10],
      [-22, PLAYER_EYE,  42], [ 22, PLAYER_EYE, -44],
    ],
  };
}

const house = makeHouse();
const restaurant = makeRestaurant();
const arcade = makeArcade();

export const MAPS: Record<string, MapDef> = { house, restaurant, arcade };
export const MAP_LIST = [house, restaurant, arcade];

// Legacy names from older rooms — alias to the new maps
MAPS["warehouse"] = house;
MAPS["office"] = house;
MAPS["market"] = house;
MAPS["arena"] = arcade;

export const PLAYER_EYE_HEIGHT = PLAYER_EYE;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;
