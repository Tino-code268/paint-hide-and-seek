import * as THREE from "three";
import wood from "@/assets/textures/wood_floor.jpg.asset.json";
import damask from "@/assets/textures/damask_wall.jpg.asset.json";
import cobble from "@/assets/textures/cobble_floor.jpg.asset.json";
import brick from "@/assets/textures/brick_wall.jpg.asset.json";
import arcadeFloor from "@/assets/textures/arcade_floor.jpg.asset.json";
import arcadeWall from "@/assets/textures/arcade_wall.jpg.asset.json";

export const TEX_URLS = {
  wood: wood.url,
  damask: damask.url,
  cobble: cobble.url,
  brick: brick.url,
  arcadeFloor: arcadeFloor.url,
  arcadeWall: arcadeWall.url,
} as const;

const cache = new Map<string, THREE.Texture>();

export function loadTiledTexture(url: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const key = `${url}|${repeatX}|${repeatY}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export type MapTextures = { floor: string; wall: string };

export const MAP_TEXTURES: Record<string, MapTextures> = {
  restaurant: { floor: TEX_URLS.wood, wall: TEX_URLS.damask },
  market: { floor: TEX_URLS.cobble, wall: TEX_URLS.brick },
  arcade: { floor: TEX_URLS.arcadeFloor, wall: TEX_URLS.arcadeWall },
};
