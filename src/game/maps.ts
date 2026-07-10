// Map definitions for Mecha Chameleon
// Big, detailed maps with lots of hiding spots and colorful surfaces to mimic.

export type Vec3 = [number, number, number];

export type WallBox = {
  pos: Vec3;
  size: Vec3;
  color?: string;
  noTex?: boolean;     // never apply the big-wall texture (rugs, posters, ceiling...)
  noCollide?: boolean; // visual only (rugs, posters, signs)
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

function outerWalls(w: number, d: number, h = 6, color = "#d8d0c4"): WallBox[] {
  const t = 0.8;
  return [
    { pos: [0, h / 2, -d / 2], size: [w, h, t], color },
    { pos: [0, h / 2,  d / 2], size: [w, h, t], color },
    { pos: [-w / 2, h / 2, 0], size: [t, h, d], color },
    { pos: [ w / 2, h / 2, 0], size: [t, h, d], color },
  ];
}

// A poster / painting stuck slightly in front of a wall — great to mimic!
function posterOnWall(
  walls: WallBox[],
  side: "N" | "S" | "E" | "W",
  half: number, // half of the room on that axis
  along: number, y: number, w: number, h: number, color: string,
) {
  const t = 0.06;
  const off = 0.5; // outer wall half-thickness + a bit
  if (side === "N") walls.push({ pos: [along, y, -half + off], size: [w, h, t], color, noTex: true, noCollide: true });
  if (side === "S") walls.push({ pos: [along, y,  half - off], size: [w, h, t], color, noTex: true, noCollide: true });
  if (side === "W") walls.push({ pos: [-half + off, y, along], size: [t, h, w], color, noTex: true, noCollide: true });
  if (side === "E") walls.push({ pos: [ half - off, y, along], size: [t, h, w], color, noTex: true, noCollide: true });
}

function rug(walls: WallBox[], x: number, z: number, w: number, d: number, color: string) {
  walls.push({ pos: [x, 0.03, z], size: [w, 0.06, d], color, noTex: true, noCollide: true });
}

// Simple statue: pedestal + body + head. A classic thing to imitate!
function statue(walls: WallBox[], props: Prop[], x: number, z: number, color = "#cfcfd6") {
  walls.push({ pos: [x, 0.35, z], size: [1.4, 0.7, 1.4], color: "#9a9aa2" });
  props.push({ kind: "cylinder", pos: [x, 1.35, z], radiusTop: 0.28, radiusBottom: 0.4, height: 1.3, color, collides: true });
  props.push({ kind: "sphere", pos: [x, 2.25, z], radius: 0.32, color, collides: true });
}

function plant(props: Prop[], x: number, z: number, big = false) {
  const h = big ? 2.6 : 1.6;
  props.push({ kind: "cylinder", pos: [x, 0.25, z], radiusTop: 0.35, radiusBottom: 0.45, height: 0.5, color: "#b06a3a", collides: true });
  props.push({ kind: "cylinder", pos: [x, 0.6 + h * 0.3, z], radiusTop: 0.09, radiusBottom: 0.12, height: h * 0.6, color: "#6a4a2a", collides: true });
  props.push({ kind: "sphere", pos: [x, 0.7 + h * 0.72, z], radius: big ? 1.0 : 0.6, color: "#3a8a3a" });
}

function tree(props: Prop[], x: number, z: number) {
  props.push({ kind: "cylinder", pos: [x, 1.4, z], radiusTop: 0.22, radiusBottom: 0.32, height: 2.8, color: "#6a4a2a", collides: true });
  props.push({ kind: "sphere", pos: [x, 3.6, z], radius: 1.7, color: "#3a9a4a" });
  props.push({ kind: "sphere", pos: [x + 0.9, 3.1, z + 0.4], radius: 1.1, color: "#44aa54" });
  props.push({ kind: "sphere", pos: [x - 0.8, 3.2, z - 0.5], radius: 1.0, color: "#329244" });
}

function cratePile(walls: WallBox[], x: number, z: number) {
  walls.push({ pos: [x, 0.6, z], size: [1.6, 1.2, 1.6], color: "#a06a3a" });
  walls.push({ pos: [x + 1.7, 0.6, z + 0.2], size: [1.4, 1.2, 1.4], color: "#8a5a30" });
  walls.push({ pos: [x + 0.7, 1.7, z], size: [1.3, 1.0, 1.3], color: "#b07a44" });
}

function bench(walls: WallBox[], x: number, z: number, rotX = false, color = "#7a4a24") {
  const seat: Vec3 = rotX ? [0.6, 0.5, 2.4] : [2.4, 0.5, 0.6];
  walls.push({ pos: [x, 0.45, z], size: seat, color });
}

// ---------- Restaurant (120 x 120) ----------
function makeRestaurant(): MapDef {
  const W = 120, D = 120, H = 8;
  const walls: WallBox[] = [
    ...outerWalls(W, D, H, "#efe5d2"),
    // ceiling (visual only)
    { pos: [0, H, 0], size: [W, 0.3, D], color: "#f4ecd8", noTex: true, noCollide: true },
  ];
  const props: Prop[] = [];

  // ===== Dining hall (center) — round tables in a grid =====
  const tableSpots: Vec3[] = [];
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -1; gz <= 2; gz++) {
      tableSpots.push([gx * 11, 0, gz * 10 - 4]);
    }
  }
  for (const [x, , z] of tableSpots) {
    props.push({ kind: "cylinder", pos: [x, 0.4, z], radiusTop: 0.2, radiusBottom: 0.3, height: 0.8, color: "#2a2018", collides: true });
    props.push({ kind: "cylinder", pos: [x, 0.85, z], radiusTop: 1.2, radiusBottom: 1.2, height: 0.1, color: "#c9963f", collides: true });
    walls.push({ pos: [x + 1.7, 0.5, z], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x - 1.7, 0.5, z], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x, 0.5, z + 1.7], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    walls.push({ pos: [x, 0.5, z - 1.7], size: [0.5, 1, 0.5], color: "#3a2a1a" });
    // pendant light
    props.push({ kind: "sphere", pos: [x, 5.6, z], radius: 0.35, color: "#fff2c4", emissive: true });
  }
  rug(walls, 0, 2, 42, 34, "#a33c34");
  rug(walls, 0, 2, 36, 28, "#c25a48");

  // ===== Long bar (west) =====
  walls.push({ pos: [-44, 0.6, 6], size: [2.0, 1.2, 34], color: "#7a4a24" });
  walls.push({ pos: [-44, 1.6, 6], size: [2.4, 0.2, 35], color: "#c9963f" });
  walls.push({ pos: [-50, 2.6, 6], size: [1.0, 5.2, 36], color: "#5a3a1a" }); // back shelf
  walls.push({ pos: [-49.15, 3.13, 6], size: [0.7, 0.1, 36], color: "#7a5a2a", noTex: true }); // bottle ledge
  // bottles on the ledge
  for (let i = 0; i < 12; i++) {
    const bz = -10 + i * 3;
    const colors = ["#3a8a4a", "#a03a3a", "#3a5aa0", "#c9963f", "#7a3aa0"];
    props.push({ kind: "cylinder", pos: [-49.15, 3.6, bz], radiusTop: 0.12, radiusBottom: 0.16, height: 0.8, color: colors[i % colors.length] });
  }
  // bar stools
  for (let i = 0; i < 9; i++) {
    props.push({ kind: "cylinder", pos: [-41, 0.6, -8 + i * 3.5], radiusTop: 0.35, radiusBottom: 0.35, height: 1.2, color: "#4a2a14", collides: true });
  }

  // ===== Kitchen (north-east) =====
  walls.push({ pos: [24, H / 2 - 1, -22], size: [40, H - 2, 0.6], color: "#e8d9b8" });
  walls.push({ pos: [44, H / 2 - 1, -36], size: [0.6, H - 2, 28], color: "#e8d9b8" });
  // door gap: kitchen wall stops leaving opening near x=6
  walls.push({ pos: [30, 1.0, -32], size: [3, 2, 2.2], color: "#bfc4cc" }); // stove
  walls.push({ pos: [34, 1.0, -32], size: [3, 2, 2.2], color: "#bfc4cc" });
  walls.push({ pos: [40, 1.5, -32], size: [2.4, 3.0, 2.4], color: "#e8ecf2" }); // fridge
  walls.push({ pos: [40, 1.5, -42], size: [2.4, 3.0, 2.4], color: "#e8ecf2" });
  walls.push({ pos: [28, 0.9, -42], size: [8, 1.8, 2.4], color: "#4a4a52" });  // prep counter
  walls.push({ pos: [16, 0.9, -34], size: [2.4, 1.8, 10], color: "#4a4a52" });
  // hanging pots
  for (let i = 0; i < 4; i++) {
    props.push({ kind: "sphere", pos: [26 + i * 4, 3.4, -38], radius: 0.3, color: "#8a8a92" });
  }

  // ===== Stage (south-east) =====
  walls.push({ pos: [38, 0.5, 42], size: [26, 1.0, 20], color: "#7a2a2a" }); // stage floor
  walls.push({ pos: [38, 3.4, 51], size: [26, 5.0, 0.8], color: "#5a1a1a" }); // backdrop
  // curtains
  walls.push({ pos: [26.5, 3.2, 46], size: [1.2, 5.4, 10], color: "#a03030", noTex: true });
  walls.push({ pos: [49.5, 3.2, 46], size: [1.2, 5.4, 10], color: "#a03030", noTex: true });
  // piano-ish block + mic
  walls.push({ pos: [42, 1.8, 44], size: [4.5, 1.6, 2.2], color: "#141414" });
  props.push({ kind: "cylinder", pos: [34, 1.7, 40], radiusTop: 0.05, radiusBottom: 0.05, height: 1.4, color: "#333333", collides: true });
  props.push({ kind: "sphere", pos: [34, 2.5, 40], radius: 0.14, color: "#222222" });
  // stage spotlights
  props.push({ kind: "sphere", pos: [32, 6.4, 42], radius: 0.4, color: "#ffd24a", emissive: true });
  props.push({ kind: "sphere", pos: [44, 6.4, 42], radius: 0.4, color: "#4ad2ff", emissive: true });

  // ===== Storage room (north-west) =====
  walls.push({ pos: [-26, H / 2 - 1, -26], size: [0.6, H - 2, 28], color: "#e8d9b8" });
  walls.push({ pos: [-38, H / 2 - 1, -12], size: [24, H - 2, 0.6], color: "#e8d9b8" });
  cratePile(walls, -44, -30);
  cratePile(walls, -36, -44);
  cratePile(walls, -50, -46);
  walls.push({ pos: [-30, 1.2, -50], size: [6, 2.4, 1.2], color: "#8a6a4a" }); // shelf
  walls.push({ pos: [-30, 2.7, -50], size: [6, 0.2, 1.4], color: "#a58a5a" });
  // sacks
  props.push({ kind: "sphere", pos: [-46, 0.5, -38], radius: 0.55, color: "#c9a878", collides: true });
  props.push({ kind: "sphere", pos: [-44.6, 0.5, -37], radius: 0.5, color: "#b89868", collides: true });

  // ===== Entry vestibule (south) =====
  walls.push({ pos: [0, 2, 52], size: [14, 4, 0.5], color: "#efe5d2" });
  walls.push({ pos: [-8, 2, 55], size: [0.5, 4, 6], color: "#efe5d2" });
  walls.push({ pos: [8, 2, 55], size: [0.5, 4, 6], color: "#efe5d2" });
  rug(walls, 0, 55, 12, 7, "#3a5a8a");

  // ===== Restroom corridor (west-south) =====
  walls.push({ pos: [-36, H / 2 - 1, 34], size: [0.6, H - 2, 24], color: "#e8d9b8" });
  walls.push({ pos: [-46, H / 2 - 1, 24], size: [20, H - 2, 0.6], color: "#e8d9b8" });
  walls.push({ pos: [-52, 1.4, 40], size: [3, 2.8, 0.4], color: "#4a90d2", noTex: true }); // blue door
  walls.push({ pos: [-44, 1.4, 40], size: [3, 2.8, 0.4], color: "#d24a90", noTex: true }); // pink door

  // ===== Planters and greenery =====
  plant(props, -14, -20, true);
  plant(props, 14, -20, true);
  plant(props, -20, 30);
  plant(props, 20, 30);
  plant(props, -30, 46);
  plant(props, 52, -8, true);
  plant(props, 52, 12);

  // ===== Statues =====
  statue(walls, props, -6, 38, "#d8d8e0");
  statue(walls, props, 6, 38, "#c8b89a");

  // ===== Wall art / posters (color spots for camouflage!) =====
  posterOnWall(walls, "W", W / 2, -2, 3.6, 4, 3, "#e8564a");
  posterOnWall(walls, "W", W / 2, 26, 3.6, 4, 3, "#f4c14a");
  posterOnWall(walls, "W", W / 2, 44, 3.6, 4, 3, "#3aa08a");
  posterOnWall(walls, "N", D / 2, -8, 3.6, 5, 3.2, "#4a6ad2");
  posterOnWall(walls, "N", D / 2, 0, 3.6, 5, 3.2, "#d24a6a");
  posterOnWall(walls, "E", W / 2, 8, 3.6, 6, 3.6, "#8a4ad2");
  posterOnWall(walls, "S", D / 2, 24, 3.6, 5, 3, "#3ac86a");
  posterOnWall(walls, "S", D / 2, -24, 3.6, 5, 3, "#f48a3a");

  return {
    name: "restaurant",
    displayName: "레스토랑",
    floorSize: [W, D],
    floorColor: "#c9a878",
    wallColor: "#efe5d2",
    ambientColor: "#fff2d6",
    skyColor: "#ffe4b0",
    groundColor: "#8b6a3a",
    fogNear: 70, fogFar: 220,
    walls, props,
    spawnPoints: [
      [-52, PLAYER_EYE, -52], [ 52, PLAYER_EYE, -52],
      [-52, PLAYER_EYE,  52], [ 52, PLAYER_EYE,  30],
      [  0, PLAYER_EYE, -46], [  0, PLAYER_EYE,  46],
      [-52, PLAYER_EYE,   0], [ 52, PLAYER_EYE,   0],
      [-20, PLAYER_EYE, -46], [ 20, PLAYER_EYE,  46],
    ],
  };
}

