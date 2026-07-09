import * as THREE from "three";
import type { BodyPart, PaintStroke } from "./usePresence";

export const BODY_PARTS: BodyPart[] = ["head", "torso", "armL", "armR", "legL", "legR"];

export const PART_LABEL: Record<BodyPart, string> = {
  head: "머리",
  torso: "몸통",
  armL: "왼팔",
  armR: "오른팔",
  legL: "왼다리",
  legR: "오른다리",
};

export const CANVAS_SIZE = 256;

export type PaintCanvases = Record<BodyPart, HTMLCanvasElement>;
export type PaintTextures = Record<BodyPart, THREE.CanvasTexture>;

export function createPaintCanvases(): { canvases: PaintCanvases; textures: PaintTextures } {
  const canvases = {} as PaintCanvases;
  const textures = {} as PaintTextures;
  for (const p of BODY_PARTS) {
    const c = document.createElement("canvas");
    c.width = CANVAS_SIZE;
    c.height = CANVAS_SIZE;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    canvases[p] = c;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    textures[p] = tex;
  }
  return { canvases, textures };
}

export function applyStroke(canvases: PaintCanvases, textures: PaintTextures, s: PaintStroke) {
  const c = canvases[s.part];
  if (!c) return;
  const ctx = c.getContext("2d")!;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  if (s.from) {
    ctx.beginPath();
    ctx.moveTo(s.from.x, s.from.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  textures[s.part].needsUpdate = true;
}

export function resetCanvases(canvases: PaintCanvases, textures: PaintTextures) {
  for (const p of BODY_PARTS) {
    const ctx = canvases[p].getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    textures[p].needsUpdate = true;
  }
}
