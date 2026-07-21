// Procedural texture factory — every surface in the game is painted here in code.
// No external downloads needed: wallpaper, wood, tiles, bricks, posters, windows...

import * as THREE from "three";

type Painter = (ctx: CanvasRenderingContext2D, s: number) => void;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function speckle(ctx: CanvasRenderingContext2D, s: number, count: number, colors: string[], size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.25 + Math.random() * 0.3;
    ctx.fillRect(Math.random() * s, Math.random() * s, size, size);
  }
  ctx.globalAlpha = 1;
}

function frame(ctx: CanvasRenderingContext2D, s: number, color = "#3a2a1a", w = 14) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.strokeRect(w / 2, w / 2, s - w, s - w);
}

function mcNoise(ctx: CanvasRenderingContext2D, s: number, base: string, variance: number) {
  const n = 16, c = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = shade(base, -variance + Math.floor(Math.random() * variance * 2));
    ctx.fillRect(i * c, j * c, c, c);
  }
}

const PAINTERS: Record<string, Painter> = {
  // ---------- floors ----------
  woodFloor(ctx, s) {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const h = s / rows;
      const tone = -14 + Math.floor(Math.random() * 28);
      ctx.fillStyle = shade("#b98a56", tone);
      ctx.fillRect(0, r * h, s, h);
      // grain
      ctx.strokeStyle = shade("#8a6236", tone);
      ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const y = r * h + Math.random() * h;
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + 2, s * 0.6, y - 2, s, y + 1);
        ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
      }
      // plank joints
      ctx.fillStyle = "rgba(60,38,20,0.8)";
      ctx.fillRect(0, r * h, s, 2);
      const jx = ((r * 7919) % 6) / 6 * s;
      ctx.fillRect(jx, r * h, 2, h);
    }
  },
  woodDark(ctx, s) {
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      const h = s / rows;
      ctx.fillStyle = shade("#6a4a2a", -10 + Math.floor(Math.random() * 20));
      ctx.fillRect(0, r * h, s, h);
      ctx.fillStyle = "rgba(30,18,8,0.8)";
      ctx.fillRect(0, r * h, s, 2);
    }
  },
  carpetBeige(ctx, s) {
    ctx.fillStyle = "#d8c8a8"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ["#c8b898", "#e8d8b8", "#b8a888"]);
  },
  carpetBlue(ctx, s) {
    ctx.fillStyle = "#7a92b8"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ["#6a82a8", "#8aa2c8", "#5a729a"]);
  },
  arcadeCarpet(ctx, s) {
    ctx.fillStyle = "#141030"; ctx.fillRect(0, 0, s, s);
    const neon = ["#ff3aa0", "#3affe0", "#f4ff3a", "#a83aff", "#3aff8a"];
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = neon[i % neon.length];
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath();
      if (i % 3 === 0) { ctx.arc(x, y, 5 + Math.random() * 6, 0, Math.PI * 2); }
      else if (i % 3 === 1) { ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 6); ctx.lineTo(x + 4, y + 16); }
      else { ctx.moveTo(x, y); ctx.bezierCurveTo(x + 10, y - 10, x + 20, y + 10, x + 30, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  tileWhite(ctx, s) {
    ctx.fillStyle = "#c8c8c8"; ctx.fillRect(0, 0, s, s);
    const n = 4, g = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade("#f0f0ee", -6 + Math.floor(Math.random() * 12));
      ctx.fillRect(i * t + g / 2, j * t + g / 2, t - g, t - g);
    }
  },
  tileBlue(ctx, s) {
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#bcd8e8" : "#e4f0f6";
      ctx.fillRect(i * t, j * t, t, t);
      ctx.strokeStyle = "#9ab8cc"; ctx.lineWidth = 2;
      ctx.strokeRect(i * t, j * t, t, t);
    }
  },
  tileKitchen(ctx, s) {
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#e8e0d0" : "#c8b898";
      ctx.fillRect(i * t, j * t, t, t);
      ctx.strokeStyle = "#a89878"; ctx.lineWidth = 2;
      ctx.strokeRect(i * t, j * t, t, t);
    }
  },
  neonGrid(ctx, s) {
    ctx.fillStyle = "#0c0820"; ctx.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let i = 0; i <= n; i++) {
      ctx.strokeStyle = i % 2 ? "#ff3aa0" : "#3affe0";
      ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(i * t, 0); ctx.lineTo(i * t, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * t); ctx.lineTo(s, i * t); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  marble(ctx, s) {
    ctx.fillStyle = "#e8e6e2"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#b8b4ae"; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 7; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.random() * s, 0);
      ctx.bezierCurveTo(Math.random() * s, s * 0.3, Math.random() * s, s * 0.7, Math.random() * s, s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  // ---------- walls ----------
  wallCream(ctx, s) {
    ctx.fillStyle = "#f2e8d8"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      if (i % 2) continue;
      ctx.fillStyle = "#e8dcc6";
      ctx.fillRect(i * (s / 8), 0, s / 8, s);
    }
    speckle(ctx, s, 200, ["#e0d4be"], 1);
  },
  wallBlue(ctx, s) {
    ctx.fillStyle = "#cfe4f2"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#e2f0f8";
    for (let i = 0; i < 6; i++) ctx.fillRect(i * (s / 6) + 4, 0, s / 12, s);
  },
  wallPink(ctx, s) {
    ctx.fillStyle = "#f6dce6"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#fcecf2";
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.beginPath();
      ctx.arc(x * s / 4 + s / 8 + (y % 2) * 10, y * s / 4 + s / 8, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  wallGreen(ctx, s) {
    ctx.fillStyle = "#d8ecd4"; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "#c0dcba"; ctx.lineWidth = 3;
    for (let i = -1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s / 4, 0); ctx.lineTo(i * s / 4 + s / 2, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * s / 4 + s / 2, 0); ctx.lineTo(i * s / 4, s);
      ctx.stroke();
    }
  },
  wallPurple(ctx, s) {
    ctx.fillStyle = "#e4dcf2"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#d6cae8";
    for (let i = 0; i < 4; i++) ctx.fillRect(0, i * (s / 4) + 6, s, s / 10);
  },
  brickRed(ctx, s) {
    ctx.fillStyle = "#8a4a3a"; ctx.fillRect(0, 0, s, s);
    const bh = s / 6, bw = s / 3;
    for (let r = 0; r < 6; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < 4; c++) {
        ctx.fillStyle = shade("#a85a42", -12 + Math.floor(Math.random() * 24));
        ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  },
  brickDark(ctx, s) {
    ctx.fillStyle = "#241830"; ctx.fillRect(0, 0, s, s);
    const bh = s / 6, bw = s / 3;
    for (let r = 0; r < 6; r++) {
      const off = (r % 2) * bw / 2;
      for (let c = -1; c < 4; c++) {
        ctx.fillStyle = shade("#382450", -10 + Math.floor(Math.random() * 20));
        ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  },
  curtainRed(ctx, s) {
    for (let i = 0; i < 10; i++) {
      const x = i * s / 10;
      const g = ctx.createLinearGradient(x, 0, x + s / 10, 0);
      g.addColorStop(0, "#7a1a1a"); g.addColorStop(0.5, "#b03030"); g.addColorStop(1, "#7a1a1a");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, s / 10 + 1, s);
    }
  },

  // ---------- furniture faces ----------
  bookshelf(ctx, s) {
    ctx.fillStyle = "#5a3a1a"; ctx.fillRect(0, 0, s, s);
    const rows = 4, rh = s / rows;
    const cols = ["#c23a3a", "#3a6ac2", "#3aa85a", "#e8a83a", "#8a4ae8", "#e83a8a", "#3ac8c8", "#e8e83a"];
    for (let r = 0; r < rows; r++) {
      // shelf plank
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(0, (r + 1) * rh - 6, s, 6);
      // books
      let x = 6;
      while (x < s - 14) {
        const w = 10 + Math.random() * 14;
        const h = rh * (0.55 + Math.random() * 0.3);
        ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        ctx.fillRect(x, (r + 1) * rh - 6 - h, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x + w - 3, (r + 1) * rh - 6 - h, 3, h);
        x += w + 2;
      }
    }
  },
  windowDay(ctx, s) {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#7ec8f8"); g.addColorStop(0.7, "#c8e8fc"); g.addColorStop(1, "#a8e0a0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    // sun
    ctx.fillStyle = "#ffe66a";
    ctx.beginPath(); ctx.arc(s * 0.72, s * 0.2, s * 0.09, 0, Math.PI * 2); ctx.fill();
    // clouds
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    for (const [cx, cy, r] of [[0.28, 0.24, 0.07], [0.36, 0.26, 0.055], [0.2, 0.27, 0.05], [0.6, 0.42, 0.05], [0.68, 0.44, 0.04]]) {
      ctx.beginPath(); ctx.arc(s * cx, s * cy, s * r, 0, Math.PI * 2); ctx.fill();
    }
    // hill
    ctx.fillStyle = "#8ac86a";
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 1.08, s * 0.7, s * 0.28, 0, Math.PI, 0); ctx.fill();
    // frame
    ctx.fillStyle = "#f8f8f4";
    ctx.fillRect(0, 0, s, 12); ctx.fillRect(0, s - 12, s, 12);
    ctx.fillRect(0, 0, 12, s); ctx.fillRect(s - 12, 0, 12, s);
    ctx.fillRect(s / 2 - 5, 0, 10, s); ctx.fillRect(0, s / 2 - 5, s, 10);
  },
  tvScreen(ctx, s) {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#2a1a6a"); g.addColorStop(1, "#6a2a9a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    // game scene: hills + blocky hero + coins
    ctx.fillStyle = "#3ac86a";
    ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.95, s * 0.4, s * 0.22, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.85, s * 0.98, s * 0.34, s * 0.18, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(s * 0.44, s * 0.52, s * 0.12, s * 0.16); // body
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.46, s * 0.07, 0, Math.PI * 2); ctx.fill(); // head
    ctx.fillStyle = "#ffd24a";
    for (const cx of [0.2, 0.3, 0.7, 0.8]) {
      ctx.beginPath(); ctx.arc(s * cx, s * 0.3, s * 0.035, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(s * 0.11)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("PLAY!", s / 2, s * 0.16);
  },
  vending(ctx, s) {
    ctx.fillStyle = "#c23a3a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#1a1a2a"; ctx.fillRect(s * 0.08, s * 0.08, s * 0.62, s * 0.66);
    const cols = ["#3ac8e8", "#e8a83a", "#3ae85c", "#e83a8a", "#f4ec3a", "#a83aff"];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = cols[(r * 4 + c) % cols.length];
      ctx.fillRect(s * 0.11 + c * s * 0.15, s * 0.11 + r * s * 0.21, s * 0.11, s * 0.16);
    }
    ctx.fillStyle = "#2a2a34"; ctx.fillRect(s * 0.76, s * 0.1, s * 0.16, s * 0.3); // pay panel
    ctx.fillStyle = "#3a3a44"; ctx.fillRect(s * 0.08, s * 0.8, s * 0.62, s * 0.14); // pickup
  },
  menuBoard(ctx, s) {
    ctx.fillStyle = "#2a2018"; ctx.fillRect(0, 0, s, s);
    frame(ctx, s, "#c9963f", 10);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4ec3a";
    ctx.font = `bold ${Math.floor(s * 0.13)}px sans-serif`;
    ctx.fillText("MENU", s / 2, s * 0.2);
    const items: [string, string][] = [["#ffffff", "PIZZA .... 12"], ["#ffffff", "PASTA .... 10"], ["#ffffff", "COLA ..... 3"], ["#3affe0", "TODAY: CAKE!"]];
    ctx.font = `bold ${Math.floor(s * 0.08)}px monospace`;
    items.forEach(([c, t], i) => {
      ctx.fillStyle = c;
      ctx.fillText(t, s / 2, s * (0.38 + i * 0.15));
    });
  },

  tileCheckerBW(ctx, s) {
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#1a1a1a" : "#f4f2ec";
      ctx.fillRect(i * t, j * t, t, t);
    }
  },
  grass(ctx, s) {
    ctx.fillStyle = "#7ab85a"; ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1400, ["#6aa84a", "#8ac86a", "#5a984a", "#90d070"], 3);
    ctx.strokeStyle = "#5a984a"; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  barnWood(ctx, s) {
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = shade("#a83a2a", -12 + Math.floor(Math.random() * 24));
      ctx.fillRect(i * s / 6, 0, s / 6, s);
      ctx.fillStyle = "rgba(60,10,5,0.6)";
      ctx.fillRect(i * s / 6, 0, 3, s);
    }
    ctx.fillStyle = "#f0ece0";
    ctx.fillRect(0, 0, s, 10); ctx.fillRect(0, s - 10, s, 10);
  },
  hay(ctx, s) {
    ctx.fillStyle = "#d8b04a"; ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = i % 2 ? "#c89a34" : "#e8c86a";
      ctx.lineWidth = 2;
      const y = Math.random() * s, x = Math.random() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20 + Math.random() * 20, y + (Math.random() - 0.5) * 6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  paintSplat(ctx, s) {
    ctx.fillStyle = "#cfc6b8"; ctx.fillRect(0, 0, s, s);
    const cols = ["#e83a8a", "#3ac8e8", "#f4ec3a", "#3ae85c", "#f4a83a", "#a83aff", "#e84a3a"];
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = cols[i % cols.length];
      ctx.globalAlpha = 0.85;
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 22;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.7), Math.random() * 3, 0, Math.PI * 2); ctx.fill();
      if (i % 3 === 0) ctx.fillRect(x - 2, y, 4, r * 2.2); // drip
    }
    ctx.globalAlpha = 1;
  },
  cowArt(ctx, s) {
    // cardboard cutout cow (the meccha farm classic!)
    ctx.fillStyle = "#c8a878"; ctx.fillRect(0, 0, s, s); // cardboard
    ctx.fillStyle = "#b89868"; ctx.fillRect(0, 0, s, 14); ctx.fillRect(0, s - 14, s, 14);
    ctx.fillStyle = "#f4f2ec";
    ctx.beginPath(); ctx.roundRect(s * 0.1, s * 0.22, s * 0.72, s * 0.42, s * 0.1); ctx.fill();
    for (const lx of [0.16, 0.3, 0.58, 0.72]) {
      ctx.fillRect(s * lx, s * 0.6, s * 0.08, s * 0.28);
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(s * lx, s * 0.83, s * 0.08, s * 0.05); ctx.fillStyle = "#f4f2ec";
    }
    ctx.beginPath(); ctx.roundRect(s * 0.74, s * 0.12, s * 0.2, s * 0.26, s * 0.06); ctx.fill();
    ctx.fillStyle = "#f0c8c8"; ctx.fillRect(s * 0.78, s * 0.3, s * 0.13, s * 0.08);
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath(); ctx.arc(s * 0.8, s * 0.2, s * 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.86, s * 0.14, s * 0.05, s * 0.025, -0.4, 0, Math.PI * 2); ctx.fill();
    for (const [px, py, rx, ry] of [[0.24, 0.32, 0.09, 0.07], [0.44, 0.45, 0.11, 0.08], [0.62, 0.3, 0.08, 0.06], [0.32, 0.52, 0.07, 0.05], [0.7, 0.5, 0.06, 0.05]]) {
      ctx.beginPath(); ctx.ellipse(s * px, s * py, s * rx, s * ry, Math.random(), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#f0c8c8";
    ctx.beginPath(); ctx.ellipse(s * 0.52, s * 0.62, s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  },

  // ---------- Minecraft-style pixel blocks ----------
  mcGrassTop(ctx, s) { mcNoise(ctx, s, "#6cbb3c", 18); },
  mcDirt(ctx, s) { mcNoise(ctx, s, "#8a5a32", 16); },
  mcStone(ctx, s) { mcNoise(ctx, s, "#8a8a8a", 14); },
  mcLeaf(ctx, s) {
    mcNoise(ctx, s, "#3a8a28", 22);
    const n = 16, c = s / n;
    ctx.fillStyle = "rgba(20,50,12,0.8)";
    for (let i = 0; i < 20; i++) ctx.fillRect(Math.floor(Math.random() * n) * c, Math.floor(Math.random() * n) * c, c, c);
  },
  mcLog(ctx, s) {
    const n = 16, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const stripe = i % 4 < 2;
      ctx.fillStyle = shade(stripe ? "#6a4a28" : "#7a5a34", -8 + Math.floor(Math.random() * 16));
      ctx.fillRect(i * c, j * c, c, c);
    }
  },
  mcPlank(ctx, s) {
    const n = 16, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade("#b8905a", -8 + Math.floor(Math.random() * 16));
      ctx.fillRect(i * c, j * c, c, c);
    }
    ctx.fillStyle = "rgba(90,60,30,0.9)";
    for (let j = 0; j < n; j += 4) ctx.fillRect(0, j * c, s, 2);
  },
  mcTNT(ctx, s) {
    mcNoise(ctx, s, "#c23a2a", 14);
    ctx.fillStyle = "#e8e0d0"; ctx.fillRect(0, s * 0.38, s, s * 0.24);
    ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "center";
    ctx.font = `bold ${Math.floor(s * 0.2)}px monospace`;
    ctx.fillText("TNT", s / 2, s * 0.57);
  },
  mcDiamond(ctx, s) {
    mcNoise(ctx, s, "#8a8a8a", 14);
    const n = 16, c = s / n;
    ctx.fillStyle = "#4adede";
    for (const [i, j] of [[3, 3], [4, 3], [3, 4], [11, 5], [12, 5], [11, 6], [6, 11], [7, 11], [6, 12], [12, 12], [13, 12]]) {
      ctx.fillRect(i * c, j * c, c, c);
    }
  },
  mcGold(ctx, s) {
    mcNoise(ctx, s, "#8a8a8a", 14);
    const n = 16, c = s / n;
    ctx.fillStyle = "#f4d24a";
    for (const [i, j] of [[4, 4], [5, 4], [4, 5], [11, 3], [12, 3], [7, 10], [8, 10], [7, 11], [12, 12], [13, 12], [12, 13]]) {
      ctx.fillRect(i * c, j * c, c, c);
    }
  },
  mcObsidian(ctx, s) { mcNoise(ctx, s, "#241a34", 10); },
  mcPortal(ctx, s) {
    mcNoise(ctx, s, "#7a3ae8", 26);
    ctx.strokeStyle = "#c8a0ff"; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.1 + i * s * 0.07, i, i + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  mcCreeper(ctx, s) {
    mcNoise(ctx, s, "#4ab83a", 20);
    const n = 16, c = s / n;
    ctx.fillStyle = "#0a1a08";
    // eyes
    for (const [i, j] of [[3, 4], [4, 4], [3, 5], [4, 5], [11, 4], [12, 4], [11, 5], [12, 5]]) ctx.fillRect(i * c, j * c, c, c);
    // mouth
    for (const [i, j] of [[6, 7], [7, 7], [8, 7], [9, 7], [6, 8], [7, 8], [8, 8], [9, 8], [5, 9], [6, 9], [9, 9], [10, 9], [5, 10], [10, 10]]) ctx.fillRect(i * c, j * c, c, c);
  },
  mcPath(ctx, s) { mcNoise(ctx, s, "#b89858", 14); },
  mcWater(ctx, s) { mcNoise(ctx, s, "#3a6ae8", 16); },
  mcWheat(ctx, s) {
    mcNoise(ctx, s, "#8a5a32", 10);
    const n = 16, c = s / n;
    ctx.fillStyle = "#d8c84a";
    for (let i = 1; i < n; i += 2) for (let j = 2; j < n; j += 3) {
      ctx.fillRect(i * c, j * c, c, c * 2);
    }
  },
  soil(ctx, s) {
    mcNoise(ctx, s, "#6a4a2e", 12);
    ctx.fillStyle = "rgba(30,18,8,0.55)";
    for (let y = 0; y < s; y += s / 6) ctx.fillRect(0, y, s, s / 18);
  },
};

// ---------- posters (art to imitate!) ----------
const POSTER_ART: Painter[] = [
  (ctx, s) => { // MECCHA chameleon
    ctx.fillStyle = "#1a3a2a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#3ae85c";
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.52, s * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.72, s * 0.42, s * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(s * 0.75, s * 0.4, s * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111111";
    ctx.beginPath(); ctx.arc(s * 0.76, s * 0.4, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#3ae85c"; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.arc(s * 0.3, s * 0.66, s * 0.12, 0, Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = "#f4ec3a";
    ctx.font = `bold ${Math.floor(s * 0.12)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("MECCHA!", s / 2, s * 0.14);
  },
  (ctx, s) => { // star
    ctx.fillStyle = "#2a2a6a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#f4ec3a";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.14 : s * 0.32;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const x = s / 2 + Math.cos(a) * r, y = s * 0.45 + Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(s * 0.14)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("STAR", s / 2, s * 0.88);
  },
  (ctx, s) => { // pizza
    ctx.fillStyle = "#f4e0c0"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#e8b84a";
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.16); ctx.lineTo(s * 0.2, s * 0.72); ctx.lineTo(s * 0.8, s * 0.72); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#c23a2a";
    for (const [px, py] of [[0.5, 0.34], [0.42, 0.5], [0.58, 0.52], [0.5, 0.64], [0.34, 0.64], [0.66, 0.66]]) {
      ctx.beginPath(); ctx.arc(s * px, s * py, s * 0.045, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#8a4a1a";
    ctx.font = `bold ${Math.floor(s * 0.14)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("PIZZA", s / 2, s * 0.9);
  },
  (ctx, s) => { // rocket
    ctx.fillStyle = "#0a0a2a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 24; i++) { ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
    ctx.fillStyle = "#d8d8e0";
    ctx.fillRect(s * 0.44, s * 0.3, s * 0.12, s * 0.32);
    ctx.beginPath(); ctx.moveTo(s * 0.44, s * 0.3); ctx.lineTo(s * 0.5, s * 0.14); ctx.lineTo(s * 0.56, s * 0.3); ctx.closePath();
    ctx.fillStyle = "#e83a3a"; ctx.fill();
    ctx.fillStyle = "#f4a83a";
    ctx.beginPath(); ctx.moveTo(s * 0.46, s * 0.62); ctx.lineTo(s * 0.5, s * 0.78); ctx.lineTo(s * 0.54, s * 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3affe0";
    ctx.font = `bold ${Math.floor(s * 0.14)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("GO!", s / 2, s * 0.93);
  },
  (ctx, s) => { // cola
    ctx.fillStyle = "#e83a3a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(s * 0.38, s * 0.3, s * 0.24, s * 0.42);
    ctx.fillStyle = "#3a1a0a";
    ctx.fillRect(s * 0.38, s * 0.42, s * 0.24, s * 0.24);
    ctx.strokeStyle = "#f4ec3a"; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(s * 0.52, s * 0.3); ctx.lineTo(s * 0.62, s * 0.14); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(s * 0.13)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("COLA", s / 2, s * 0.9);
  },
  (ctx, s) => { // rainbow paint
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, s, s);
    const cols = ["#e83a3a", "#f4a83a", "#f4ec3a", "#3ae85c", "#3a8ae8", "#a83ae8"];
    cols.forEach((c, i) => {
      ctx.strokeStyle = c; ctx.lineWidth = s * 0.045;
      ctx.beginPath(); ctx.arc(s / 2, s * 0.78, s * (0.5 - i * 0.055), Math.PI, 0); ctx.stroke();
    });
    ctx.fillStyle = "#2a2a2a";
    ctx.font = `bold ${Math.floor(s * 0.12)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("PAINT!", s / 2, s * 0.92);
  },
  (ctx, s) => { // ghost HIDE!
    ctx.fillStyle = "#2a1a3a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#f0f0f8";
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.42, s * 0.2, Math.PI, 0);
    ctx.lineTo(s * 0.7, s * 0.68);
    for (let i = 0; i < 4; i++) ctx.arc(s * (0.65 - i * 0.1), s * 0.68, s * 0.05, 0, Math.PI, i % 2 === 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#2a1a3a";
    ctx.beginPath(); ctx.arc(s * 0.44, s * 0.42, s * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.56, s * 0.42, s * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3affe0";
    ctx.font = `bold ${Math.floor(s * 0.14)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("HIDE!", s / 2, s * 0.9);
  },
  (ctx, s) => { // game controller
    ctx.fillStyle = "#1a2a4a"; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#4a4a5a";
    ctx.beginPath();
    ctx.roundRect(s * 0.2, s * 0.36, s * 0.6, s * 0.26, s * 0.1);
    ctx.fill();
    ctx.fillStyle = "#2a2a34";
    ctx.fillRect(s * 0.28, s * 0.44, s * 0.1, s * 0.035);
    ctx.fillRect(s * 0.312, s * 0.41, s * 0.035, s * 0.1);
    for (const [bx, c] of [[0.64, "#e83a3a"], [0.7, "#f4ec3a"], [0.67, "#3ae85c"]] as [number, string][]) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(s * bx, s * 0.49, s * 0.024, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#3affe0";
    ctx.font = `bold ${Math.floor(s * 0.13)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText("GAME", s / 2, s * 0.85);
  },
];

POSTER_ART.forEach((art, i) => {
  PAINTERS[`poster${i}`] = (ctx, s) => {
    art(ctx, s);
    frame(ctx, s, "#f8f8f4", 10);
  };
});

export const POSTER_COUNT = POSTER_ART.length;

const SIZES: Record<string, number> = {
  cowArt: 512, paintSplat: 512,
  windowDay: 512, tvScreen: 512, menuBoard: 512, vending: 512, bookshelf: 512,
  poster0: 512, poster1: 512, poster2: 512, poster3: 512, poster4: 512, poster5: 512, poster6: 512, poster7: 512,
};

const canvasCache = new Map<string, HTMLCanvasElement>();
const texCache = new Map<string, THREE.CanvasTexture>();

export function getTex(name: string, repeatX = 1, repeatY = 1): THREE.Texture | undefined {
  if (typeof document === "undefined") return undefined;
  const key = `${name}|${repeatX}|${repeatY}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  let cv = canvasCache.get(name);
  if (!cv) {
    const painter = PAINTERS[name];
    if (!painter) return undefined;
    const size = SIZES[name] ?? 256;
    cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d")!;
    painter(ctx, size);
    canvasCache.set(name, cv);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (name.startsWith("mc")) tex.magFilter = THREE.NearestFilter; // 픽셀 블록 유지
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}
