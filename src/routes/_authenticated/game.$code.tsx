import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  MAPS, MAP_LIST, type MapDef, type WallBox, type Prop,
  PLAYER_EYE_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS,
  parseRoomConfig, type RoomConfig,
} from "@/game/maps";
import {
  usePresence, type PlayerState, type PaintStroke, type BodyPart, type ShotEvent,
} from "@/game/usePresence";
import {
  CANVAS_SIZE, BODY_PARTS,
  createPaintCanvases, applyStroke, resetCanvases,
  type PaintCanvases, type PaintTextures,
} from "@/game/bodyPaint";
import { getTex } from "@/game/textures";
import { getControlScheme, type ControlScheme } from "@/game/controls";
import { sfxShot, sfxHit, sfxWhistle, sfxPick, sfxFill, sfxDing } from "@/game/sfx";

export const Route = createFileRoute("/_authenticated/game/$code")({
  component: GameRoute,
});

type RoomData = { id: string; code: string; status: string; map_name: string; host_id: string; started_at: string | null };
type MyPlayer = { role: "hider" | "seeker" | null; username: string; spawnIndex: number };

function GameRoute() {
  const { code } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [me, setMe] = useState<MyPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r, error: rErr } = await supabase
        .from("rooms").select("id, code, status, map_name, host_id, started_at").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (rErr || !r) { setError("방을 찾을 수 없습니다"); return; }
      if (r.status !== "playing") {
        navigate({ to: "/room/$code", params: { code }, replace: true });
        return;
      }
      setRoom(r as RoomData);

      const { data: players } = await supabase
        .from("room_players").select("user_id, role").eq("room_id", r.id).order("joined_at", { ascending: true });
      const rows = players ?? [];
      const mineIdx = rows.findIndex((p) => p.user_id === user.id);
      const mine = rows[mineIdx];
      if (!mine) { setError("이 방의 플레이어가 아닙니다"); return; }

      const { data: prof } = await supabase
        .from("profiles").select("username").eq("id", user.id).maybeSingle();

      // RLS(보안 규칙) 때문에 방장이 다른 플레이어의 role을 DB에 못 쓴다.
      // 대신 모두가 똑같이 계산할 수 있는 시드(방 id + 시작 시각)로 술래를 정한다 —
      // 설정된 헌터 수만큼 결정론적으로 뽑는다.
      const cfgL = parseRoomConfig(r.map_name);
      const seed = r.id + (r.started_at ?? "");
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
      const rnd = () => { h = (h * 1664525 + 1013904223) | 0; return (h >>> 0) / 4294967296; };
      const shuf = (a: number[]) => {
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      // 술래 지원자(대기실에서 role='seeker'로 표시한 사람) 중에서 먼저 뽑고,
      // 지원자가 모자라면 나머지에서 채운다 — 모두가 같은 시드로 같은 결과를 계산.
      const volunteers: number[] = [], others: number[] = [];
      rows.forEach((p, i) => (p.role === "seeker" ? volunteers : others).push(i));
      const ordered = [...shuf(volunteers), ...shuf(others)];
      const nSeek = Math.min(Math.max(1, cfgL.seekers), Math.max(1, rows.length - 1));
      const seekerSet = new Set(ordered.slice(0, nSeek));

      setMe({
        role: seekerSet.has(mineIdx) ? "seeker" : "hider",
        username: prof?.username ?? "player",
        spawnIndex: mineIdx >= 0 ? mineIdx : 0,
      });
    })();
    return () => { cancelled = true; };
  }, [code, user.id, navigate]);

  useEffect(() => {
    if (!room) return;
    const ch = supabase
      .channel(`gameroom:${room.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        (payload) => {
          const next = payload.new as RoomData;
          if (next.status !== "playing") navigate({ to: "/room/$code", params: { code }, replace: true });
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        () => navigate({ to: "/lobby", replace: true }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room, code, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Link to="/lobby"><Button variant="outline">로비로</Button></Link>
        </div>
      </div>
    );
  }
  if (!room || !me) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">3D 로딩 중...</div>;
  }

  const cfg = parseRoomConfig(room.map_name);
  let mapName = cfg.map;
  if (mapName === "vote") mapName = cfg.chosen ?? "house";
  if (mapName === "random") {
    const seed = room.id + (room.started_at ?? "");
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    mapName = MAP_LIST[Math.abs(h) % MAP_LIST.length].name;
  }
  const mapDef = MAPS[mapName] ?? MAPS.house;
  return <GameScene room={room} mapDef={mapDef} me={me} selfUserId={user.id} cfg={cfg} />;
}

// -----------------------------------------------------------------------------
// Phase — 10s ready / 120s hide / 400s seek, synced to the room's started_at
// -----------------------------------------------------------------------------

type Phase = "prep" | "hide" | "seek" | "end";
const PHASE_LABEL: Record<Phase, string> = {
  prep: "준비",
  hide: "숨는 시간",
  seek: "찾는 시간",
  end: "게임 종료",
};
const PREP_SEC = 10;

function computePhase(startedAt: number, hideSec: number, seekSec: number): { phase: Phase; remaining: number } {
  const hideEnd = PREP_SEC + hideSec, seekEnd = hideEnd + seekSec;
  const el = Math.max(0, (Date.now() - startedAt) / 1000);
  if (el < PREP_SEC) return { phase: "prep", remaining: Math.ceil(PREP_SEC - el) };
  if (el < hideEnd) return { phase: "hide", remaining: Math.ceil(hideEnd - el) };
  if (el < seekEnd) return { phase: "seek", remaining: Math.ceil(seekEnd - el) };
  return { phase: "end", remaining: 0 };
}

function useGamePhase(startedAt: number, hideSec: number, seekSec: number) {
  const [state, setState] = useState(() => computePhase(startedAt, hideSec, seekSec));
  const forcedRef = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (forcedRef.current) return;
      setState((prev) => {
        const next = computePhase(startedAt, hideSec, seekSec);
        return next.phase === prev.phase && next.remaining === prev.remaining ? prev : next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [startedAt, hideSec, seekSec]);
  useEffect(() => { sfxDing(); }, [state.phase]);
  const endNow = useCallback(() => { forcedRef.current = true; setState({ phase: "end", remaining: 0 }); }, []);
  return { phase: state.phase, remaining: state.remaining, endNow };
}

// -----------------------------------------------------------------------------
// Raycast helpers
// -----------------------------------------------------------------------------

function chainHas(o: THREE.Object3D | null, key: string): boolean {
  let cur = o;
  while (cur) {
    if (cur.userData && cur.userData[key]) return true;
    cur = cur.parent;
  }
  return false;
}

function chainPlayerId(o: THREE.Object3D | null): string | null {
  let cur = o;
  while (cur) {
    if (cur.userData && cur.userData.playerId) return cur.userData.playerId as string;
    cur = cur.parent;
  }
  return null;
}

const imgCanvasCache = new WeakMap<object, CanvasRenderingContext2D>();

function sampleHitColor(hit: THREE.Intersection): string | null {
  const obj = hit.object as THREE.Mesh;
  if (!obj.material) return null;
  const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
  const map = mat.map as THREE.Texture | null;
  const img = map?.image as (HTMLImageElement | HTMLCanvasElement | undefined);
  if (map && img && img.width > 0 && hit.uv) {
    try {
      let ctx: CanvasRenderingContext2D | null | undefined;
      if (img instanceof HTMLCanvasElement) {
        // live canvas (painted bodies, procedural textures) — sample directly, always fresh
        ctx = img.getContext("2d");
      } else {
        ctx = imgCanvasCache.get(img);
        if (!ctx) {
          const cv = document.createElement("canvas");
          cv.width = img.width; cv.height = img.height;
          ctx = cv.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          imgCanvasCache.set(img, ctx);
        }
      }
      if (!ctx) return mat.color ? "#" + mat.color.getHexString() : null;
      const u = (((hit.uv.x * map.repeat.x) % 1) + 1) % 1;
      const v = (((hit.uv.y * map.repeat.y) % 1) + 1) % 1;
      const px = Math.min(img.width - 1, Math.floor(u * img.width));
      const py = Math.min(img.height - 1, Math.floor((1 - v) * img.height));
      const d = ctx.getImageData(px, py, 1, 1).data;
      return "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
    } catch {
      // tainted canvas — fall through
    }
  }
  if (mat.color) return "#" + mat.color.getHexString();
  return null;
}

// -----------------------------------------------------------------------------
// Scene
// -----------------------------------------------------------------------------

type Splat = { id: number; pos: [number, number, number]; color: string; r: number };

const SPLAT_COLORS = ["#e83a8a", "#3ac8e8", "#f4ec3a", "#a03ae8", "#3ae85c", "#f4a83a"];

export type TouchState = {
  mx: number; mz: number;
  lookX: number; lookY: number;
  jump: boolean; crouch: boolean;
  pick: boolean; fill: boolean; whistle: boolean; stick: boolean; shoot: boolean;
};

export type SelfAnim = {
  x: number; z: number; feetY: number; yaw: number;
  crouch: boolean; moving: boolean; pose: number; flat: boolean;
  visible: boolean;
};

function GameScene({
  room, mapDef, me, selfUserId, cfg,
}: {
  room: RoomData; mapDef: MapDef; me: MyPlayer; selfUserId: string; cfg: RoomConfig;
}) {
  const [locked, setLocked] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [scheme, setScheme] = useState<ControlScheme>(() => getControlScheme());
  const startedAtMs = useMemo(
    () => room.started_at ? new Date(room.started_at).getTime() : Date.now(),
    [room.started_at],
  );
  const { phase, remaining, endNow } = useGamePhase(startedAtMs, cfg.hide, cfg.seek);

  // 감염전: 잡히면 역할이 술래로 바뀐다 · 새로고침해도 상태 유지(부활 방지)
  const matchKey = `mecha:${room.id}:${room.started_at ?? ""}:${selfUserId}`;
  const [myRole, setMyRole] = useState<"hider" | "seeker" | null>(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(matchKey) === "infected") return "seeker";
    return me.role;
  });
  const isSeeker = myRole === "seeker";

  const touchInput = useRef<TouchState>({
    mx: 0, mz: 0, lookX: 0, lookY: 0,
    jump: false, crouch: false,
    pick: false, fill: false, whistle: false, stick: false, shoot: false,
  });

  const spawn = mapDef.spawnPoints[me.spawnIndex % mapDef.spawnPoints.length];

  const navigate = useNavigate();
  const [pickMode, setPickMode] = useState<null | "pick" | "fill">(null);
  const paintingActive = useRef(false); // 지금 몸에 그리는 중인지 (카메라 회전과 구분)

  // 첫 터치/클릭에 전체 화면 진입 (모바일 주소창·화면 당김 방지)
  useEffect(() => {
    const goFull = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", goFull);
    return () => window.removeEventListener("pointerdown", goFull);
  }, []);

  // live self pose for the visible third-person body
  const selfAnim = useRef<SelfAnim>({
    x: spawn[0], z: spawn[2], feetY: 0, yaw: 0,
    crouch: false, moving: false, pose: 0, flat: false,
    visible: !isSeeker,
  });

  // ---- toasts (on-screen feedback: 벽붙기, 포즈, 스포이드...) ----
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const toastSeq = useRef(0);
  const showToast = useCallback((msg: string) => {
    const id = ++toastSeq.current;
    setToast({ id, msg });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2000);
  }, []);

  // ---- paint store ----
  const paintStoreRef = useRef<Map<string, { canvases: PaintCanvases; textures: PaintTextures; strokes: PaintStroke[] }>>(new Map());

  const getOrCreatePaint = useCallback((uid: string) => {
    let entry = paintStoreRef.current.get(uid);
    if (!entry) {
      const { canvases, textures } = createPaintCanvases();
      entry = { canvases, textures, strokes: [] };
      paintStoreRef.current.set(uid, entry);
    }
    return entry;
  }, []);

  useEffect(() => { getOrCreatePaint(selfUserId); }, [selfUserId, getOrCreatePaint]);

  // ---- match state ----
  const [myCaught, setMyCaught] = useState<boolean>(() =>
    typeof sessionStorage !== "undefined" && sessionStorage.getItem(matchKey) === "caught");
  const myCaughtRef = useRef(false);
  myCaughtRef.current = myCaught;
  const [caughtIds, setCaughtIds] = useState<Set<string>>(() => new Set());
  const caughtIdsRef = useRef(caughtIds);
  caughtIdsRef.current = caughtIds;
  const [splats, setSplats] = useState<Splat[]>([]);
  const splatSeq = useRef(0);
  const whistlesRef = useRef<Record<string, number>>({});
  const [aliveInfo, setAliveInfo] = useState({ alive: 0, total: 0, seekers: 0 });
  const hadHidersRef = useRef(false); // 감염전: 전원 감염 시 total이 0이 되어도 종료 판정용
  const [gameResult, setGameResult] = useState<null | "seeker" | "hider">(null);

  const remoteHolder = useRef<Map<string, PlayerState> | null>(null);

  const addSplats = useCallback((points: [number, number, number][], color: string) => {
    setSplats((prev) => {
      const next = [...prev];
      for (const p of points) {
        next.push({ id: splatSeq.current++, pos: p, color, r: 0.1 + Math.random() * 0.14 });
      }
      while (next.length > 150) next.shift();
      return next;
    });
  }, []);

  const applyShot = useCallback((e: ShotEvent, isLocal: boolean) => {
    if (!isLocal) sfxShot();
    addSplats(e.points, e.color);
    if (e.targets.length > 0) {
      sfxHit();
      const infect = cfg.mode === "infect";
      for (const uid of e.targets) {
        const nm = uid === selfUserId ? me.username : (remoteHolder.current?.get(uid)?.username ?? "누군가");
        if (infect) showToast(isLocal ? `🧟 ${nm}님을 감염시켰다!` : `🧟 ${nm}님이 감염됐다!`);
        else showToast(isLocal ? `🎯 ${nm}님을 잡았습니다!` : `💀 ${nm}님이 잡혔습니다!`);
      }
      if (!infect) {
        setCaughtIds((prev) => {
          const next = new Set(prev);
          for (const t of e.targets) next.add(t);
          return next;
        });
        if (e.targets.includes(selfUserId)) {
          setMyCaught(true);
          try { sessionStorage.setItem(matchKey, "caught"); } catch { /* ignore */ }
        }
      } else if (e.targets.includes(selfUserId)) {
        setMyRole("seeker");
        showToast("🧟 감염됐다! 이제 너도 술래다 — 사냥 시작!");
        try { sessionStorage.setItem(matchKey, "infected"); } catch { /* ignore */ }
      }
    }
  }, [addSplats, selfUserId, me.username, showToast, cfg.mode, matchKey]);

  const handleRemotePaint = useCallback((s: PaintStroke) => {
    const entry = getOrCreatePaint(s.userId);
    entry.strokes.push(s);
    applyStroke(entry.canvases, entry.textures, s);
  }, [getOrCreatePaint]);

  const handleRemoteWhistle = useCallback((uid: string) => {
    whistlesRef.current[uid] = performance.now();
    sfxWhistle();
  }, []);

  const { remoteRef, sendState, sendPaint, sendShot, sendWhistle, sendPaintClear } = usePresence(
    room.id, selfUserId, { username: me.username, role: myRole },
    {
      onPaint: handleRemotePaint,
      onShot: (e) => applyShot(e, false),
      onWhistle: handleRemoteWhistle,
      onPaintClear: (uid) => {
        const entry = getOrCreatePaint(uid);
        entry.strokes = [];
        resetCanvases(entry.canvases, entry.textures);
      },
      getMyStrokes: () => paintStoreRef.current.get(selfUserId)?.strokes ?? [],
    },
  );

  remoteHolder.current = remoteRef.current;

  // ---- alive hider tracking + win check ----
  useEffect(() => {
    const t = setInterval(() => {
      const hiders = new Set<string>();
      if (myRole === "hider") hiders.add(selfUserId);
      for (const [uid, st] of remoteRef.current) {
        if (st.role === "hider") hiders.add(uid);
      }
      let alive = 0;
      for (const uid of hiders) {
        const caught = caughtIdsRef.current.has(uid) ||
          (uid === selfUserId ? myCaughtRef.current : !!remoteRef.current.get(uid)?.caught);
        if (!caught) alive++;
      }
      let seekers = myRole === "seeker" ? 1 : 0;
      for (const [, st] of remoteRef.current) if (st.role === "seeker") seekers++;
      if (hiders.size > 0) hadHidersRef.current = true;
      setAliveInfo({ alive, total: hiders.size, seekers });
    }, 500);
    return () => clearInterval(t);
  }, [myRole, selfUserId, remoteRef]);

  useEffect(() => {
    if (phase === "seek" && aliveInfo.alive === 0 && (aliveInfo.total > 0 || hadHidersRef.current) && !gameResult) {
      setGameResult("seeker");
      endNow();
    }
  }, [phase, aliveInfo, gameResult, endNow]);

  useEffect(() => {
    if (phase === "end" && !gameResult) {
      setGameResult(aliveInfo.alive > 0 ? "hider" : "seeker");
    }
  }, [phase, gameResult, aliveInfo.alive]);

  useEffect(() => {
    if (gameResult && document.pointerLockElement) document.exitPointerLock();
  }, [gameResult]);

  // 게임 종료 → 자동으로 대기실 복귀 (방장이 방 상태를 되돌리면 모두 이동)
  useEffect(() => {
    if (!gameResult) return;
    const t1 = setTimeout(() => {
      if (room.host_id === selfUserId) {
        void supabase.from("rooms").update({ status: "waiting" }).eq("id", room.id).then(() => {});
      }
    }, 4000);
    const t2 = setTimeout(() => {
      navigate({ to: "/room/$code", params: { code: room.code } });
    }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [gameResult, room.host_id, room.id, room.code, selfUserId, navigate]);

  // P toggles paint mode (hiders only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyP") { e.preventDefault(); setPaintMode((m) => !m); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSeeker]);

  useEffect(() => {
    if (paintMode && document.pointerLockElement) document.exitPointerLock();
  }, [paintMode]);

  // block the browser context menu (right-click = 회전 고정/회전)
  useEffect(() => {
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  // ---- painting ----
  const [brushColor, setBrushColor] = useState("#e83a3a");
  const [brushSize, setBrushSize] = useState(14);
  const [bodyColor, setBodyColor] = useState("#ffffff");
  const bodyColorRef = useRef(bodyColor);
  bodyColorRef.current = bodyColor;

  const applyLocalStroke = useCallback((part: BodyPart, x: number, y: number, from?: { x: number; y: number }) => {
    const entry = getOrCreatePaint(selfUserId);
    const stroke: PaintStroke = { userId: selfUserId, part, x, y, size: brushSize, color: brushColor, from };
    entry.strokes.push(stroke);
    applyStroke(entry.canvases, entry.textures, stroke);
    sendPaint({ part, x, y, size: brushSize, color: brushColor, from });
  }, [getOrCreatePaint, selfUserId, sendPaint, brushColor, brushSize]);

  const clearSelf = useCallback(() => {
    const entry = getOrCreatePaint(selfUserId);
    entry.strokes = [];
    resetCanvases(entry.canvases, entry.textures);
    sendPaintClear(); // 다른 사람들 화면에서도 지워지게 동기화
  }, [getOrCreatePaint, selfUserId, sendPaintClear]);

  const handleEyedrop = useCallback((color: string) => {
    setBodyColor(color);
    setBrushColor(color);
    sfxPick();
    showToast(`🎨 색 추출!`);
  }, [showToast]);

  const fillSelf = useCallback((pickedColor?: string) => {
    const entry = getOrCreatePaint(selfUserId);
    const color = pickedColor ?? bodyColorRef.current;
    for (const part of BODY_PARTS) {
      const stroke: PaintStroke = { userId: selfUserId, part, x: 0, y: 0, size: 0, color, fill: true };
      entry.strokes.push(stroke);
      applyStroke(entry.canvases, entry.textures, stroke);
      sendPaint({ part, x: 0, y: 0, size: 0, color, fill: true });
    }
    sfxFill();
  }, [getOrCreatePaint, selfUserId, sendPaint]);

  const handleSelfWhistle = useCallback(() => {
    if (myCaughtRef.current) return;
    sendWhistle();
    sfxWhistle();
  }, [sendWhistle]);

  const handleFire = useCallback((rawTargets: string[], points: [number, number, number][]) => {
    const targets = rawTargets.filter((uid) => {
      if (uid === selfUserId) return false;
      if (caughtIdsRef.current.has(uid)) return false;
      const st = remoteRef.current.get(uid);
      return st?.role === "hider" && !st.caught;
    });
    const color = SPLAT_COLORS[Math.floor(Math.random() * SPLAT_COLORS.length)];
    const e: ShotEvent = { shooterId: selfUserId, targets, points, color };
    applyShot(e, true);
    sendShot({ targets, points, color });
  }, [selfUserId, remoteRef, applyShot, sendShot]);

  const isMobile = scheme === "mobile";

  const frozen = phase === "prep" || (phase === "hide" && isSeeker) || phase === "end";
  const seekerBlind = isSeeker && (phase === "prep" || phase === "hide");
  const canShoot = isSeeker && phase === "seek" && !paintMode && gameResult === null;

  return (
    <div className="fixed inset-0 bg-black select-none">
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: spawn }}
        gl={{ antialias: true }}
        style={{ touchAction: "none" }}
        onCreated={({ gl }) => { gl.domElement.style.touchAction = "none"; }}
      >
        <color attach="background" args={[mapDef.skyColor]} />
        <fog attach="fog" args={[mapDef.skyColor, mapDef.fogNear, mapDef.fogFar]} />
        <ambientLight intensity={0.8} color={mapDef.ambientColor} />
        <hemisphereLight args={[mapDef.skyColor, mapDef.groundColor, 0.55]} />
        <directionalLight position={[40, 60, 25]} intensity={1.15} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-150} shadow-camera-right={150}
          shadow-camera-top={150} shadow-camera-bottom={-150}
          shadow-camera-far={320} shadow-bias={-0.0005} />

        <Floor mapDef={mapDef} />
        <Walls mapDef={mapDef} />
        <Props props={mapDef.props} />
        <Splats splats={splats} />

        <RemotePlayersRenderer
          remoteRef={remoteRef}
          selfUserId={selfUserId}
          getPaint={getOrCreatePaint}
          caughtIds={caughtIds}
          myRole={myRole}
          whistlesRef={whistlesRef}
        />

        {(!isSeeker || paintMode) && (
          <SelfBody
            selfAnim={selfAnim}
            textures={getOrCreatePaint(selfUserId).textures}
            paintMode={paintMode}
            onPaint={applyLocalStroke}
            paintingActive={paintingActive}
            scale={isSeeker ? 1 : 0.85}
          />
        )}

        <LocalPlayer
          spawn={spawn}
          walls={mapDef.walls}
          props={mapDef.props}
          floorSize={mapDef.floorSize}
          sendState={sendState}
          paintMode={paintMode}
          touchInput={touchInput}
          isMobile={isMobile}
          frozen={frozen}
          caught={myCaught}
          isSeeker={isSeeker}
          selfAnim={selfAnim}
          onEyedrop={handleEyedrop}
          onFill={fillSelf}
          onWhistle={handleSelfWhistle}
          onToast={showToast}
          pickMode={pickMode}
          setPickMode={setPickMode}
          paintingActive={paintingActive}
        />

        <SeekerGun
          visible={isSeeker && !paintMode}
          enabled={canShoot}
          touchInput={touchInput}
          onFire={handleFire}
        />

        {!paintMode && !isMobile && (
          <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
        )}
      </Canvas>

      <Hud
        code={room.code}
        role={myRole}
        username={me.username}
        alive={aliveInfo.alive}
        total={aliveInfo.total}
        seekers={aliveInfo.seekers}
        locked={locked}
        paintMode={paintMode}
        phase={phase}
        remaining={remaining}
        scheme={scheme}
        onSchemeChange={setScheme}
        bodyColor={bodyColor}
        isSeeker={isSeeker}
        picking={pickMode !== null}
      />

      {pickMode && (
        <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-40 bg-black/80 text-white px-5 py-2 rounded-full text-sm font-bold border border-[#3ad0ff] shadow-lg">
          {pickMode === "fill" ? "🖌️ 몸을 칠할 색을 클릭/터치!" : "🎨 색을 딸 곳을 클릭/터치!"} <span className="text-white/50">(같은 키로 취소)</span>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 -translate-x-1/2 z-40 bg-black/75 text-white px-5 py-2 rounded-full text-sm font-bold tracking-wider border border-white/20 shadow-lg">
          {toast.msg}
        </div>
      )}

      {phase === "prep" && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className={`text-2xl font-bold tracking-widest ${isSeeker ? "text-[#ff3860]" : "text-[#3ad0ff]"}`}>
              {isSeeker ? "너는 헌터! 🔫" : "너는 카멜레온! 🦎"}
            </div>
            <div className="mt-3 text-7xl font-black text-white tabular-nums drop-shadow-lg">{remaining}</div>
            <div className="mt-3 text-sm text-white/80 leading-relaxed">
              {isSeeker
                ? <>카멜레온들이 숨는 {cfg.hide}초 동안 기다렸다가<br/>좌클릭 샷건으로 전부 찾아내자!</>
                : <>화면에 내 몸이 보여! E로 색을 추출하고 F로 칠해서<br/>배경에 완벽하게 녹아들자. Q로 벽에 붙을 수도 있어!</>}
            </div>
          </div>
        </div>
      )}

      {seekerBlind && phase === "hide" && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/95">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#ff3860] tracking-widest">카멜레온들이 숨는 중...</div>
            <div className="mt-4 text-8xl font-black text-white tabular-nums">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </div>
            <div className="mt-4 text-sm text-white/60">찾는 시간이 되면 시야가 열립니다</div>
          </div>
        </div>
      )}

      {myCaught && gameResult === null && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-40 bg-[#ff3860]/90 text-white px-6 py-2 rounded-full font-bold tracking-widest shadow-lg">
          잡혔다! 👻 관전 모드
        </div>
      )}

      {gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <div className={`text-6xl font-black tracking-widest drop-shadow-lg ${gameResult === "hider" ? "text-[#3ad0ff]" : "text-[#ff3860]"}`}>
              {gameResult === "hider" ? "카멜레온 승리! 🦎" : "헌터 승리! 🔫"}
            </div>
            <div className="mt-4 text-white/80">
              {gameResult === "hider" ? "끝까지 살아남았다!" : (cfg.mode === "infect" ? "전원 감염 완료! 🧟" : "전원 검거 완료!")}
            </div>
            <div className="mt-2 text-sm text-white/50">잠시 후 자동으로 대기실로 이동합니다...</div>
            <div className="mt-8">
              <Link to="/room/$code" params={{ code: room.code }}>
                <Button size="lg" className="tracking-widest">대기실로 돌아가기</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {paintMode && (
        <PaintToolbar
          color={brushColor}
          size={brushSize}
          onColor={setBrushColor}
          onSize={setBrushSize}
          onClear={clearSelf}
          onClose={() => setPaintMode(false)}
        />
      )}

      {isMobile && !paintMode && (
        <TouchControls
          touchInput={touchInput}
          onPaint={() => setPaintMode(true)}
          isSeeker={isSeeker}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------

function Floor({ mapDef }: { mapDef: MapDef }) {
  const [w, d] = mapDef.floorSize;
  const tex = useMemo(
    () => mapDef.floorTex ? getTex(mapDef.floorTex, Math.round(w / 3.2), Math.round(d / 3.2)) : undefined,
    [mapDef.floorTex, w, d],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} color={tex ? "#ffffff" : mapDef.floorColor} roughness={0.9} />
    </mesh>
  );
}

function Walls({ mapDef }: { mapDef: MapDef }) {
  return (
    <>
      {mapDef.walls.map((w, i) => {
        const map = w.tex ? getTex(w.tex, w.texRepeat?.[0] ?? 1, w.texRepeat?.[1] ?? 1) : undefined;
        return (
          <mesh key={i} position={w.pos} castShadow={!w.noCollide} receiveShadow
            userData={{ wallMesh: !w.noCollide, decor: !!w.noCollide }}>
            <boxGeometry args={w.size} />
            <meshStandardMaterial
              map={map}
              color={map ? "#ffffff" : (w.color ?? "#8a8a92")}
              roughness={0.85}
              emissive={w.glow ? (map ? "#ffffff" : (w.color ?? "#ffffff")) : "#000000"}
              emissiveMap={w.glow && map ? map : undefined}
              emissiveIntensity={w.glow ? 0.7 : 0}
            />
          </mesh>
        );
      })}
    </>
  );
}

function Props({ props }: { props: Prop[] }) {
  return (
    <>
      {props.map((p, i) => {
        if (p.kind === "cylinder") {
          return (
            <mesh key={i} position={p.pos} castShadow receiveShadow userData={{ wallMesh: !!p.collides }}>
              <cylinderGeometry args={[p.radiusTop, p.radiusBottom, p.height, 20]} />
              <meshStandardMaterial color={p.color}
                emissive={p.emissive ? p.color : "#000000"} emissiveIntensity={p.emissive ? 0.6 : 0} />
            </mesh>
          );
        }
        return (
          <mesh key={i} position={p.pos} castShadow userData={{ wallMesh: !!p.collides }}>
            <sphereGeometry args={[p.radius, 20, 16]} />
            <meshStandardMaterial color={p.color}
              emissive={p.emissive ? p.color : "#000000"} emissiveIntensity={p.emissive ? 0.5 : 0} />
          </mesh>
        );
      })}
    </>
  );
}

function Splats({ splats }: { splats: Splat[] }) {
  return (
    <>
      {splats.map((s) => (
        <mesh key={s.id} position={s.pos} raycast={() => null}>
          <sphereGeometry args={[s.r, 8, 8]} />
          <meshBasicMaterial color={s.color} />
        </mesh>
      ))}
    </>
  );
}

// -----------------------------------------------------------------------------
// The Meccha mannequin — one body used by yourself AND remote players
// -----------------------------------------------------------------------------

const POSE_NAMES = ["서기", "엎드리기", "웅크리기", "조각상"];

// 피규어 실루엣: 엉덩이→배→어깨→목 살짝 들어감→둥근 머리, 전부 한 곡면
const BODY_PROFILE: [number, number][] = [
  [0.02, 0.40], [0.24, 0.44], [0.33, 0.58], [0.385, 0.80],
  [0.40, 1.00], [0.385, 1.20], [0.35, 1.38], [0.30, 1.50],
  [0.245, 1.58], [0.27, 1.66], [0.315, 1.78], [0.32, 1.90],
  [0.26, 2.02], [0.14, 2.10], [0.01, 2.13],
];

type BodySample = { moving: boolean; pose: number; crouch: boolean; flat: boolean };

function PlayerBody({
  textures, seeker, sample, paintFactory,
}: {
  textures: PaintTextures;
  seeker: boolean;
  sample: () => BodySample;
  paintFactory?: (part: BodyPart) => {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
    onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
    onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
  };
}) {
  const inner = useRef<THREE.Group>(null);
  const lathePts = useMemo(() => BODY_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), []);
  const armLg = useRef<THREE.Group>(null);
  const armRg = useRef<THREE.Group>(null);
  const legLg = useRef<THREE.Group>(null);
  const legRg = useRef<THREE.Group>(null);
  const swing = useRef(0);

  useFrame((_, dt) => {
    const s = sample();
    const g = inner.current;
    if (!g) return;
    const lerp = Math.min(1, dt * 10);
    // poses: 0 서기 · 1 엎드리기(바닥에 납작 엎드림) · 2 웅크리기(공처럼) · 3 조각상
    const prone = s.pose === 1, curl = s.pose === 2, statue = s.pose === 3;
    const scaleY = curl ? 0.5 : (s.crouch ? 0.72 : 1);
    g.scale.y += (scaleY - g.scale.y) * lerp;
    g.scale.z += (((s.flat ? 0.15 : 0.45) - g.scale.z)) * lerp; // 종이 카멜레온! 평소에도 납작
    g.rotation.x += ((prone ? -Math.PI / 2 : 0) - g.rotation.x) * lerp;
    // 바닥붙기(엎드림+flat)는 더 낮게 깔린다
    g.position.y += ((prone ? (s.flat ? 0.1 : 0.2) : 0) - g.position.y) * lerp;
    // 벽붙기 밀착은 서 있는 상태에서만 (엎드림은 바닥 방향으로 납작)
    g.position.z += (((s.flat && !prone) ? 0.38 : 0) - g.position.z) * lerp;

    const target = s.moving && s.pose === 0 ? 1 : 0;
    swing.current += (target - swing.current) * Math.min(1, dt * 8);
    const t = performance.now() * 0.008;
    const amp = 0.65 * swing.current;

    const aL = armLg.current, aR = armRg.current, lL = legLg.current, lR = legRg.current;
    if (!aL || !aR || !lL || !lR) return;
    const ease = (o: THREE.Object3D, rx: number, rz: number) => {
      o.rotation.x += (rx - o.rotation.x) * lerp;
      o.rotation.z += (rz - o.rotation.z) * lerp;
    };
    if (prone) {
      ease(aL, 0, 0.25); ease(aR, 0, -0.25);
      ease(lL, 0, 0); ease(lR, 0, 0);
    } else if (curl) {
      // 팔로 무릎을 감싸 안은 공 모양
      ease(aL, -1.25, 0.45); ease(aR, -1.25, -0.45);
      ease(lL, -0.5, 0); ease(lR, -0.5, 0);
    } else if (statue) {
      ease(aL, 0, 0.1); ease(aR, 0, -0.1);
      ease(lL, 0, 0); ease(lR, 0, 0);
    } else {
      aL.rotation.z += (0.1 - aL.rotation.z) * lerp;
      aR.rotation.z += (-0.1 - aR.rotation.z) * lerp;
      aL.rotation.x = Math.sin(t) * amp;
      aR.rotation.x = -Math.sin(t) * amp;
      lL.rotation.x = -Math.sin(t) * amp * 0.9;
      lR.rotation.x = Math.sin(t) * amp * 0.9;
    }
  });

  const h = (part: BodyPart) => paintFactory ? paintFactory(part) : {};

  return (
    <group ref={inner}>
      {/* legs — thick, sunk deep into the hips (figurine-style, no visible joints) */}
      <group ref={legLg} position={[-0.16, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow {...h("legL")}>
          <capsuleGeometry args={[0.15, 0.9, 6, 14]} />
          <meshLambertMaterial map={textures.legL} color="#ffffff" />
        </mesh>
      </group>
      <group ref={legRg} position={[0.16, 0.82, 0]}>
        <mesh position={[0, -0.4, 0]} castShadow {...h("legR")}>
          <capsuleGeometry args={[0.15, 0.9, 6, 14]} />
          <meshLambertMaterial map={textures.legR} color="#ffffff" />
        </mesh>
      </group>
      {/* body+head — ONE continuous lathe surface, zero seams (figurine!) */}
      <mesh scale={[1, 1, 0.85]} castShadow {...h("torso")}>
        <latheGeometry args={[lathePts, 26]} />
        <meshLambertMaterial map={textures.torso} color="#ffffff" />
      </mesh>
      {/* arms (pivot at shoulder; shoulder ball bridges arm & torso) */}
      <group ref={armLg} position={[-0.35, 1.42, 0]} rotation={[0, 0, 0.07]}>
        <mesh castShadow {...h("armL")}>
          <sphereGeometry args={[0.15, 14, 12]} />
          <meshLambertMaterial map={textures.armL} color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.3, 0]} castShadow {...h("armL")}>
          <capsuleGeometry args={[0.115, 0.7, 6, 12]} />
          <meshLambertMaterial map={textures.armL} color="#ffffff" />
        </mesh>
      </group>
      <group ref={armRg} position={[0.35, 1.42, 0]} rotation={[0, 0, -0.07]}>
        <mesh castShadow {...h("armR")}>
          <sphereGeometry args={[0.15, 14, 12]} />
          <meshLambertMaterial map={textures.armR} color="#ffffff" />
        </mesh>
        <mesh position={[0, -0.3, 0]} castShadow {...h("armR")}>
          <capsuleGeometry args={[0.115, 0.7, 6, 12]} />
          <meshLambertMaterial map={textures.armR} color="#ffffff" />
        </mesh>
        {/* hunters carry the paint shotgun in their right hand */}
        {seeker && (
          <group position={[0.02, -0.62, -0.25]}>
            <mesh castShadow>
              <boxGeometry args={[0.09, 0.11, 0.55]} />
              <meshStandardMaterial map={getTex("paintSplat")} color="#ffffff" />
            </mesh>
            <mesh position={[0, 0.02, -0.42]}>
              <boxGeometry args={[0.06, 0.06, 0.4]} />
              <meshStandardMaterial color="#3a3a44" />
            </mesh>
            <mesh position={[0, 0.02, -0.64]}>
              <boxGeometry args={[0.07, 0.07, 0.05]} />
              <meshStandardMaterial color="#f4a83a" emissive="#f4a83a" emissiveIntensity={0.5} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Your own visible body (third person) — also the paint target in paint mode
// -----------------------------------------------------------------------------

function SelfBody({
  selfAnim, textures, paintMode, onPaint, paintingActive, scale = 1,
}: {
  selfAnim: React.MutableRefObject<SelfAnim>;
  textures: PaintTextures;
  paintMode: boolean;
  onPaint: (part: BodyPart, x: number, y: number, from?: { x: number; y: number }) => void;
  paintingActive: React.MutableRefObject<boolean>;
  scale?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const drawingRef = useRef(false);
  const activePartRef = useRef<BodyPart | null>(null); // 스트로크를 시작한 부위에만 칠한다
  const lastRef = useRef<Record<BodyPart, { x: number; y: number } | null>>({
    head: null, torso: null, armL: null, armR: null, legL: null, legR: null,
  });

  useFrame(() => {
    const a = selfAnim.current;
    const g = group.current;
    if (!g) return;
    g.visible = a.visible;
    g.position.set(a.x, a.feetY, a.z);
    g.rotation.y = a.yaw;
  });

  useEffect(() => {
    const up = () => { drawingRef.current = false; paintingActive.current = false; activePartRef.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [paintingActive]);

  const paintFactory = useCallback((part: BodyPart) => {
    const handle = (e: ThreeEvent<PointerEvent>) => {
      if (!e.uv) return;
      const ne = e.nativeEvent;
      // left button paints; right button is reserved for orbiting the camera
      if (e.type === "pointerdown" && ne.button !== 0) return;
      if (e.type === "pointermove" && (ne.buttons & 1) === 0) return;
      e.stopPropagation();
      if (e.type === "pointerdown") {
        drawingRef.current = true;
        paintingActive.current = true;
        activePartRef.current = part;
        lastRef.current[part] = null;
      }
      if (e.type === "pointerup" || e.type === "pointerleave") {
        drawingRef.current = false;
        paintingActive.current = false;
        activePartRef.current = null;
        lastRef.current[part] = null;
        return;
      }
      if (e.type === "pointermove" && !drawingRef.current) return;
      // 드래그가 다른 부위 위를 지나가도 번지지 않게!
      if (e.type === "pointermove" && activePartRef.current !== part) return;
      const x = e.uv.x * CANVAS_SIZE;
      const y = (1 - e.uv.y) * CANVAS_SIZE;
      const from = lastRef.current[part] ?? undefined;
      onPaint(part, x, y, from);
      lastRef.current[part] = { x, y };
    };
    return { onPointerDown: handle, onPointerMove: handle, onPointerUp: handle };
  }, [onPaint]);

  const sample = useCallback(() => {
    const a = selfAnim.current;
    return { moving: a.moving, pose: a.pose, crouch: a.crouch, flat: a.flat };
  }, [selfAnim]);

  return (
    <group ref={group} userData={{ noRay: true }} scale={scale}>
      <PlayerBody
        textures={textures}
        seeker={false}
        sample={sample}
        paintFactory={paintMode ? paintFactory : undefined}
      />
    </group>
  );
}

// -----------------------------------------------------------------------------
// Local player: physics + camera (3rd person for chameleons, 1st for the hunter)
// -----------------------------------------------------------------------------

const GRAVITY = -22;
const JUMP_V = 8;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const CROUCH_SPEED = 2.4;
const UP = new THREE.Vector3(0, 1, 0);

function LocalPlayer({
  spawn, walls, props, floorSize, sendState, paintMode, touchInput, isMobile,
  frozen, caught, isSeeker, selfAnim, onEyedrop, onFill, onWhistle, onToast,
  pickMode, setPickMode, paintingActive,
}: {
  spawn: [number, number, number];
  walls: WallBox[]; props: Prop[]; floorSize: [number, number];
  sendState: (x: number, y: number, z: number, ry: number, crouch: boolean, moving: boolean, pose: number, caught: boolean, flat: boolean) => void;
  paintMode: boolean;
  touchInput: React.MutableRefObject<TouchState>;
  isMobile: boolean;
  frozen: boolean;
  caught: boolean;
  isSeeker: boolean;
  selfAnim: React.MutableRefObject<SelfAnim>;
  onEyedrop: (color: string) => void;
  onFill: (color?: string) => void;
  onWhistle: () => void;
  onToast: (msg: string) => void;
  pickMode: null | "pick" | "fill";
  setPickMode: (v: null | "pick" | "fill") => void;
  paintingActive: React.MutableRefObject<boolean>;
}) {
  const { camera, scene } = useThree();
  const posRef = useRef(new THREE.Vector3(spawn[0], spawn[1], spawn[2]));
  const velY = useRef(0);
  const onGround = useRef(true);
  const crouchRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const poseRef = useRef(0);
  const stuckRef = useRef(false);
  const stuckFloorRef = useRef(false);
  const stuckYawRef = useRef(0);
  const freezeYawRef = useRef<number | null>(null);

  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const caughtRef = useRef(caught);
  caughtRef.current = caught;
  const paintModeRef = useRef(paintMode);
  paintModeRef.current = paintMode;
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;

  const paintAngle = useRef({ yaw: 0, pitch: 0.15, dist: 3.2 });

  const colliders = useMemo(() => {
    const list: WallBox[] = walls.filter((w) => !w.noCollide);
    for (const p of props) {
      if (!p.collides) continue;
      if (p.kind === "cylinder") {
        const r = Math.max(p.radiusTop, p.radiusBottom);
        list.push({ pos: p.pos, size: [r * 2, p.height, r * 2] });
      } else {
        list.push({ pos: p.pos, size: [p.radius * 2, p.radius * 2, p.radius * 2] });
      }
    }
    return list;
  }, [walls, props]);

  useEffect(() => {
    // never spawn wedged inside furniture — nudge to the nearest free spot
    const [fx, fz] = findFreeSpot(spawn[0], spawn[2], colliders, floorSize);
    posRef.current.set(fx, spawn[1], fz);
    camera.position.set(fx, spawn[1], fz);
  }, [camera, spawn, colliders, floorSize]);

  // 그리기 모드: 몸 밖 드래그(또는 우클릭 드래그)로 카메라 회전 — 상하좌우 모두
  useEffect(() => {
    if (!paintMode) return;
    let last: { x: number; y: number } | null = null;
    const rotate = (dx: number, dy: number) => {
      paintAngle.current.yaw += dx * 0.008;
      paintAngle.current.pitch = Math.max(-0.4, Math.min(1.25, paintAngle.current.pitch + dy * 0.006));
    };
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== "CANVAS") return;
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (paintingActive.current && !(e.buttons & 2)) return; // 몸에 그리는 중엔 회전 안 함
      rotate(dx, dy);
    };
    const up = () => { last = null; };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [paintMode, paintingActive]);

  // Right-click = rotation freeze (real meccha trick: body stays put while you look around)
  useEffect(() => {
    if (isSeeker) return;
    const down = (e: MouseEvent) => {
      if (e.button === 2 && !paintModeRef.current) {
        freezeYawRef.current = stuckRef.current ? stuckYawRef.current : yawRef.current;
      }
    };
    const up = (e: MouseEvent) => {
      if (e.button === 2) freezeYawRef.current = null;
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, [isSeeker]);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // E = 스포이드 모드 / F = 칠하기 모드: 마우스가 풀리고, 클릭한 지점의 색으로 동작
  const eyedrop = useCallback(() => {
    if (caughtRef.current || paintModeRef.current) return;
    if (pickModeRef.current) { setPickMode(null); return; }
    setPickMode("pick");
    if (document.pointerLockElement) document.exitPointerLock();
  }, [setPickMode]);

  const enterFill = useCallback(() => {
    if (caughtRef.current || paintModeRef.current) return;
    if (pickModeRef.current) { setPickMode(null); return; }
    setPickMode("fill");
    if (document.pointerLockElement) document.exitPointerLock();
  }, [setPickMode]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!pickModeRef.current) return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName !== "CANVAS") return; // 버튼/조이스틱 터치는 무시
      const ndc = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      raycaster.far = 80;
      for (const h of raycaster.intersectObjects(scene.children, true)) {
        if (chainHas(h.object, "noRay")) continue;
        const color = sampleHitColor(h);
        if (color) {
          onEyedrop(color);
          if (pickModeRef.current === "fill") onFill(color); // 그 색으로 몸 전체 칠하기!
          break;
        }
      }
      setPickMode(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [camera, scene, raycaster, onEyedrop, onFill, setPickMode]);

  const toggleStick = useCallback(() => {
    if (frozenRef.current || paintModeRef.current || caughtRef.current) return;
    if (stuckRef.current) {
      stuckRef.current = false;
      stuckFloorRef.current = false;
      onToast("떨어졌다!");
      return;
    }
    const p = posRef.current;
    const tryHit = (origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | null => {
      raycaster.set(origin, dir);
      raycaster.far = far;
      for (const h of raycaster.intersectObjects(scene.children, true)) {
        if (chainHas(h.object, "noRay")) continue;
        // 진짜 벽 + 벽지/포스터/창문 같은 표면 장식 둘 다 인정 → 보이는 면에 딱 붙는다
        if (!chainHas(h.object, "wallMesh") && !chainHas(h.object, "decor")) continue;
        if (!h.face) continue;
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        n.y = 0;
        if (n.lengthSq() < 0.01) continue; // floor/ceiling face
        return h;
      }
      return null;
    };
    // 1) the wall under the crosshair dot
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    let hit = tryHit(camera.position, camDir, 9);
    if (hit && hit.point.distanceTo(p) > 3.8) hit = null; // too far to reach
    // 2) otherwise auto-find the nearest wall around the player (8 directions)
    if (!hit) {
      let best: THREE.Intersection | null = null;
      for (let a = 0; a < 8; a++) {
        const d = new THREE.Vector3(Math.cos(a / 8 * Math.PI * 2), 0, Math.sin(a / 8 * Math.PI * 2));
        const h2 = tryHit(p, d, 2.8);
        if (h2 && (!best || h2.distance < best.distance)) best = h2;
      }
      hit = best;
    }
    if (!hit) {
      // 벽이 없으면 그 자리 바닥에 납작 엎드려 붙는다!
      stuckRef.current = true;
      stuckFloorRef.current = true;
      stuckYawRef.current = yawRef.current;
      velY.current = 0;
      onToast("바닥에 납작 붙었다! (Q 또는 Space로 떼기)");
      return;
    }
    const n = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
    n.y = 0;
    n.normalize();
    p.x = hit.point.x + n.x * (PLAYER_RADIUS + 0.05);
    p.z = hit.point.z + n.z * (PLAYER_RADIUS + 0.05);
    velY.current = 0;
    stuckRef.current = true;
    stuckFloorRef.current = false;
    stuckYawRef.current = Math.atan2(-n.x, -n.z); // back against the wall, facing the room
    onToast("벽에 딱 붙었다! (Q 또는 Space로 떼기)");
  }, [camera, scene, raycaster, onToast]);

  const cyclePose = useCallback(() => {
    if (paintModeRef.current) return;
    poseRef.current = (poseRef.current + 1) % 4;
    onToast(`포즈: ${POSE_NAMES[poseRef.current]}`);
  }, [onToast]);

  const actionsRef = useRef({ eyedrop, enterFill, toggleStick, onWhistle, cyclePose });
  actionsRef.current = { eyedrop, enterFill, toggleStick, onWhistle, cyclePose };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.repeat || isSeeker) return;
      if (e.code === "KeyE") actionsRef.current.eyedrop();
      if (e.code === "KeyF") actionsRef.current.enterFill();
      if (e.code === "KeyQ") actionsRef.current.toggleStick();
      if (e.code === "KeyR") actionsRef.current.cyclePose();
      if (e.code === "Digit1" && !caughtRef.current) actionsRef.current.onWhistle();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isSeeker]);

  const camRay = useMemo(() => new THREE.Raycaster(), []);

  const placeThirdPersonCamera = useCallback(() => {
    const p = posRef.current;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const right = new THREE.Vector3().crossVectors(camDir, UP).normalize();
    const pivot = new THREE.Vector3(p.x, p.y + 0.35, p.z).addScaledVector(right, 0.45);
    let dist = 3.6;
    camRay.set(pivot, camDir.clone().negate());
    camRay.far = dist;
    const hits = camRay.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (chainHas(h.object, "noRay")) continue;
      if (!chainHas(h.object, "wallMesh")) continue;
      dist = Math.max(0.7, h.distance - 0.25);
      break;
    }
    camera.position.copy(pivot).addScaledVector(camDir, -dist);
  }, [camera, scene, camRay]);

  const syncSelfAnim = useCallback((moving: boolean, crouch: boolean, bodyYaw: number) => {
    const p = posRef.current;
    const a = selfAnim.current;
    const eyeH = crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    a.x = p.x; a.z = p.z;
    a.feetY = Math.max(0, p.y - eyeH);
    a.yaw = bodyYaw;
    a.crouch = crouch;
    a.moving = moving;
    a.pose = poseRef.current;
    a.flat = stuckRef.current;
    // 잡히면(관전) 내 몸은 숨김 · 술래는 그리기 모드에서만 자기 몸이 보임
    a.visible = (!isSeeker || paintModeRef.current) && !caughtRef.current;
  }, [selfAnim, isSeeker]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = posRef.current;
    const ti = touchInput.current;

    if (ti.pick) { ti.pick = false; actionsRef.current.eyedrop(); }
    if (ti.fill) { ti.fill = false; actionsRef.current.enterFill(); }
    if (ti.whistle) { ti.whistle = false; if (!caughtRef.current) actionsRef.current.onWhistle(); }
    if (ti.stick) { ti.stick = false; actionsRef.current.toggleStick(); }

    // Paint mode: camera orbits your body
    if (paintMode) {
      const { yaw, pitch, dist } = paintAngle.current;
      const cp = Math.cos(pitch);
      camera.position.set(
        p.x + Math.sin(yaw) * cp * dist,
        p.y + 0.4 + Math.sin(pitch) * dist,
        p.z + Math.cos(yaw) * cp * dist,
      );
      camera.lookAt(p.x, p.y - 0.2, p.z);
      const bodyYaw = stuckRef.current ? (freezeYawRef.current ?? stuckYawRef.current) : yawRef.current;
      const paintPose = stuckRef.current
        ? (stuckFloorRef.current ? 1 : (poseRef.current === 1 ? 0 : poseRef.current))
        : poseRef.current;
      const paintCrouch = stuckRef.current ? false : crouchRef.current;
      syncSelfAnim(false, paintCrouch, bodyYaw);
      selfAnim.current.pose = paintPose;
      sendState(p.x, p.y, p.z, bodyYaw, paintCrouch, false, paintPose, caughtRef.current, stuckRef.current);
      return;
    }

    // Mobile look
    if (isMobile) {
      yawRef.current -= ti.lookX;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitchRef.current - ti.lookY));
      ti.lookX = 0;
      ti.lookY = 0;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
      camera.quaternion.copy(q);
    } else {
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yawRef.current = euler.y;
    }

    const k = keys.current;

    // Wall stick: frozen flat against the wall; look around freely
    if (stuckRef.current) {
      if (k["Space"] || ti.jump) {
        stuckRef.current = false;
        stuckFloorRef.current = false;
        ti.jump = false;
      }
      if (!isSeeker) placeThirdPersonCamera();
      else camera.position.copy(p);
      const bodyYaw = freezeYawRef.current ?? stuckYawRef.current;
      // 바닥붙기 = 엎드리기 포즈, 벽붙기 = 서 있는 포즈로 밀착
      const effPose = stuckFloorRef.current ? 1 : (poseRef.current === 1 ? 0 : poseRef.current);
      syncSelfAnim(false, false, bodyYaw);
      selfAnim.current.pose = effPose;
      sendState(p.x, p.y, p.z, bodyYaw, false, false, effPose, caughtRef.current, true);
      return;
    }

    const crouch = !!k["KeyC"] || ti.crouch;
    crouchRef.current = crouch;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize();

    const move = new THREE.Vector3();
    if (!frozen) {
      if (k["KeyW"]) move.add(forward);
      if (k["KeyS"]) move.sub(forward);
      if (k["KeyD"]) move.add(right);
      if (k["KeyA"]) move.sub(right);
      if (isMobile && (ti.mx !== 0 || ti.mz !== 0)) {
        move.addScaledVector(forward, -ti.mz);
        move.addScaledVector(right, ti.mx);
      }
    }
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize();

    const speed = crouch ? CROUCH_SPEED : (k["ShiftLeft"] || k["ShiftRight"] ? RUN_SPEED : WALK_SPEED);
    tryAxisMove(p, colliders, floorSize, move.x * speed * dt, 0);
    tryAxisMove(p, colliders, floorSize, 0, move.z * speed * dt);
    resolvePenetration(p, colliders);

    if (!frozen && onGround.current && (k["Space"] || ti.jump)) {
      velY.current = JUMP_V;
      onGround.current = false;
      ti.jump = false;
    }
    velY.current += GRAVITY * dt;
    p.y += velY.current * dt;
    const eyeH = crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    // stand on top of low furniture — jump onto crates, tables, the stage!
    let supportTop = 0;
    const feet = p.y - eyeH;
    for (const w of colliders) {
      const top = w.pos[1] + w.size[1] / 2;
      if (top > 2.6 || top <= supportTop) continue;
      if (top > feet + 0.6) continue;
      if (p.x < w.pos[0] - w.size[0] / 2 - 0.1 || p.x > w.pos[0] + w.size[0] / 2 + 0.1) continue;
      if (p.z < w.pos[2] - w.size[2] / 2 - 0.1 || p.z > w.pos[2] + w.size[2] / 2 + 0.1) continue;
      supportTop = top;
    }
    const groundY = supportTop + eyeH;
    if (p.y <= groundY) { p.y = groundY; velY.current = 0; onGround.current = true; }
    else onGround.current = false;

    // camera
    if (isSeeker) {
      camera.position.copy(p);
    } else {
      placeThirdPersonCamera();
    }

    const bodyYaw = freezeYawRef.current ?? yawRef.current;
    syncSelfAnim(moving, crouch, bodyYaw);
    sendState(p.x, p.y, p.z, bodyYaw, crouch, moving, poseRef.current, caughtRef.current, false);
  });

  return null;
}

function findFreeSpot(
  x: number, z: number, colliders: WallBox[], floorSize: [number, number],
): [number, number] {
  const halfW = floorSize[0] / 2 - 1, halfD = floorSize[1] / 2 - 1;
  const blocked = (px: number, pz: number) => colliders.some((w) => {
    const top = w.pos[1] + w.size[1] / 2, bot = w.pos[1] - w.size[1] / 2;
    if (top < 0.55 || bot > 1.7) return false;
    return px > w.pos[0] - w.size[0] / 2 - 0.5 && px < w.pos[0] + w.size[0] / 2 + 0.5 &&
           pz > w.pos[2] - w.size[2] / 2 - 0.5 && pz < w.pos[2] + w.size[2] / 2 + 0.5;
  });
  if (!blocked(x, z)) return [x, z];
  for (let r = 1.5; r <= 14; r += 1.5) {
    for (let a = 0; a < 16; a++) {
      const px = Math.max(-halfW, Math.min(halfW, x + Math.cos(a / 16 * Math.PI * 2) * r));
      const pz = Math.max(-halfD, Math.min(halfD, z + Math.sin(a / 16 * Math.PI * 2) * r));
      if (!blocked(px, pz)) return [px, pz];
    }
  }
  return [x, z];
}

// 어떤 이유로든 벽 안에 들어가면 가장 가까운 면으로 밀어낸다 (뚫림 원천 차단)
function resolvePenetration(p: THREE.Vector3, walls: WallBox[]) {
  const r = PLAYER_RADIUS;
  const playerBottom = p.y - PLAYER_EYE_HEIGHT + 0.1;
  const playerTop = p.y + 0.1;
  for (let iter = 0; iter < 2; iter++) {
    let pushed = false;
    for (const w of walls) {
      const [wx, wy, wz] = w.pos; const [sx, sy, sz] = w.size;
      const maxY = wy + sy / 2, minY = wy - sy / 2;
      if (maxY < playerBottom + 0.5 || minY > playerTop) continue;
      const minX = wx - sx / 2 - r, maxX = wx + sx / 2 + r;
      const minZ = wz - sz / 2 - r, maxZ = wz + sz / 2 + r;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;
      const pushes: [number, number, number][] = [
        [p.x - minX, minX, 0], [maxX - p.x, maxX, 0],
        [p.z - minZ, 0, minZ], [maxZ - p.z, 0, maxZ],
      ];
      pushes.sort((a, b) => a[0] - b[0]);
      const [, px, pz] = pushes[0];
      if (px !== 0) p.x = px; else p.z = pz;
      pushed = true;
    }
    if (!pushed) break;
  }
}

function tryAxisMove(p: THREE.Vector3, walls: WallBox[], floorSize: [number, number], dx: number, dz: number) {
  const nx = p.x + dx; const nz = p.z + dz; const r = PLAYER_RADIUS;
  const halfW = floorSize[0] / 2 - r - 0.3;
  const halfD = floorSize[1] / 2 - r - 0.3;
  const cx = Math.max(-halfW, Math.min(halfW, nx));
  const cz = Math.max(-halfD, Math.min(halfD, nz));
  const playerY = p.y;
  const playerBottom = playerY - PLAYER_EYE_HEIGHT + 0.1;
  const playerTop = playerY + 0.1;
  for (const w of walls) {
    const [wx, wy, wz] = w.pos; const [sx, sy, sz] = w.size;
    const minY = wy - sy / 2; const maxY = wy + sy / 2;
    if (maxY < playerBottom + 0.5 || minY > playerTop) continue; // low tops are steppable
    const minX = wx - sx / 2 - r; const maxX = wx + sx / 2 + r;
    const minZ = wz - sz / 2 - r; const maxZ = wz + sz / 2 + r;
    if (cx > minX && cx < maxX && cz > minZ && cz < maxZ) return; // blocked
  }
  p.x = cx; p.z = cz;
}

// -----------------------------------------------------------------------------
// Seeker gun (paint shotgun) — first-person view model + firing
// -----------------------------------------------------------------------------

function SeekerGun({
  visible, enabled, touchInput, onFire,
}: {
  visible: boolean;
  enabled: boolean;
  touchInput: React.MutableRefObject<TouchState>;
  onFire: (targets: string[], points: [number, number, number][]) => void;
}) {
  const { camera, scene } = useThree();
  const group = useRef<THREE.Group>(null);
  const flashMesh = useRef<THREE.Mesh>(null);
  const flash = useRef(0);
  const cooldown = useRef(0);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onFireRef = useRef(onFire);
  onFireRef.current = onFire;

  const fire = useCallback(() => {
    if (!enabledRef.current || cooldown.current > 0) return;
    cooldown.current = 1.1;
    flash.current = 1;
    sfxShot();
    const targets = new Set<string>();
    const points: [number, number, number][] = [];
    const ray = new THREE.Raycaster();
    ray.far = 60;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    for (let i = 0; i < 8; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * 0.09;
      d.y += (Math.random() - 0.5) * 0.09;
      d.z += (Math.random() - 0.5) * 0.09;
      d.normalize();
      ray.set(camera.position, d);
      const hits = ray.intersectObjects(scene.children, true);
      for (const h of hits) {
        if (chainHas(h.object, "noRay")) continue;
        const pid = chainPlayerId(h.object);
        if (pid) targets.add(pid);
        points.push([h.point.x, h.point.y, h.point.z]);
        break;
      }
    }
    onFireRef.current(Array.from(targets), points);
  }, [camera, scene]);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!document.pointerLockElement) return;
      fire();
    };
    window.addEventListener("mousedown", onMouse);
    return () => window.removeEventListener("mousedown", onMouse);
  }, [fire]);

  useFrame((_, dt) => {
    if (cooldown.current > 0) cooldown.current -= dt;
    if (touchInput.current.shoot) { touchInput.current.shoot = false; fire(); }
    const g = group.current;
    if (!g) return;
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    if (flashMesh.current) {
      flash.current = Math.max(0, flash.current - dt * 6);
      flashMesh.current.scale.setScalar(Math.max(0.001, flash.current));
    }
  });

  if (!visible) return null;
  return (
    <group ref={group} userData={{ noRay: true }}>
      <mesh position={[0.32, -0.3, -0.55]} raycast={() => null}>
        <boxGeometry args={[0.11, 0.13, 0.42]} />
        <meshStandardMaterial map={getTex("paintSplat")} color="#ffffff" />
      </mesh>
      <mesh position={[0.32, -0.26, -0.95]} raycast={() => null}>
        <boxGeometry args={[0.07, 0.07, 0.55]} />
        <meshStandardMaterial map={getTex("paintSplat")} color="#e8e0d0" />
      </mesh>
      <mesh position={[0.32, -0.34, -0.8]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.05, 0.2, 10]} />
        <meshStandardMaterial color="#e83a8a" />
      </mesh>
      <mesh position={[0.32, -0.26, -1.23]} raycast={() => null}>
        <boxGeometry args={[0.08, 0.08, 0.06]} />
        <meshStandardMaterial color="#f4a83a" emissive="#f4a83a" emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={flashMesh} position={[0.32, -0.26, -1.35]} scale={0.001} raycast={() => null}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshBasicMaterial color="#fff2a0" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Remote players
// -----------------------------------------------------------------------------

function RemotePlayersRenderer({
  remoteRef, selfUserId, getPaint, caughtIds, myRole, whistlesRef,
}: {
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
  selfUserId: string;
  getPaint: (uid: string) => { canvases: PaintCanvases; textures: PaintTextures; strokes: PaintStroke[] };
  caughtIds: Set<string>;
  myRole: "hider" | "seeker" | null;
  whistlesRef: React.MutableRefObject<Record<string, number>>;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  void tick;
  const ids = Array.from(remoteRef.current.keys()).filter((id) => {
    if (id === selfUserId) return false;
    if (caughtIds.has(id)) return false;
    if (remoteRef.current.get(id)?.caught) return false;
    return true;
  });
  return (
    <>
      {ids.map((id) => (
        <Mascot key={id} userId={id} remoteRef={remoteRef} getPaint={getPaint}
          myRole={myRole} whistlesRef={whistlesRef} />
      ))}
    </>
  );
}

function Mascot({
  userId, remoteRef, getPaint, myRole, whistlesRef,
}: {
  userId: string;
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
  getPaint: (uid: string) => { textures: PaintTextures };
  myRole: "hider" | "seeker" | null;
  whistlesRef: React.MutableRefObject<Record<string, number>>;
}) {
  const group = useRef<THREE.Group>(null);
  const state = remoteRef.current.get(userId);
  const { textures } = getPaint(userId);
  const isSeekerMascot = state?.role === "seeker";
  const nameColor = isSeekerMascot ? "#ff3860" : state?.role === "hider" ? "#3ad0ff" : "#a0a0a0";
  // hunters can't read chameleon nametags
  const showName = isSeekerMascot || myRole !== "seeker";
  const whistledAt = whistlesRef.current[userId] ?? 0;
  const whistling = performance.now() - whistledAt < 2500;

  useFrame((_, dt) => {
    const s = remoteRef.current.get(userId);
    if (!s || !group.current) return;
    const g = group.current;
    const eyeH = s.crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    const feetY = Math.max(0, s.y - eyeH);
    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x += (s.x - g.position.x) * lerp;
    g.position.y += (feetY - g.position.y) * lerp;
    g.position.z += (s.z - g.position.z) * lerp;
    g.rotation.y = s.ry;
  });

  const sample = useCallback(() => {
    const s = remoteRef.current.get(userId);
    return {
      moving: !!s?.moving,
      pose: s?.pose ?? 0,
      crouch: !!s?.crouch,
      flat: !!s?.flat,
    };
  }, [remoteRef, userId]);

  const initial = state ? [state.x, 0, state.z] as [number, number, number] : [0, 0, 0] as [number, number, number];
  const scale = isSeekerMascot ? 1.25 : 0.85; // 카멜레온은 더 작게!
  return (
    <group ref={group} position={initial} scale={scale} userData={{ playerId: userId }}>
      <PlayerBody textures={textures} seeker={!!isSeekerMascot} sample={sample} />
      {whistling && (
        <Html position={[0, 2.6, 0]} center distanceFactor={12}>
          <div style={{ fontSize: 28, pointerEvents: "none" }}>🎵</div>
        </Html>
      )}
      {showName && (
        <Html position={[0, 2.25, 0]} center distanceFactor={10}>
          <div className="px-2 py-0.5 text-xs font-mono rounded" style={{
            background: "rgba(0,0,0,0.65)", color: nameColor, border: `1px solid ${nameColor}`,
            whiteSpace: "nowrap", pointerEvents: "none",
          }}>{state?.username ?? "player"}</div>
        </Html>
      )}
    </group>
  );
}

// -----------------------------------------------------------------------------
// Paint toolbar
// -----------------------------------------------------------------------------

const PALETTE = [
  "#000000", "#3a3a3a", "#7a7a7a", "#b8b8b8", "#ffffff",
  "#7a1a1a", "#e83a3a", "#f47a3a", "#f4a83a", "#f4ec3a",
  "#1a5a2a", "#3aa85a", "#3ae85c", "#a8e83a", "#d8ecd4",
  "#1a3a6a", "#3a5ce8", "#3ac8e8", "#8ecdf2", "#cfe4f2",
  "#4a1a6a", "#a03ae8", "#e83aa0", "#f6bcd6", "#e4dcf2",
  "#5a3a1a", "#8b5a2b", "#c9963f", "#c9a878", "#f2e8d8",
];

function PaintToolbar({
  color, size, onColor, onSize, onClear, onClose,
}: {
  color: string; size: number;
  onColor: (c: string) => void; onSize: (n: number) => void;
  onClear: () => void; onClose: () => void;
}) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-black/80 backdrop-blur border border-white/10 rounded-xl px-4 py-3 flex items-center gap-4 text-white shadow-2xl">
      <div className="grid grid-cols-10 gap-1">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => onColor(c)}
            className={`w-6 h-6 rounded border-2 ${color === c ? "border-white scale-110" : "border-white/20"}`}
            style={{ background: c }} aria-label={c} />
        ))}
      </div>
      <label className="flex flex-col items-center gap-0.5 cursor-pointer">
        <input type="color" value={color} onChange={(e) => onColor(e.target.value)}
          className="w-9 h-8 rounded bg-transparent cursor-pointer" />
        <span className="text-[9px] text-white/60">색상판</span>
      </label>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/60">굵기</span>
        <input type="range" min={2} max={40} value={size} onChange={(e) => onSize(Number(e.target.value))} className="w-24" />
        <span className="tabular-nums w-6">{size}</span>
      </div>
      <span className="text-[10px] text-white/50">우클릭 드래그 = 회전</span>
      <Button size="sm" variant="outline" onClick={onClear}>지우기</Button>
      <Button size="sm" onClick={onClose}>완료 (P)</Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HUD
// -----------------------------------------------------------------------------

function PersonIcon({ c }: { c: string }) {
  return (
    <svg width="15" height="21" viewBox="0 0 14 20" style={{ display: "block" }}>
      <circle cx="7" cy="3.6" r="3.3" fill={c} />
      <path d="M1.4 20 v-6.6 a5.6 5.6 0 0 1 11.2 0 V20 z" fill={c} />
    </svg>
  );
}

function Hud({
  code, role, username, alive, total, seekers, locked, paintMode, phase, remaining, scheme, onSchemeChange, bodyColor, isSeeker, picking,
}: {
  code: string; role: "hider" | "seeker" | null; username: string;
  alive: number; total: number; seekers: number;
  locked: boolean; paintMode: boolean; phase: Phase; remaining: number;
  scheme: ControlScheme; onSchemeChange: (s: ControlScheme) => void;
  bodyColor: string; isSeeker: boolean; picking: boolean;
}) {
  const roleColor = role === "seeker" ? "text-[#ff3860]" : role === "hider" ? "text-[#3ad0ff]" : "text-muted-foreground";
  const roleLabel = role === "seeker" ? "헌터" : role === "hider" ? "카멜레온" : "관전";
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const phaseColor = phase === "seek" ? "text-[#ff3860]" : phase === "hide" ? "text-[#3ad0ff]" : "text-[#f4ec3a]";

  return (
    <>
      <div className="pointer-events-none fixed top-3 left-3 z-30 flex items-center gap-3 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10 text-white text-xs font-mono">
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Room</div><div className="text-primary">{code}</div></div>
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Player</div><div>{username}</div></div>
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Role</div><div className={roleColor}>{roleLabel}</div></div>
      </div>

      <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
        <div className={`text-5xl font-black tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ${phaseColor}`}>
          {mm}:{ss}
        </div>
        <div className="text-sm text-white font-semibold tracking-widest drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {phase === "hide" ? "찾기 시작까지" : PHASE_LABEL[phase]}
        </div>
        {/* meccha-style status row: white chameleons ⏳ red hunters */}
        <div className="mt-1 flex items-center gap-2 bg-black/45 backdrop-blur px-3 py-1.5 rounded-full border border-white/10">
          <div className="flex gap-0.5">
            {Array.from({ length: Math.min(total, 16) }, (_, i) => (
              <PersonIcon key={i} c={i < alive ? "#ffffff" : "#4a4a52"} />
            ))}
          </div>
          <span className="text-lg leading-none">⏳</span>
          <div className="flex gap-0.5">
            {Array.from({ length: Math.min(seekers, 6) }, (_, i) => (
              <PersonIcon key={i} c="#ff3860" />
            ))}
          </div>
        </div>
      </div>

      <div className="pointer-events-auto fixed top-3 right-3 z-30 flex items-center gap-2">
        <div className="flex bg-black/50 backdrop-blur border border-white/10 rounded overflow-hidden text-xs">
          <button onClick={() => onSchemeChange("pc")} className={`px-2 py-1 ${scheme === "pc" ? "bg-white text-black" : "text-white/70"}`}>PC</button>
          <button onClick={() => onSchemeChange("mobile")} className={`px-2 py-1 ${scheme === "mobile" ? "bg-white text-black" : "text-white/70"}`}>모바일</button>
        </div>
      </div>

      {!isSeeker && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-30 flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10">
          <div className="w-8 h-8 rounded-full border-2 border-white/60" style={{ background: bodyColor }} />
          <div className="text-white text-xs leading-tight">
            <div className="font-bold">위장 색</div>
            <div className="text-white/60">E 추출 · F 칠하기</div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed bottom-4 right-4 z-30 text-white text-right">
        <div className="text-xs uppercase tracking-widest text-white/60">남은 카멜레온</div>
        <div className="text-6xl font-black leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" style={{ fontFamily: "Georgia, serif" }}>
          {alive}
        </div>
      </div>

      {!paintMode && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          {isSeeker
            ? <div className="w-6 h-6 rounded-full border-2 border-[#ff3860]/80 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-[#ff3860]" />
              </div>
            : <div className="w-2 h-2 rounded-full border border-white/70" />}
        </div>
      )}

      {!locked && !paintMode && !picking && scheme === "pc" && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="bg-black/70 backdrop-blur px-6 py-4 rounded border border-white/10 text-center text-white">
            <div className="text-lg font-bold tracking-widest">클릭해서 시작</div>
            <div className="mt-2 text-xs text-white/70 leading-relaxed">
              WASD 이동 · Shift 달리기 · Space 점프 · C 앉기<br/>
              {isSeeker
                ? <><span className="text-[#ff3860]">좌클릭 — 페인트 샷건 발사!</span> · <span className="text-[#3ad0ff]">P</span> 내 몸 그리기</>
                : <>
                    <span className="text-[#3ad0ff]">E</span> 색 추출 · <span className="text-[#3ad0ff]">F</span> 몸 전체 칠하기 · <span className="text-[#3ad0ff]">P</span> 정밀 그리기<br/>
                    <span className="text-[#f4ec3a]">Q</span> 벽·바닥 붙기 · <span className="text-[#f4ec3a]">R</span> 포즈 · <span className="text-[#f4ec3a]">우클릭(꾹)</span> 몸 회전 고정 · <span className="text-[#f4ec3a]">1</span> 휘파람
                  </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// -----------------------------------------------------------------------------
// Touch controls (mobile)
// -----------------------------------------------------------------------------

function TouchControls({
  touchInput, onPaint, isSeeker,
}: {
  touchInput: React.MutableRefObject<TouchState>;
  onPaint: () => void;
  isSeeker: boolean;
}) {
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookPrev = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const stick = stickRef.current!;
    const knob = knobRef.current!;
    const R = 48;

    const onDown = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const el = t.target as HTMLElement | null;
        if (el && typeof el.closest === "function" && el.closest("button")) continue;
        const rect = stick.getBoundingClientRect();
        if (t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom) {
          stickId.current = t.identifier;
        } else if (t.clientX > window.innerWidth / 2) {
          if (lookId.current === null) {
            lookId.current = t.identifier;
            lookPrev.current = { x: t.clientX, y: t.clientY };
          }
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId.current) {
          const rect = stick.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          let dx = t.clientX - cx; let dy = t.clientY - cy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          touchInput.current.mx = dx / R;
          touchInput.current.mz = dy / R;
        } else if (t.identifier === lookId.current && lookPrev.current) {
          const dx = t.clientX - lookPrev.current.x;
          const dy = t.clientY - lookPrev.current.y;
          touchInput.current.lookX += dx * 0.005;
          touchInput.current.lookY += dy * 0.005;
          lookPrev.current = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onUp = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId.current) {
          stickId.current = null;
          knob.style.transform = "translate(0,0)";
          touchInput.current.mx = 0; touchInput.current.mz = 0;
        }
        if (t.identifier === lookId.current) {
          lookId.current = null; lookPrev.current = null;
        }
      }
    };
    window.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp, { passive: true });
    window.addEventListener("touchcancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      window.removeEventListener("touchcancel", onUp);
    };
  }, [touchInput]);

  return (
    <>
      <div ref={stickRef} className="fixed bottom-6 left-6 z-30 w-32 h-32 rounded-full bg-white/10 border border-white/30 backdrop-blur touch-none">
        <div ref={knobRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/70 border border-white/50 shadow" />
      </div>
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-2 items-end">
        {isSeeker ? (
          <button onClick={() => { touchInput.current.shoot = true; }}
            className="w-20 h-20 rounded-full bg-[#ff3860] text-white text-sm font-black shadow-lg touch-none">발사</button>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={() => { touchInput.current.pick = true; }}
                className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">스포이드</button>
              <button onClick={() => { touchInput.current.fill = true; }}
                className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">칠하기</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { touchInput.current.stick = true; }}
                className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">벽붙기</button>
              <button onClick={() => { touchInput.current.whistle = true; }}
                className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">🎵</button>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <button onClick={() => { touchInput.current.jump = true; }}
            className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">점프</button>
          <button onTouchStart={() => { touchInput.current.crouch = true; }} onTouchEnd={() => { touchInput.current.crouch = false; }}
            className="w-14 h-14 rounded-full bg-white/20 border border-white/40 text-white text-[10px] font-bold backdrop-blur touch-none">앉기</button>
        </div>
        <button onClick={onPaint}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow-lg touch-none">그리기</button>
      </div>
    </>
  );
}