// ---------- Market (150 x 150, outdoor) ----------
function makeMarket(): MapDef {
  const W = 150, D = 150;
  const walls: WallBox[] = [
    ...outerWalls(W, D, 5, "#b8a888"),
  ];
  const props: Prop[] = [];

  // ===== Market stalls in three rows =====
  const stallColors = ["#e85c4a", "#f4a83a", "#3aa87a", "#3a7ae8", "#a04ae8", "#e83a8a", "#3ac8d2"];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 7; i++) {
      const x = -48 + i * 16;
      const z = row === 0 ? -36 : row === 1 ? 0 : 36;
      if (row === 1 && (i === 3)) continue; // keep plaza center open
      walls.push({ pos: [x, 0.6, z], size: [5, 1.2, 2.4], color: "#8a6a4a" });
      walls.push({ pos: [x - 2.5, 1.8, z - 1.2], size: [0.25, 3.6, 0.25], color: "#5a3a1a" });
      walls.push({ pos: [x + 2.5, 1.8, z - 1.2], size: [0.25, 3.6, 0.25], color: "#5a3a1a" });
      walls.push({ pos: [x - 2.5, 1.8, z + 1.2], size: [0.25, 3.6, 0.25], color: "#5a3a1a" });
      walls.push({ pos: [x + 2.5, 1.8, z + 1.2], size: [0.25, 3.6, 0.25], color: "#5a3a1a" });
      const c = stallColors[(i + row * 2) % stallColors.length];
      walls.push({ pos: [x, 3.7, z], size: [5.8, 0.18, 3.2], color: c, noTex: true }); // canopy
      walls.push({ pos: [x, 3.3, z - 1.7], size: [5.8, 0.7, 0.1], color: c, noTex: true, noCollide: true }); // canopy skirt
      // goods
      props.push({ kind: "sphere", pos: [x - 1.4, 1.5, z], radius: 0.28, color: "#e83a3a" });
      props.push({ kind: "sphere", pos: [x - 0.5, 1.5, z + 0.3], radius: 0.26, color: "#f4a83a" });
      props.push({ kind: "sphere", pos: [x + 0.5, 1.5, z - 0.2], radius: 0.28, color: "#3ae85c" });
      props.push({ kind: "sphere", pos: [x + 1.4, 1.5, z + 0.2], radius: 0.24, color: "#f4ec3a" });
    }
  }

  // ===== Central fountain plaza =====
  props.push({ kind: "cylinder", pos: [0, 0.5, 0], radiusTop: 5, radiusBottom: 5.4, height: 1.0, color: "#8a8a92", collides: true });
  props.push({ kind: "cylinder", pos: [0, 1.15, 0], radiusTop: 4.5, radiusBottom: 4.5, height: 0.3, color: "#4a9ad8", collides: true });
  props.push({ kind: "cylinder", pos: [0, 2.2, 0], radiusTop: 0.5, radiusBottom: 0.8, height: 2.4, color: "#a8a8b0", collides: true });
  props.push({ kind: "cylinder", pos: [0, 3.5, 0], radiusTop: 1.6, radiusBottom: 1.6, height: 0.25, color: "#9a9aa2", collides: true });
  props.push({ kind: "sphere", pos: [0, 4.2, 0], radius: 0.5, color: "#6ac2f0" });
  // plaza tiles
  rug(walls, 0, 0, 26, 26, "#c8b090");
  rug(walls, 0, 0, 20, 20, "#b89878");
  // plaza statues
  statue(walls, props, -10, -10, "#d0d0d8");
  statue(walls, props, 10, 10, "#d0c0a0");

  // ===== Trees along the edges =====
  for (const [tx, tz] of [
    [-62, -62], [-40, -64], [40, -64], [62, -62],
    [-62, 62], [-40, 64], [40, 64], [62, 62],
    [-64, -20], [-64, 20], [64, -20], [64, 20],
  ] as [number, number][]) {
    tree(props, tx, tz);
  }

  // ===== Crates, carts, benches =====
  cratePile(walls, -58, -44); cratePile(walls, 56, -46);
  cratePile(walls, -56, 44);  cratePile(walls, 58, 42);
  cratePile(walls, -20, -18); cratePile(walls, 20, 16);
  cratePile(walls, -20, 18);  cratePile(walls, 22, -18);
  // wooden carts
  for (const [cx, cz] of [[-34, -18], [34, 18], [0, -52], [0, 52]] as [number, number][]) {
    walls.push({ pos: [cx, 1.0, cz], size: [4.2, 1.0, 2.2], color: "#9a6a3a" });
    walls.push({ pos: [cx - 1.6, 1.9, cz], size: [0.5, 0.8, 2.2], color: "#9a6a3a" });
    walls.push({ pos: [cx + 1.6, 1.9, cz], size: [0.5, 0.8, 2.2], color: "#9a6a3a" });
    props.push({ kind: "cylinder", pos: [cx - 1.2, 0.5, cz + 1.15], radiusTop: 0.5, radiusBottom: 0.5, height: 0.2, color: "#4a3018" });
    props.push({ kind: "cylinder", pos: [cx + 1.2, 0.5, cz + 1.15], radiusTop: 0.5, radiusBottom: 0.5, height: 0.2, color: "#4a3018" });
    // produce on the cart
    props.push({ kind: "sphere", pos: [cx - 0.8, 1.8, cz], radius: 0.32, color: "#f46a2a" });
    props.push({ kind: "sphere", pos: [cx + 0.2, 1.8, cz + 0.3], radius: 0.3, color: "#e8d23a" });
    props.push({ kind: "sphere", pos: [cx + 0.9, 1.8, cz - 0.2], radius: 0.28, color: "#c23a3a" });
  }
  bench(walls, -8, -14, false); bench(walls, 8, 14, false);
  bench(walls, -14, 8, true);   bench(walls, 14, -8, true);

  // ===== Street lamps =====
  for (const x of [-40, 0, 40]) {
    for (const z of [-56, 56]) {
      props.push({ kind: "cylinder", pos: [x, 2.2, z], radiusTop: 0.12, radiusBottom: 0.14, height: 4.4, color: "#3a3a3a", collides: true });
      props.push({ kind: "sphere", pos: [x, 4.6, z], radius: 0.4, color: "#fff2c4", emissive: true });
    }
  }
  for (const z of [-30, 30]) {
    for (const x of [-60, 60]) {
      props.push({ kind: "cylinder", pos: [x, 2.2, z], radiusTop: 0.12, radiusBottom: 0.14, height: 4.4, color: "#3a3a3a", collides: true });
      props.push({ kind: "sphere", pos: [x, 4.6, z], radius: 0.4, color: "#fff2c4", emissive: true });
    }
  }

  // ===== Posters on the boundary walls =====
  posterOnWall(walls, "N", D / 2, -30, 2.6, 5, 2.6, "#e8564a");
  posterOnWall(walls, "N", D / 2, 30, 2.6, 5, 2.6, "#3a7ae8");
  posterOnWall(walls, "S", D / 2, 0, 2.6, 6, 2.6, "#f4c14a");
  posterOnWall(walls, "W", W / 2, 0, 2.6, 5, 2.6, "#3aa87a");
  posterOnWall(walls, "E", W / 2, -20, 2.6, 5, 2.6, "#a04ae8");

  return {
    name: "market",
    displayName: "야외 시장",
    floorSize: [W, D],
    floorColor: "#d8caa8",
    wallColor: "#b8a888",
    ambientColor: "#ffffff",
    skyColor: "#a8d8f8",
    groundColor: "#c0a878",
    fogNear: 90, fogFar: 280,
    walls, props,
    spawnPoints: [
      [-68, PLAYER_EYE, -68], [ 68, PLAYER_EYE, -68],
      [-68, PLAYER_EYE,  68], [ 68, PLAYER_EYE,  68],
      [  0, PLAYER_EYE, -68], [  0, PLAYER_EYE,  68],
      [-68, PLAYER_EYE,   0], [ 68, PLAYER_EYE,   0],
      [-30, PLAYER_EYE, -60], [ 30, PLAYER_EYE,  60],
    ],
  };
}

