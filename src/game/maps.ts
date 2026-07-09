// Map definitions for Mecha Chameleon
// Bright themed maps with primitive-based scenery.

export type Vec3 = [number, number, number];

export type WallBox = {
  pos: Vec3;
  size: Vec3;
  color?: string;
};

export type PropCylinder = {
  kind: "cylinder";
  pos: Vec3;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  color: string;
  collides?: boolean;
};

export type PropSphere = {
  kind: "sphere";
  pos: Vec3;
  radius: number;
  color: string;
  collides?: boolean;
};

export type Prop = PropCylinder | PropSphere;

export type MapDef = {
  name: string;
  displayName: string;
  floorSize: [number, number];
  floorColor: string;
  wallColor: string;
  ambientColor: string;
  skyColor: string;
  groundColor: string;
  fogNear: number;
  fogFar: number;
  walls: WallBox[];   // AABB colliders + boxes
  props: Prop[];      // decorative + optional colliders
  spawnPoints: Vec3[];
};

const PLAYER_EYE = 1.6;

function outerWalls(w: number, d: number, h = 5, color = "#d8d0c4"): WallBox[] {
  const t = 0.8;
  return [
    { pos: [0, h / 2, -d / 2], size: [w, h, t], color },
    { pos: [0, h / 2,  d / 2], size: [w, h, t], color },
    { pos: [-w / 2, h / 2, 0], size: [t, h, d], color },
    { pos: [ w / 2, h / 2, 0], size: [t, h, d], color },
  ];
}

// ---------- Restaurant ----------
function makeRestaurant(): MapDef {
  const W = 80, D = 80;
  const walls: WallBox[] = [
    ...outerWalls(W, D, 6, "#efe5d2"),
    // interior partitions: kitchen wall
    { pos: [ 20, 3, -8], size: [24, 6, 0.5], color: "#e8d9b8" },
    { pos: [ 32, 3,  0], size: [0.5, 6, 16], color: "#e8d9b8" },
    // bar counter (long)
    { pos: [-24, 0.6,  10], size: [22, 1.2, 1.4], color: "#7a4a24" },
    { pos: [-24, 1.6,  10], size: [22, 0.2, 1.6], color: "#c9963f" },
    // bar back shelves
    { pos: [-24, 2.4, 15], size: [22, 3.6, 0.6], color: "#5a3a1a" },
    // kitchen equipment (stoves / fridges as boxes)
    { pos: [ 24, 1.0, -14], size: [3, 2, 2], color: "#bfc4cc" },
    { pos: [ 28, 1.0, -14], size: [3, 2, 2], color: "#bfc4cc" },
    { pos: [ 32, 1.4, -14], size: [2, 2.8, 2.5], color: "#e8ecf2" },
    { pos: [ 24, 0.9,  -4], size: [4, 1.8, 2], color: "#4a4a52" },
    // entry vestibule
    { pos: [ 0, 1.5, -35], size: [10, 3, 0.4], color: "#efe5d2" },
    { pos: [-6, 1.5, -33], size: [0.4, 3, 4], color: "#efe5d2" },
    { pos: [ 6, 1.5, -33], size: [0.4, 3, 4], color: "#efe5d2" },
    // planters / low walls
    { pos: [-10, 0.4, -20], size: [8, 0.8, 1], color: "#3a5a2a" },
    { pos: [ 10, 0.4, -20], size: [8, 0.8, 1], color: "#3a5a2a" },
    { pos: [-10, 0.4,  22], size: [8, 0.8, 1], color: "#3a5a2a" },
    // wall art blocks
    { pos: [-W/2 + 0.6, 3.5,  0], size: [0.2, 2.4, 3], color: "#e8564a" },
    { pos: [-W/2 + 0.6, 3.5,  6], size: [0.2, 2.4, 3], color: "#f4c14a" },
    { pos: [-W/2 + 0.6, 3.5, -6], size: [0.2, 2.4, 3], color: "#3aa08a" },
  ];

  // dining tables + chairs (round tables → cylinders, chairs → small boxes)
  const props: Prop[] = [];
  const tableSpots: Vec3[] = [
    [-14, 0, -8], [ -6, 0, -8], [  2, 0, -8],
    [-14, 0,  0], [ -6, 0,  0], [  2, 0,  0],
    [-14, 0,  6], [ -6, 0,  6], [  2, 0,  6],
    [ 12, 0, 16], [ 20, 0, 16], [ 28, 0, 16],
  ];
  for (const [x, , z] of tableSpots) {
    // pedestal
    props.push({ kind: "cylinder", pos: [x, 0.4, z], radiusTop: 0.2, radiusBottom: 0.3, height: 0.8, color: "#2a2018", collides: true });
    // tabletop
    props.push({ kind: "cylinder", pos: [x, 0.85, z], radiusTop: 1.1, radiusBottom: 1.1, height: 0.1, color: "#c9963f", collides: true });
    // chairs around table
    walls.push({ pos: [x + 1.6, 0.5, z], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x - 1.6, 0.5, z], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x, 0.5, z + 1.6], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x, 0.5, z - 1.6], size: [0.5, 1, 0.5], color: "#3a2a1a" });
  }
  // pendant lights (spheres)
  for (const [x, , z] of tableSpots) {
    props.push({ kind: "sphere", pos: [x, 4.2, z], radius: 0.35, color: "#fff2c4" });
  }
  // bar stools
  for (let i = -3; i <= 3; i++) {
    props.push({ kind: "cylinder", pos: [-24 + i * 3, 0.6, 8], radiusTop: 0.35, radiusBottom: 0.35, height: 1.2, color: "#4a2a14", collides: true });
  }

  return {
    name: "restaurant",
    displayName: "레스토랑",
    floorSize: [W, D],
    floorColor: "#c9a878",
    wallColor: "#efe5d2",
    ambientColor: "#fff2d6",
    skyColor: "#ffe4b0",
    groundColor: "#8b6a3a",
    fogNear: 40, fogFar: 140,
    walls, props,
    spawnPoints: [
      [-30, PLAYER_EYE, -30], [ 30, PLAYER_EYE, -30],
      [-30, PLAYER_EYE,  30], [ 30, PLAYER_EYE,  30],
      [  0, PLAYER_EYE, -25], [  0, PLAYER_EYE,  25],
      [-32, PLAYER_EYE,   0], [ 32, PLAYER_EYE,   0],
    ],
  };
}

