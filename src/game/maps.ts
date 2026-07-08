// Map definitions for Mecha Chameleon
// Coordinate system: XZ plane is the ground, Y is up.
// Walls are axis-aligned boxes with a center position and size.

export type Vec3 = [number, number, number];

export type WallBox = {
  pos: Vec3;   // center
  size: Vec3;  // width, height, depth
  color?: string;
};

export type MapDef = {
  name: string;
  displayName: string;
  floorSize: [number, number]; // width x depth
  floorColor: string;
  wallColor: string;
  ambientColor: string;
  walls: WallBox[];
  spawnPoints: Vec3[];
};

const PLAYER_EYE = 1.6;

// Build outer wall ring for a rectangular floor
function outerWalls(w: number, d: number, h = 4, color = "#3a4a5a"): WallBox[] {
  const t = 0.6;
  return [
    { pos: [0, h / 2, -d / 2], size: [w, h, t], color },
    { pos: [0, h / 2,  d / 2], size: [w, h, t], color },
    { pos: [-w / 2, h / 2, 0], size: [t, h, d], color },
    { pos: [ w / 2, h / 2, 0], size: [t, h, d], color },
  ];
}

// ---- Warehouse: crates and shelving ----
const warehouse: MapDef = {
  name: "warehouse",
  displayName: "창고",
  floorSize: [60, 60],
  floorColor: "#1a1f26",
  wallColor: "#3a4a5a",
  ambientColor: "#7a8fa8",
  walls: [
    ...outerWalls(60, 60, 5, "#3a4a5a"),
    // shelving rows
    { pos: [-18, 1.5, -15], size: [10, 3, 2], color: "#5a4a3a" },
    { pos: [-18, 1.5,   0], size: [10, 3, 2], color: "#5a4a3a" },
    { pos: [-18, 1.5,  15], size: [10, 3, 2], color: "#5a4a3a" },
    { pos: [ 18, 1.5, -15], size: [10, 3, 2], color: "#5a4a3a" },
    { pos: [ 18, 1.5,   0], size: [10, 3, 2], color: "#5a4a3a" },
    { pos: [ 18, 1.5,  15], size: [10, 3, 2], color: "#5a4a3a" },
    // scattered crates
    { pos: [-5, 1, -20], size: [2, 2, 2], color: "#a07040" },
    { pos: [-3, 1, -18], size: [2, 2, 2], color: "#a07040" },
    { pos: [ 5, 1,  20], size: [2, 2, 2], color: "#a07040" },
    { pos: [ 7, 1,  22], size: [2, 2, 2], color: "#a07040" },
    { pos: [ 0, 1,   8], size: [3, 2, 3], color: "#a07040" },
    { pos: [-8, 1,  22], size: [2, 2, 2], color: "#a07040" },
    { pos: [ 22, 1, -22], size: [2, 2, 2], color: "#a07040" },
    { pos: [-22, 1,  22], size: [2, 2, 2], color: "#a07040" },
    // central pillar
    { pos: [0, 2.5, 0], size: [2, 5, 2], color: "#4a5a6a" },
  ],
  spawnPoints: [
    [-25, PLAYER_EYE, -25], [ 25, PLAYER_EYE, -25],
    [-25, PLAYER_EYE,  25], [ 25, PLAYER_EYE,  25],
    [  0, PLAYER_EYE, -27], [  0, PLAYER_EYE,  27],
    [-27, PLAYER_EYE,   0], [ 27, PLAYER_EYE,   0],
  ],
};