// ---------- Arcade (110 x 110, neon night) ----------
function makeArcade(): MapDef {
  const W = 110, D = 110, H = 7;
  const walls: WallBox[] = [
    ...outerWalls(W, D, H, "#2a1a3a"),
    { pos: [0, H, 0], size: [W, 0.3, D], color: "#170d26", noTex: true, noCollide: true }, // ceiling
  ];
  const props: Prop[] = [];
  const neon = ["#ff3aa0", "#3affe0", "#f4ff3a", "#a83aff", "#3aff8a", "#ff8a3a"];

  // ===== Arcade cabinet rows =====
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 10; i++) {
      const x = -36 + i * 8;
      const z = -34 + row * 15;
      if (row >= 1 && row <= 2 && i >= 4 && i <= 5) continue; // dance floor gap
      walls.push({ pos: [x, 1.2, z], size: [1.8, 2.4, 1.4], color: "#1a1030" });
      walls.push({ pos: [x, 1.8, z - 0.75], size: [1.3, 1.0, 0.06], color: neon[(i + row) % neon.length], noTex: true, noCollide: true });
      walls.push({ pos: [x, 2.65, z], size: [1.8, 0.35, 1.4], color: neon[(i + row * 2) % neon.length], noTex: true });
    }
  }

  // ===== Dance floor (center) — glowing tiles =====
  for (let tx = 0; tx < 6; tx++) {
    for (let tz = 0; tz < 6; tz++) {
      const c = neon[(tx + tz) % neon.length];
      walls.push({ pos: [-7.5 + tx * 3, 0.04, -14.5 + tz * 3], size: [2.8, 0.08, 2.8], color: c, noTex: true, noCollide: true });
    }
  }
  // DJ booth
  walls.push({ pos: [0, 1.0, -22], size: [6, 2.0, 2], color: "#12081f" });
  walls.push({ pos: [0, 2.4, -22], size: [6.4, 0.3, 2.4], color: "#3affe0", noTex: true });

  // ===== Ticket / prize counter (south) =====
  walls.push({ pos: [0, 0.6, 42], size: [16, 1.2, 1.6], color: "#a03a5a" });
  walls.push({ pos: [0, 2.8, 46], size: [16, 5, 0.5], color: "#3a1a2a" });
  walls.push({ pos: [0, 4.6, 45.6], size: [10, 0.7, 0.2], color: "#3affe0", noTex: true, noCollide: true }); // neon sign
  // prize shelves with plushies
  for (let i = 0; i < 8; i++) {
    props.push({ kind: "sphere", pos: [-6 + i * 1.7, 2.2, 45.4], radius: 0.35, color: neon[i % neon.length] });
    props.push({ kind: "sphere", pos: [-6 + i * 1.7, 3.3, 45.4], radius: 0.3, color: neon[(i + 3) % neon.length] });
  }

  // ===== Claw machines =====
  for (const x of [-40, -30, 30, 40]) {
    walls.push({ pos: [x, 1.5, 34], size: [2.2, 3.0, 2.2], color: "#2a1030" });
    walls.push({ pos: [x, 3.15, 34], size: [2.4, 0.3, 2.4], color: "#ff3aa0", noTex: true });
    props.push({ kind: "sphere", pos: [x - 0.4, 0.9, 34], radius: 0.3, color: neon[(x + 40) % neon.length >= 0 ? Math.abs(x) % 6 : 0] });
    props.push({ kind: "sphere", pos: [x + 0.4, 0.9, 34.3], radius: 0.26, color: "#3aff8a" });
  }

  // ===== Vending machines & snack bar (west) =====
  for (let i = 0; i < 4; i++) {
    walls.push({ pos: [-50, 1.5, -20 + i * 10], size: [1.8, 3.0, 2.6], color: i % 2 ? "#c23a3a" : "#3a6ac2" });
    walls.push({ pos: [-49.2, 1.9, -20 + i * 10], size: [0.1, 1.4, 1.8], color: "#d8e8f8", noTex: true, noCollide: true });
  }
  walls.push({ pos: [-44, 0.6, 20], size: [2.0, 1.2, 14], color: "#5a2a7a" }); // snack counter
  walls.push({ pos: [-44, 1.5, 20], size: [2.4, 0.15, 14.5], color: "#f4ff3a", noTex: true });
  for (let i = 0; i < 4; i++) {
    props.push({ kind: "cylinder", pos: [-40.5, 0.6, 15 + i * 3.4], radiusTop: 0.35, radiusBottom: 0.35, height: 1.2, color: "#2a1a3a", collides: true });
  }

  // ===== Pool tables (east) =====
  for (const z of [-16, 0, 16]) {
    walls.push({ pos: [42, 0.9, z], size: [4.6, 0.5, 2.6], color: "#2a7a3a" });
    walls.push({ pos: [42, 0.55, z], size: [4.9, 0.9, 2.9], color: "#4a2a14" });
    props.push({ kind: "sphere", pos: [41.3, 1.25, z + 0.3], radius: 0.12, color: "#f4ec3a" });
    props.push({ kind: "sphere", pos: [42.5, 1.25, z - 0.4], radius: 0.12, color: "#e83a3a" });
    props.push({ kind: "sphere", pos: [43, 1.25, z + 0.5], radius: 0.12, color: "#ffffff" });
  }

  // ===== Pillars, disco balls, neon wall strips =====
  for (const [px, pz] of [[-20, -8], [20, -8], [-20, 12], [20, 12]] as [number, number][]) {
    props.push({ kind: "cylinder", pos: [px, H / 2, pz], radiusTop: 0.6, radiusBottom: 0.6, height: H, color: "#3a2a4a", collides: true });
    walls.push({ pos: [px, 3.2, pz], size: [1.5, 0.3, 1.5], color: neon[(px + pz + 40) % 6 < 0 ? 0 : (px + pz + 40) % 6], noTex: true, noCollide: true });
  }
  for (const x of [-25, 0, 25]) {
    props.push({ kind: "sphere", pos: [x, 6.0, 0], radius: 0.55, color: "#f0f0ff", emissive: true });
  }
  posterOnWall(walls, "N", D / 2, -20, 3.4, 8, 2.4, "#ff3aa0");
  posterOnWall(walls, "N", D / 2, 20, 3.4, 8, 2.4, "#3affe0");
  posterOnWall(walls, "W", W / 2, -34, 3.4, 6, 2.4, "#f4ff3a");
  posterOnWall(walls, "E", W / 2, -34, 3.4, 6, 2.4, "#a83aff");
  posterOnWall(walls, "S", D / 2, -30, 3.4, 7, 2.4, "#3aff8a");

  return {
    name: "arcade",
    displayName: "오락실",
    floorSize: [W, D],
    floorColor: "#1a0f2a",
    wallColor: "#2a1a3a",
    ambientColor: "#f0d0ff",
    skyColor: "#3a1a5a",
    groundColor: "#1a0a2a",
    fogNear: 60, fogFar: 200,
    walls, props,
    spawnPoints: [
      [-48, PLAYER_EYE, -48], [ 48, PLAYER_EYE, -48],
      [-48, PLAYER_EYE,  48], [ 48, PLAYER_EYE,  48],
      [  0, PLAYER_EYE, -48], [  0, PLAYER_EYE,  48],
      [-48, PLAYER_EYE,   0], [ 48, PLAYER_EYE,   0],
      [-24, PLAYER_EYE, -48], [ 24, PLAYER_EYE,  48],
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