// ---------- Market ----------
function makeMarket(): MapDef {
  const W = 100, D = 100;
  const walls: WallBox[] = [
    ...outerWalls(W, D, 4, "#b8a888"),
  ];
  const props: Prop[] = [];

  // Market stalls in two rows
  const stallColors = ["#e85c4a", "#f4a83a", "#3aa87a", "#3a7ae8", "#a04ae8", "#e83a8a"];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 12;
      const z = row === 0 ? -20 : 20;
      // stall counter
      walls.push({ pos: [x, 0.6, z], size: [4, 1.2, 2], color: "#8a6a4a" });
      // 4 corner posts
      walls.push({ pos: [x - 2, 1.6, z - 1], size: [0.2, 3.2, 0.2], color: "#5a3a1a" });
      walls.push({ pos: [x + 2, 1.6, z - 1], size: [0.2, 3.2, 0.2], color: "#5a3a1a" });
      walls.push({ pos: [x - 2, 1.6, z + 1], size: [0.2, 3.2, 0.2], color: "#5a3a1a" });
      walls.push({ pos: [x + 2, 1.6, z + 1], size: [0.2, 3.2, 0.2], color: "#5a3a1a" });
      // canopy
      walls.push({ pos: [x, 3.3, z], size: [4.6, 0.15, 2.6], color: stallColors[i % stallColors.length] });
      // fruit boxes
      props.push({ kind: "sphere", pos: [x - 1, 1.5, z], radius: 0.25, color: "#e83a3a" });
      props.push({ kind: "sphere", pos: [x, 1.5, z], radius: 0.25, color: "#f4a83a" });
      props.push({ kind: "sphere", pos: [x + 1, 1.5, z], radius: 0.25, color: "#3ae85c" });
    }
  }

  // Central fountain
  props.push({ kind: "cylinder", pos: [0, 0.4, 0], radiusTop: 4, radiusBottom: 4, height: 0.8, color: "#8a8a92", collides: true });
  props.push({ kind: "cylinder", pos: [0, 1.0, 0], radiusTop: 3.6, radiusBottom: 3.6, height: 0.3, color: "#4a7ac8", collides: true });
  props.push({ kind: "cylinder", pos: [0, 2.5, 0], radiusTop: 0.4, radiusBottom: 0.6, height: 3, color: "#a8a8b0", collides: true });

  // Scattered crates
  const crates: Vec3[] = [
    [-40, 0.6, -40], [-38, 0.6, -38], [ 40, 0.6, -38], [ 38, 0.6, 40], [-40, 0.6, 40],
    [-12, 0.6, -4], [ 12, 0.6, -4], [-12, 0.6, 4], [ 12, 0.6, 4],
  ];
  for (const c of crates) {
    walls.push({ pos: c, size: [1.6, 1.2, 1.6], color: "#a06a3a" });
  }

  // Street lamps
  for (const x of [-25, 0, 25]) {
    for (const z of [-40, 40]) {
      props.push({ kind: "cylinder", pos: [x, 2, z], radiusTop: 0.12, radiusBottom: 0.12, height: 4, color: "#3a3a3a", collides: true });
      props.push({ kind: "sphere", pos: [x, 4.2, z], radius: 0.35, color: "#fff2c4" });
    }
  }

  return {
    name: "market",
    displayName: "야외 시장",
    floorSize: [W, D],
    floorColor: "#d8caa8",
    wallColor: "#b8a888",
    ambientColor: "#ffffff",
    skyColor: "#a8d8f8",
    groundColor: "#c0a878",
    fogNear: 60, fogFar: 180,
    walls, props,
    spawnPoints: [
      [-45, PLAYER_EYE, -45], [ 45, PLAYER_EYE, -45],
      [-45, PLAYER_EYE,  45], [ 45, PLAYER_EYE,  45],
      [  0, PLAYER_EYE, -45], [  0, PLAYER_EYE,  45],
      [-45, PLAYER_EYE,   0], [ 45, PLAYER_EYE,   0],
    ],
  };
}