// ---- Office: rooms and corridors ----
const office: MapDef = {
  name: "office",
  displayName: "오피스",
  floorSize: [50, 50],
  floorColor: "#20242a",
  wallColor: "#8892a0",
  ambientColor: "#c0d0e0",
  walls: [
    ...outerWalls(50, 50, 4, "#8892a0"),
    // vertical partitions
    { pos: [-15, 2, -12], size: [0.3, 4, 16], color: "#8892a0" },
    { pos: [  0, 2, -18], size: [0.3, 4,  8], color: "#8892a0" },
    { pos: [ 15, 2, -12], size: [0.3, 4, 16], color: "#8892a0" },
    { pos: [-10, 2,  10], size: [0.3, 4, 12], color: "#8892a0" },
    { pos: [ 10, 2,  10], size: [0.3, 4, 12], color: "#8892a0" },
    // horizontal partitions
    { pos: [-18, 2, -4], size: [10, 4, 0.3], color: "#8892a0" },
    { pos: [ 18, 2, -4], size: [10, 4, 0.3], color: "#8892a0" },
    { pos: [  0, 2,  4], size: [20, 4, 0.3], color: "#8892a0" },
    { pos: [  0, 2, 18], size: [16, 4, 0.3], color: "#8892a0" },
    // desks (low)
    { pos: [-20, 0.5, -20], size: [4, 1, 2], color: "#4a3a2a" },
    { pos: [ 20, 0.5, -20], size: [4, 1, 2], color: "#4a3a2a" },
    { pos: [-20, 0.5,  20], size: [4, 1, 2], color: "#4a3a2a" },
    { pos: [ 20, 0.5,  20], size: [4, 1, 2], color: "#4a3a2a" },
    { pos: [  0, 0.5,  12], size: [6, 1, 2], color: "#4a3a2a" },
    // reception desk
    { pos: [  0, 0.6,  22], size: [8, 1.2, 1], color: "#5a4a3a" },
  ],
  spawnPoints: [
    [-22, PLAYER_EYE, -22], [ 22, PLAYER_EYE, -22],
    [-22, PLAYER_EYE,  22], [ 22, PLAYER_EYE,  22],
    [  0, PLAYER_EYE, -22], [  0, PLAYER_EYE,   0],
    [-22, PLAYER_EYE,   0], [ 22, PLAYER_EYE,   0],
  ],
};

// ---- Arena: circular with pillar clusters ----
const arena: MapDef = {
  name: "arena",
  displayName: "아레나",
  floorSize: [70, 70],
  floorColor: "#151820",
  wallColor: "#4a3a5a",
  ambientColor: "#a080c0",
  walls: [
    ...outerWalls(70, 70, 6, "#4a3a5a"),
    // pillar rings (approx circle by clusters)
    ...[
      [-14, 0], [14, 0], [0, -14], [0, 14],
      [-10, -10], [10, 10], [-10, 10], [10, -10],
    ].map<WallBox>(([x, z]) => ({
      pos: [x, 2, z], size: [1.6, 4, 1.6], color: "#6a4a8a",
    })),
    // outer blockers
    { pos: [-25, 1.5, -20], size: [4, 3, 4], color: "#3a2a4a" },
    { pos: [ 25, 1.5,  20], size: [4, 3, 4], color: "#3a2a4a" },
    { pos: [-25, 1.5,  20], size: [4, 3, 4], color: "#3a2a4a" },
    { pos: [ 25, 1.5, -20], size: [4, 3, 4], color: "#3a2a4a" },
    { pos: [ 0, 1, 0], size: [4, 2, 4], color: "#8a6aa0" },
    // low walls
    { pos: [-18, 0.6, 0], size: [8, 1.2, 0.6], color: "#5a4a6a" },
    { pos: [ 18, 0.6, 0], size: [8, 1.2, 0.6], color: "#5a4a6a" },
    { pos: [0, 0.6, -18], size: [0.6, 1.2, 8], color: "#5a4a6a" },
    { pos: [0, 0.6,  18], size: [0.6, 1.2, 8], color: "#5a4a6a" },
  ],
  spawnPoints: [
    [-30, PLAYER_EYE, -30], [ 30, PLAYER_EYE, -30],
    [-30, PLAYER_EYE,  30], [ 30, PLAYER_EYE,  30],
    [  0, PLAYER_EYE, -32], [  0, PLAYER_EYE,  32],
    [-32, PLAYER_EYE,   0], [ 32, PLAYER_EYE,   0],
  ],
};

export const MAPS: Record<string, MapDef> = { warehouse, office, arena };
export const MAP_LIST = [warehouse, office, arena];
export const PLAYER_EYE_HEIGHT = PLAYER_EYE;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;