// ---------- Arcade ----------
function makeArcade(): MapDef {
  const W = 70, D = 70;
  const walls: WallBox[] = [
    ...outerWalls(W, D, 5, "#2a1a3a"),
  ];
  const props: Prop[] = [];

  // Two rows of arcade cabinets
  const neon = ["#ff3aa0", "#3affe0", "#f4ff3a", "#a83aff", "#3aff8a", "#ff8a3a"];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 8; i++) {
      const x = -21 + i * 6;
      const z = -20 + row * 14;
      // cabinet body
      walls.push({ pos: [x, 1.2, z], size: [1.6, 2.4, 1.2], color: "#1a1030" });
      // neon screen
      walls.push({ pos: [x, 1.8, z - 0.65], size: [1.2, 0.9, 0.05], color: neon[(i + row) % neon.length] });
      // marquee top
      walls.push({ pos: [x, 2.6, z], size: [1.6, 0.3, 1.2], color: neon[(i + row * 2) % neon.length] });
    }
  }

  // Ticket counter
  walls.push({ pos: [0, 0.6, 30], size: [12, 1.2, 1.4], color: "#a03a5a" });
  walls.push({ pos: [0, 2.2, 32], size: [12, 3, 0.4], color: "#3a1a2a" });
  walls.push({ pos: [0, 3.4, 32], size: [8, 0.6, 0.2], color: "#3affe0" });

  // Claw machines
  for (const x of [-25, -15, 15, 25]) {
    walls.push({ pos: [x, 1.4, 22], size: [2, 2.8, 2], color: "#2a1030" });
    walls.push({ pos: [x, 2.9, 22], size: [2.2, 0.3, 2.2], color: "#ff3aa0" });
  }

  // Pillars (support)
  for (const [px, pz] of [[-15, -8], [15, -8], [-15, 8], [15, 8]]) {
    props.push({ kind: "cylinder", pos: [px, 2.5, pz], radiusTop: 0.5, radiusBottom: 0.5, height: 5, color: "#3a2a4a", collides: true });
  }

  // Disco balls / lights
  for (const x of [-20, 0, 20]) {
    props.push({ kind: "sphere", pos: [x, 4.4, 0], radius: 0.5, color: "#f0f0ff" });
  }

  return {
    name: "arcade",
    displayName: "오락실",
    floorSize: [W, D],
    floorColor: "#1a0f2a",
    wallColor: "#2a1a3a",
    ambientColor: "#f0d0ff",
    skyColor: "#3a1a5a",
    groundColor: "#1a0a2a",
    fogNear: 40, fogFar: 120,
    walls, props,
    spawnPoints: [
      [-30, PLAYER_EYE, -30], [ 30, PLAYER_EYE, -30],
      [-30, PLAYER_EYE,  30], [ 30, PLAYER_EYE,  30],
      [  0, PLAYER_EYE, -32], [  0, PLAYER_EYE,  32],
      [-32, PLAYER_EYE,   0], [ 32, PLAYER_EYE,   0],
    ],
  };
}

const restaurant = makeRestaurant();
const market = makeMarket();
const arcade = makeArcade();

export const MAPS: Record<string, MapDef> = { restaurant, market, arcade };
export const MAP_LIST = [restaurant, market, arcade];

// Legacy names still might be in DB — alias to restaurant
MAPS["warehouse"] = restaurant;
MAPS["office"] = market;
MAPS["arena"] = arcade;

export const PLAYER_EYE_HEIGHT = PLAYER_EYE;
export const PLAYER_CROUCH_HEIGHT = 1.0;
export const PLAYER_RADIUS = 0.4;
