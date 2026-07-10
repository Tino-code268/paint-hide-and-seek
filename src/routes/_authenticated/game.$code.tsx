import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  MAPS, type MapDef, type WallBox, type Prop,
  PLAYER_EYE_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS,
} from "@/game/maps";
import {
  usePresence, type PlayerState, type PaintStroke, type BodyPart, type ShotEvent,
} from "@/game/usePresence";
import {
  CANVAS_SIZE, BODY_PARTS,
  createPaintCanvases, applyStroke, resetCanvases,
  type PaintCanvases, type PaintTextures,
} from "@/game/bodyPaint";
import { MAP_TEXTURES, loadTiledTexture } from "@/game/textures";
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

      setMe({
        role: (mine.role as "hider" | "seeker" | null) ?? null,
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

  const mapDef = MAPS[room.map_name] ?? MAPS.restaurant;
  return <GameScene room={room} mapDef={mapDef} me={me} selfUserId={user.id} />;
}

// -----------------------------------------------------------------------------
// Phase (client-side timer) — meccha style: 10s ready / 120s hide / 400s seek
// -----------------------------------------------------------------------------

type Phase = "prep" | "hide" | "seek" | "end";
const PHASE_LABEL: Record<Phase, string> = {
  prep: "준비",
  hide: "숨는 시간",
  seek: "찾는 시간",
  end: "게임 종료",
};
// 10s ready → 120s hide → 400s seek. Derived from the room's started_at so
// every player (and anyone who refreshes) sees the same synchronized clock.
const PREP_END = 10, HIDE_END = 130, SEEK_END = 530;

function computePhase(startedAt: number): { phase: Phase; remaining: number } {
  const el = Math.max(0, (Date.now() - startedAt) / 1000);
  if (el < PREP_END) return { phase: "prep", remaining: Math.ceil(PREP_END - el) };
  if (el < HIDE_END) return { phase: "hide", remaining: Math.ceil(HIDE_END - el) };
  if (el < SEEK_END) return { phase: "seek", remaining: Math.ceil(SEEK_END - el) };
  return { phase: "end", remaining: 0 };
}

function useGamePhase(startedAt: number) {
  const [state, setState] = useState(() => computePhase(startedAt));
  const forcedRef = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (forcedRef.current) return;
      setState((prev) => {
        const next = computePhase(startedAt);
        return next.phase === prev.phase && next.remaining === prev.remaining ? prev : next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [startedAt]);
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

// Sample the color of whatever the crosshair hits (texture pixel or material color)
const imgCanvasCache = new WeakMap<object, CanvasRenderingContext2D>();

function sampleHitColor(hit: THREE.Intersection): string | null {
  const obj = hit.object as THREE.Mesh;
  if (!obj.material) return null;
  const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
  const map = mat.map as THREE.Texture | null;
  const img = map?.image as (HTMLImageElement | HTMLCanvasElement | undefined);
  if (map && img && img.width > 0 && hit.uv) {
    try {
      let ctx = imgCanvasCache.get(img);
      if (!ctx) {
        const cv = document.createElement("canvas");
        cv.width = img.width; cv.height = img.height;
        ctx = cv.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        imgCanvasCache.set(img, ctx);
      }
      const u = (((hit.uv.x * map.repeat.x) % 1) + 1) % 1;
      const v = (((hit.uv.y * map.repeat.y) % 1) + 1) % 1;
      const px = Math.min(img.width - 1, Math.floor(u * img.width));
      const py = Math.min(img.height - 1, Math.floor((1 - v) * img.height));
      const d = ctx.getImageData(px, py, 1, 1).data;
      return "#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
    } catch {
      // canvas tainted by CORS — fall through to material color
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

function GameScene({
  room, mapDef, me, selfUserId,
}: {
  room: RoomData; mapDef: MapDef; me: MyPlayer; selfUserId: string;
}) {
  const [locked, setLocked] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [scheme, setScheme] = useState<ControlScheme>(() => getControlScheme());
  const startedAtMs = useMemo(
    () => room.started_at ? new Date(room.started_at).getTime() : Date.now(),
    [room.started_at],
  );
  const { phase, remaining, endNow } = useGamePhase(startedAtMs);

  // shared live player position (for the paint-mode mascot)
  const playerPosRef = useRef<THREE.Vector3 | null>(null);

  const touchInput = useRef<TouchState>({
    mx: 0, mz: 0, lookX: 0, lookY: 0,
    jump: false, crouch: false,
    pick: false, fill: false, whistle: false, stick: false, shoot: false,
  });

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
  const [myCaught, setMyCaught] = useState(false);
  const myCaughtRef = useRef(false);
  myCaughtRef.current = myCaught;
  const [caughtIds, setCaughtIds] = useState<Set<string>>(() => new Set());
  const caughtIdsRef = useRef(caughtIds);
  caughtIdsRef.current = caughtIds;
  const [splats, setSplats] = useState<Splat[]>([]);
  const splatSeq = useRef(0);
  const whistlesRef = useRef<Record<string, number>>({});
  const [aliveInfo, setAliveInfo] = useState({ alive: 0, total: 0 });
  const [gameResult, setGameResult] = useState<null | "seeker" | "hider">(null);

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
      setCaughtIds((prev) => {
        const next = new Set(prev);
        for (const t of e.targets) next.add(t);
        return next;
      });
      if (e.targets.includes(selfUserId)) setMyCaught(true);
    }
  }, [addSplats, selfUserId]);

  const handleRemotePaint = useCallback((s: PaintStroke) => {
    const entry = getOrCreatePaint(s.userId);
    entry.strokes.push(s);
    applyStroke(entry.canvases, entry.textures, s);
  }, [getOrCreatePaint]);

  const handleRemoteWhistle = useCallback((uid: string) => {
    whistlesRef.current[uid] = performance.now();
    sfxWhistle();
  }, []);

  const { remoteRef, sendState, sendPaint, sendShot, sendWhistle } = usePresence(
    room.id, selfUserId, { username: me.username, role: me.role },
    {
      onPaint: handleRemotePaint,
      onShot: (e) => applyShot(e, false),
      onWhistle: handleRemoteWhistle,
      getMyStrokes: () => paintStoreRef.current.get(selfUserId)?.strokes ?? [],
    },
  );

  // ---- alive hider tracking + win check ----
  useEffect(() => {
    const t = setInterval(() => {
      const hiders = new Set<string>();
      if (me.role === "hider") hiders.add(selfUserId);
      for (const [uid, st] of remoteRef.current) {
        if (st.role === "hider") hiders.add(uid);
      }
      let alive = 0;
      for (const uid of hiders) {
        const caught = caughtIdsRef.current.has(uid) ||
          (uid === selfUserId ? myCaughtRef.current : !!remoteRef.current.get(uid)?.caught);
        if (!caught) alive++;
      }
      setAliveInfo({ alive, total: hiders.size });
    }, 500);
    return () => clearInterval(t);
  }, [me.role, selfUserId, remoteRef]);

  // seeker catches everyone → game over early
  useEffect(() => {
    if (phase === "seek" && aliveInfo.total > 0 && aliveInfo.alive === 0 && !gameResult) {
      setGameResult("seeker");
      endNow();
    }
  }, [phase, aliveInfo, gameResult, endNow]);

  // timer ran out → survivors win
  useEffect(() => {
    if (phase === "end" && !gameResult) {
      setGameResult(aliveInfo.alive > 0 ? "hider" : "seeker");
    }
  }, [phase, gameResult, aliveInfo.alive]);

  // free the mouse so the result screen buttons are clickable
  useEffect(() => {
    if (gameResult && document.pointerLockElement) document.exitPointerLock();
  }, [gameResult]);

  const spawn = mapDef.spawnPoints[me.spawnIndex % mapDef.spawnPoints.length];

  // P toggles paint mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyP") { e.preventDefault(); setPaintMode((m) => !m); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (paintMode && document.pointerLockElement) document.exitPointerLock();
  }, [paintMode]);

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
  }, [getOrCreatePaint, selfUserId]);

  // E — eyedropper picked a color
  const handleEyedrop = useCallback((color: string) => {
    setBodyColor(color);
    setBrushColor(color);
    sfxPick();
  }, []);

  // F — paint whole body with the picked color (meccha camouflage!)
  const fillSelf = useCallback(() => {
    const entry = getOrCreatePaint(selfUserId);
    const color = bodyColorRef.current;
    for (const part of BODY_PARTS) {
      const stroke: PaintStroke = { userId: selfUserId, part, x: 0, y: 0, size: 0, color, fill: true };
      entry.strokes.push(stroke);
      applyStroke(entry.canvases, entry.textures, stroke);
      sendPaint({ part, x: 0, y: 0, size: 0, color, fill: true });
    }
    sfxFill();
  }, [getOrCreatePaint, selfUserId, sendPaint]);

  // 1 — whistle
  const handleSelfWhistle = useCallback(() => {
    if (myCaughtRef.current) return;
    sendWhistle();
    sfxWhistle();
  }, [sendWhistle]);

  // seeker fired
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
  const isSeeker = me.role === "seeker";

  // freeze rules: everyone in prep, seeker while hiders hide, everyone at end
  const frozen = phase === "prep" || (phase === "hide" && isSeeker) || phase === "end";
  const seekerBlind = isSeeker && (phase === "prep" || phase === "hide");
  const canShoot = isSeeker && phase === "seek" && !paintMode && gameResult === null;

  return (
    <div className="fixed inset-0 bg-black select-none">
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: spawn }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[mapDef.skyColor]} />
        <fog attach="fog" args={[mapDef.skyColor, mapDef.fogNear, mapDef.fogFar]} />
        <ambientLight intensity={0.85} color={mapDef.ambientColor} />
        <hemisphereLight args={[mapDef.skyColor, mapDef.groundColor, 0.6]} />
        <directionalLight position={[40, 60, 25]} intensity={1.2} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-80} shadow-camera-right={80}
          shadow-camera-top={80} shadow-camera-bottom={-80}
          shadow-camera-far={200} shadow-bias={-0.0005} />

        <Floor mapDef={mapDef} />
        <Walls mapDef={mapDef} />
        <Props props={mapDef.props} />
        <Splats splats={splats} />

        <RemotePlayersRenderer
          remoteRef={remoteRef}
          selfUserId={selfUserId}
          getPaint={getOrCreatePaint}
          caughtIds={caughtIds}
          myRole={me.role}
          whistlesRef={whistlesRef}
        />

        {paintMode && (
          <SelfMascot
            spawn={spawn}
            posRef={playerPosRef}
            textures={getOrCreatePaint(selfUserId).textures}
            onPaint={applyLocalStroke}
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
          onEyedrop={handleEyedrop}
          onFill={fillSelf}
          onWhistle={handleSelfWhistle}
          sharedPos={playerPosRef}
        />

        <SeekerGun
          visible={isSeeker}
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
        role={me.role}
        username={me.username}
        alive={aliveInfo.alive}
        total={aliveInfo.total}
        locked={locked}
        paintMode={paintMode}
        phase={phase}
        remaining={remaining}
        scheme={scheme}
        onSchemeChange={setScheme}
        bodyColor={bodyColor}
        isSeeker={isSeeker}
      />

      {/* ===== overlays ===== */}
      {phase === "prep" && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="text-center">
            <div className={`text-2xl font-bold tracking-widest ${isSeeker ? "text-[#ff3860]" : "text-[#3ad0ff]"}`}>
              {isSeeker ? "너는 헌터! 🔫" : "너는 카멜레온! 🦎"}
            </div>
            <div className="mt-3 text-7xl font-black text-white tabular-nums drop-shadow-lg">{remaining}</div>
            <div className="mt-3 text-sm text-white/80 leading-relaxed">
              {isSeeker
                ? <>카멜레온들이 숨는 120초 동안 기다렸다가<br/>좌클릭 샷건으로 전부 찾아내자!</>
                : <>E로 주변 색을 추출하고 F로 몸을 칠해서<br/>배경에 완벽하게 녹아들자!</>}
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
              {gameResult === "hider" ? "끝까지 살아남았다!" : "전원 검거 완료!"}
            </div>
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
// Environment (textured)
// -----------------------------------------------------------------------------

function Floor({ mapDef }: { mapDef: MapDef }) {
  const [w, d] = mapDef.floorSize;
  const texUrl = MAP_TEXTURES[mapDef.name]?.floor;
  const tex = useMemo(() => texUrl ? loadTiledTexture(texUrl, Math.round(w / 4), Math.round(d / 4)) : null, [texUrl, w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow userData={{ wallMesh: false }}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : mapDef.floorColor} roughness={0.85} />
    </mesh>
  );
}

function Walls({ mapDef }: { mapDef: MapDef }) {
  const texUrl = MAP_TEXTURES[mapDef.name]?.wall;
  const wallTex = useMemo(() => texUrl ? loadTiledTexture(texUrl, 2, 2) : null, [texUrl]);
  return (
    <>
      {mapDef.walls.map((w, i) => {
        // Only apply wall texture to the largest walls (outer/major partitions).
        const [sx, , sz] = w.size;
        const isBig = !w.noTex && Math.max(sx, sz) > 6;
        return (
          <mesh key={i} position={w.pos} castShadow={!w.noCollide} receiveShadow
            userData={{ wallMesh: !w.noCollide }}>
            <boxGeometry args={w.size} />
            <meshStandardMaterial
              map={isBig ? wallTex ?? undefined : undefined}
              color={isBig && wallTex ? "#ffffff" : (w.color ?? "#556677")}
              roughness={0.8}
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
// Local player + camera
// -----------------------------------------------------------------------------

const GRAVITY = -22;
const JUMP_V = 8;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const CROUCH_SPEED = 2.4;

function LocalPlayer({
  spawn, walls, props, floorSize, sendState, paintMode, touchInput, isMobile,
  frozen, caught, onEyedrop, onFill, onWhistle, sharedPos,
}: {
  spawn: [number, number, number];
  walls: WallBox[]; props: Prop[]; floorSize: [number, number];
  sendState: (x: number, y: number, z: number, ry: number, crouch: boolean, moving: boolean, pose: number, caught: boolean) => void;
  paintMode: boolean;
  touchInput: React.MutableRefObject<TouchState>;
  isMobile: boolean;
  frozen: boolean;
  caught: boolean;
  onEyedrop: (color: string) => void;
  onFill: () => void;
  onWhistle: () => void;
  sharedPos: React.MutableRefObject<THREE.Vector3 | null>;
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

  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const caughtRef = useRef(caught);
  caughtRef.current = caught;
  const paintModeRef = useRef(paintMode);
  paintModeRef.current = paintMode;

  // Third-person camera anchor when in paint mode
  const paintAngle = useRef({ yaw: 0, dist: 3.2 });

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
    camera.position.set(spawn[0], spawn[1], spawn[2]);
  }, [camera, spawn]);

  useEffect(() => { sharedPos.current = posRef.current; }, [sharedPos]);

  // Paint mode: right-drag to orbit around your body
  useEffect(() => {
    if (!paintMode) return;
    const onMove = (e: PointerEvent) => {
      if (e.buttons & 2) paintAngle.current.yaw += e.movementX * 0.008;
    };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, [paintMode]);

  // --- special actions (raycast-based) ---
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const eyedrop = useCallback(() => {
    if (caughtRef.current || paintModeRef.current) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 30;
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (chainHas(h.object, "noRay")) continue;
      const color = sampleHitColor(h);
      if (color) { onEyedrop(color); return; }
    }
  }, [camera, scene, raycaster, onEyedrop]);

  const toggleStick = useCallback(() => {
    if (frozenRef.current || paintModeRef.current) return;
    if (stuckRef.current) { stuckRef.current = false; return; }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.set(camera.position, dir);
    raycaster.far = 2.4;
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (chainHas(h.object, "noRay")) continue;
      if (!chainHas(h.object, "wallMesh")) continue;
      const n = h.face
        ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
        : dir.clone().negate();
      n.y = 0;
      if (n.lengthSq() < 0.01) continue; // floor/ceiling face — can't stick
      n.normalize();
      const p = posRef.current;
      // press flat against the wall (just outside the collider so unsticking is safe)
      p.x = h.point.x + n.x * (PLAYER_RADIUS + 0.05);
      p.z = h.point.z + n.z * (PLAYER_RADIUS + 0.05);
      velY.current = 0;
      stuckRef.current = true;
      return;
    }
  }, [camera, scene, raycaster]);

  const actionsRef = useRef({ eyedrop, toggleStick, onFill, onWhistle });
  actionsRef.current = { eyedrop, toggleStick, onFill, onWhistle };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.repeat) return;
      if (e.code === "KeyE") actionsRef.current.eyedrop();
      if (e.code === "KeyF" && !caughtRef.current && !paintModeRef.current) actionsRef.current.onFill();
      if (e.code === "KeyQ") actionsRef.current.toggleStick();
      if (e.code === "KeyR") poseRef.current = (poseRef.current + 1) % 3;
      if (e.code === "Digit1" && !caughtRef.current) actionsRef.current.onWhistle();
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = posRef.current;
    const ti = touchInput.current;

    // mobile action buttons
    if (ti.pick) { ti.pick = false; actionsRef.current.eyedrop(); }
    if (ti.fill) { ti.fill = false; if (!caughtRef.current && !paintModeRef.current) actionsRef.current.onFill(); }
    if (ti.whistle) { ti.whistle = false; if (!caughtRef.current) actionsRef.current.onWhistle(); }
    if (ti.stick) { ti.stick = false; actionsRef.current.toggleStick(); }

    // Paint mode: orbit camera around self, freeze locomotion.
    if (paintMode) {
      const yaw = paintAngle.current.yaw;
      const dist = paintAngle.current.dist;
      camera.position.set(
        p.x + Math.sin(yaw) * dist,
        p.y + 0.4,
        p.z + Math.cos(yaw) * dist,
      );
      camera.lookAt(p.x, p.y - 0.2, p.z);
      sendState(p.x, p.y, p.z, yawRef.current, crouchRef.current, false, poseRef.current, caughtRef.current);
      return;
    }

    // Mobile look integration
    if (isMobile) {
      yawRef.current -= ti.lookX;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitchRef.current - ti.lookY));
      ti.lookX = 0;
      ti.lookY = 0;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
      camera.quaternion.copy(q);
    }

    const k = keys.current;

    // Wall stick: frozen in place, look allowed. Space breaks off.
    if (stuckRef.current) {
      if (k["Space"] || ti.jump) { stuckRef.current = false; ti.jump = false; }
      camera.position.copy(p);
      if (!isMobile) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        yawRef.current = euler.y;
      }
      sendState(p.x, p.y, p.z, yawRef.current, true, false, poseRef.current, caughtRef.current);
      return;
    }

    const crouch = !!k["KeyC"] || ti.crouch;
    crouchRef.current = crouch;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

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
    const dx = move.x * speed * dt;
    const dz = move.z * speed * dt;

    tryAxisMove(p, colliders, floorSize, dx, 0);
    tryAxisMove(p, colliders, floorSize, 0, dz);

    if (!frozen && onGround.current && (k["Space"] || ti.jump)) {
      velY.current = JUMP_V;
      onGround.current = false;
      ti.jump = false;
    }
    velY.current += GRAVITY * dt;
    p.y += velY.current * dt;
    const eyeH = crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    // stand on top of low objects (crates, tables, the stage...) — jump up there!
    let supportTop = 0;
    const feet = p.y - eyeH;
    for (const w of colliders) {
      const top = w.pos[1] + w.size[1] / 2;
      if (top > 2.6 || top <= supportTop) continue;   // too tall / lower than current support
      if (top > feet + 0.6) continue;                  // too high above our feet
      if (p.x < w.pos[0] - w.size[0] / 2 - 0.1 || p.x > w.pos[0] + w.size[0] / 2 + 0.1) continue;
      if (p.z < w.pos[2] - w.size[2] / 2 - 0.1 || p.z > w.pos[2] + w.size[2] / 2 + 0.1) continue;
      supportTop = top;
    }
    const groundY = supportTop + eyeH;
    if (p.y <= groundY) { p.y = groundY; velY.current = 0; onGround.current = true; }
    else onGround.current = false;

    camera.position.copy(p);

    if (!isMobile) {
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yawRef.current = euler.y;
    }
    sendState(p.x, p.y, p.z, yawRef.current, crouch, moving, poseRef.current, caughtRef.current);
  });

  return null;
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
    // objects whose top is near our feet don't block — we're standing on them
    if (maxY < playerBottom + 0.5 || minY > playerTop) continue;
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
      if (!document.pointerLockElement) return; // only when aiming in-game
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
      {/* stock + body */}
      <mesh position={[0.32, -0.3, -0.55]} raycast={() => null}>
        <boxGeometry args={[0.11, 0.13, 0.42]} />
        <meshStandardMaterial color="#2a2a32" />
      </mesh>
      {/* barrel */}
      <mesh position={[0.32, -0.26, -0.95]} raycast={() => null}>
        <boxGeometry args={[0.07, 0.07, 0.55]} />
        <meshStandardMaterial color="#3a3a44" />
      </mesh>
      {/* pump (paint tank) */}
      <mesh position={[0.32, -0.34, -0.8]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.05, 0.2, 10]} />
        <meshStandardMaterial color="#e83a8a" />
      </mesh>
      {/* orange tip */}
      <mesh position={[0.32, -0.26, -1.23]} raycast={() => null}>
        <boxGeometry args={[0.08, 0.08, 0.06]} />
        <meshStandardMaterial color="#f4a83a" emissive="#f4a83a" emissiveIntensity={0.5} />
      </mesh>
      {/* muzzle flash */}
      <mesh ref={flashMesh} position={[0.32, -0.26, -1.35]} scale={0.001} raycast={() => null}>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshBasicMaterial color="#fff2a0" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Self mascot (rendered only in paint mode) — supports in-world painting via raycast uv
// -----------------------------------------------------------------------------

function SelfMascot({
  spawn, posRef, textures, onPaint,
}: {
  spawn: [number, number, number];
  posRef: React.MutableRefObject<THREE.Vector3 | null>;
  textures: PaintTextures;
  onPaint: (part: BodyPart, x: number, y: number, from?: { x: number; y: number }) => void;
}) {
  const drawingRef = useRef(false);
  const lastRef = useRef<Record<BodyPart, { x: number; y: number } | null>>({
    head: null, torso: null, armL: null, armR: null, legL: null, legR: null,
  });

  const handlePointer = (part: BodyPart) => (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    e.stopPropagation();
    if (e.type === "pointerdown") {
      drawingRef.current = true;
      lastRef.current[part] = null;
    }
    if (e.type === "pointerup" || e.type === "pointerleave") {
      drawingRef.current = false;
      lastRef.current[part] = null;
      return;
    }
    if (e.type === "pointermove" && !drawingRef.current) return;
    const x = e.uv.x * CANVAS_SIZE;
    // flip Y for texture space
    const y = (1 - e.uv.y) * CANVAS_SIZE;
    const from = lastRef.current[part] ?? undefined;
    onPaint(part, x, y, from);
    lastRef.current[part] = { x, y };
  };

  useEffect(() => {
    const up = () => { drawingRef.current = false; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  // stand at the player's CURRENT position, not the spawn point
  const x = posRef.current?.x ?? spawn[0];
  const z = posRef.current?.z ?? spawn[2];
  return (
    <group position={[x, 0, z]}>
      {/* Legs */}
      <mesh position={[-0.18, 0.45, 0]} castShadow
        onPointerDown={handlePointer("legL")} onPointerMove={handlePointer("legL")} onPointerUp={handlePointer("legL")}>
        <cylinderGeometry args={[0.14, 0.14, 0.9, 16]} />
        <meshStandardMaterial map={textures.legL} color="#ffffff" />
      </mesh>
      <mesh position={[0.18, 0.45, 0]} castShadow
        onPointerDown={handlePointer("legR")} onPointerMove={handlePointer("legR")} onPointerUp={handlePointer("legR")}>
        <cylinderGeometry args={[0.14, 0.14, 0.9, 16]} />
        <meshStandardMaterial map={textures.legR} color="#ffffff" />
      </mesh>
      {/* Torso (chubby) */}
      <mesh position={[0, 1.1, 0]} castShadow
        onPointerDown={handlePointer("torso")} onPointerMove={handlePointer("torso")} onPointerUp={handlePointer("torso")}>
        <sphereGeometry args={[0.42, 24, 20]} />
        <meshStandardMaterial map={textures.torso} color="#ffffff" />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.45, 1.15, 0]} castShadow
        onPointerDown={handlePointer("armL")} onPointerMove={handlePointer("armL")} onPointerUp={handlePointer("armL")}>
        <cylinderGeometry args={[0.11, 0.11, 0.75, 14]} />
        <meshStandardMaterial map={textures.armL} color="#ffffff" />
      </mesh>
      <mesh position={[0.45, 1.15, 0]} castShadow
        onPointerDown={handlePointer("armR")} onPointerMove={handlePointer("armR")} onPointerUp={handlePointer("armR")}>
        <cylinderGeometry args={[0.11, 0.11, 0.75, 14]} />
        <meshStandardMaterial map={textures.armR} color="#ffffff" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.85, 0]} castShadow
        onPointerDown={handlePointer("head")} onPointerMove={handlePointer("head")} onPointerUp={handlePointer("head")}>
        <sphereGeometry args={[0.36, 28, 24]} />
        <meshStandardMaterial map={textures.head} color="#ffffff" />
      </mesh>
      {/* Face */}
      <FaceFeatures y={1.9} />
    </group>
  );
}

function FaceFeatures({ y }: { y: number }) {
  return (
    <group>
      <mesh position={[-0.11, y, -0.33]}><sphereGeometry args={[0.035, 10, 10]} /><meshBasicMaterial color="#111" /></mesh>
      <mesh position={[ 0.11, y, -0.33]}><sphereGeometry args={[0.035, 10, 10]} /><meshBasicMaterial color="#111" /></mesh>
      {/* Smile — a small torus rotated to form a curve */}
      <mesh position={[0, y - 0.11, -0.32]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.09, 0.015, 8, 20, Math.PI]} />
        <meshBasicMaterial color="#111" />
      </mesh>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Remote mascots
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
    if (caughtIds.has(id)) return false;               // caught → ghost, invisible
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
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const swingRef = useRef(0);
  const state = remoteRef.current.get(userId);
  const { textures } = getPaint(userId);
  const isSeekerMascot = state?.role === "seeker";
  const nameColor = isSeekerMascot ? "#ff3860" : state?.role === "hider" ? "#3ad0ff" : "#a0a0a0";
  // Hunters can't read chameleon nametags — that would ruin the camouflage!
  const showName = isSeekerMascot || myRole !== "seeker";
  const whistledAt = whistlesRef.current[userId] ?? 0;
  const whistling = performance.now() - whistledAt < 2500;

  useFrame((_, dt) => {
    const s = remoteRef.current.get(userId);
    if (!s || !group.current) return;
    const g = group.current;
    const baseY = s.crouch ? 0.4 : 0.0;
    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x += (s.x - g.position.x) * lerp;
    g.position.y += (baseY - g.position.y) * lerp;
    g.position.z += (s.z - g.position.z) * lerp;
    g.rotation.y = s.ry;
    const target = s.moving ? 1 : 0;
    swingRef.current += ((target - swingRef.current) * Math.min(1, dt * 8));
    const t = performance.now() * 0.008;
    const amp = 0.6 * swingRef.current;
    const pose = s.pose ?? 0;
    if (pose === 1) {
      // arms up! (만세)
      if (armL.current) { armL.current.rotation.x = 0; armL.current.rotation.z = 2.6; }
      if (armR.current) { armR.current.rotation.x = 0; armR.current.rotation.z = -2.6; }
      if (legL.current) legL.current.rotation.x = 0;
      if (legR.current) legR.current.rotation.x = 0;
    } else if (pose === 2) {
      // statue pose — perfectly still
      if (armL.current) { armL.current.rotation.x = 0; armL.current.rotation.z = 0.15; }
      if (armR.current) { armR.current.rotation.x = 0; armR.current.rotation.z = -0.15; }
      if (legL.current) legL.current.rotation.x = 0;
      if (legR.current) legR.current.rotation.x = 0;
    } else {
      if (armL.current) { armL.current.rotation.z = 0; armL.current.rotation.x =  Math.sin(t) * amp; }
      if (armR.current) { armR.current.rotation.z = 0; armR.current.rotation.x = -Math.sin(t) * amp; }
      if (legL.current) legL.current.rotation.x = -Math.sin(t) * amp;
      if (legR.current) legR.current.rotation.x =  Math.sin(t) * amp;
    }
  });

  const initial = state ? [state.x, 0, state.z] as [number, number, number] : [0, 0, 0] as [number, number, number];
  // hunters are bigger, like in the real game
  const scale = isSeekerMascot ? 1.25 : 1;
  return (
    <group ref={group} position={initial} scale={scale} userData={{ playerId: userId }}>
      <group position={[-0.18, 0.45, 0]}>
        <mesh ref={legL} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.9, 16]} />
          <meshStandardMaterial map={textures.legL} color="#ffffff" />
        </mesh>
      </group>
      <group position={[0.18, 0.45, 0]}>
        <mesh ref={legR} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.9, 16]} />
          <meshStandardMaterial map={textures.legR} color="#ffffff" />
        </mesh>
      </group>
      <mesh position={[0, 1.1, 0]} castShadow>
        <sphereGeometry args={[0.42, 24, 20]} />
        <meshStandardMaterial map={textures.torso} color="#ffffff" />
      </mesh>
      <group position={[-0.45, 1.15, 0]}>
        <mesh ref={armL} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.75, 14]} />
          <meshStandardMaterial map={textures.armL} color="#ffffff" />
        </mesh>
      </group>
      <group position={[0.45, 1.15, 0]}>
        <mesh ref={armR} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.75, 14]} />
          <meshStandardMaterial map={textures.armR} color="#ffffff" />
        </mesh>
      </group>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.36, 28, 24]} />
        <meshStandardMaterial map={textures.head} color="#ffffff" />
      </mesh>
      <FaceFeatures y={1.9} />
      {/* hunters carry their paint shotgun */}
      {isSeekerMascot && (
        <group position={[0.5, 1.05, -0.35]} rotation={[0, 0.15, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.1, 0.12, 0.7]} />
            <meshStandardMaterial color="#2a2a32" />
          </mesh>
          <mesh position={[0, 0.02, -0.5]}>
            <boxGeometry args={[0.06, 0.06, 0.4]} />
            <meshStandardMaterial color="#3a3a44" />
          </mesh>
          <mesh position={[0, 0.02, -0.72]}>
            <boxGeometry args={[0.07, 0.07, 0.05]} />
            <meshStandardMaterial color="#f4a83a" emissive="#f4a83a" emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}
      {whistling && (
        <Html position={[0, 2.9, 0]} center distanceFactor={12}>
          <div style={{ fontSize: 28, pointerEvents: "none" }}>🎵</div>
        </Html>
      )}
      {showName && (
        <Html position={[0, 2.4, 0]} center distanceFactor={10}>
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
// Paint toolbar (compact, non-blocking)
// -----------------------------------------------------------------------------

const PALETTE = [
  "#000000", "#ffffff", "#e83a3a", "#f4a83a", "#f4ec3a",
  "#3ae85c", "#3ac8e8", "#3a5ce8", "#a03ae8", "#e83aa0",
  "#8b5a2b", "#c9a878",
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
      <div className="flex gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} onClick={() => onColor(c)}
            className={`w-7 h-7 rounded border-2 ${color === c ? "border-white scale-110" : "border-white/20"}`}
            style={{ background: c }} aria-label={c} />
        ))}
        <input type="color" value={color} onChange={(e) => onColor(e.target.value)}
          className="w-7 h-7 rounded bg-transparent cursor-pointer" />
      </div>
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

function Hud({
  code, role, username, alive, total, locked, paintMode, phase, remaining, scheme, onSchemeChange, bodyColor, isSeeker,
}: {
  code: string; role: "hider" | "seeker" | null; username: string;
  alive: number; total: number;
  locked: boolean; paintMode: boolean; phase: Phase; remaining: number;
  scheme: ControlScheme; onSchemeChange: (s: ControlScheme) => void;
  bodyColor: string; isSeeker: boolean;
}) {
  const roleColor = role === "seeker" ? "text-[#ff3860]" : role === "hider" ? "text-[#3ad0ff]" : "text-muted-foreground";
  const roleLabel = role === "seeker" ? "헌터" : role === "hider" ? "카멜레온" : "관전";
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const phaseColor = phase === "seek" ? "text-[#ff3860]" : phase === "hide" ? "text-[#3ad0ff]" : "text-[#f4ec3a]";

  return (
    <>
      {/* Top-left: room info */}
      <div className="pointer-events-none fixed top-3 left-3 z-30 flex items-center gap-3 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10 text-white text-xs font-mono">
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Room</div><div className="text-primary">{code}</div></div>
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Player</div><div>{username}</div></div>
        <div><div className="text-[10px] uppercase tracking-widest text-white/50">Role</div><div className={roleColor}>{roleLabel}</div></div>
      </div>

      {/* Top-center: phase timer */}
      <div className="pointer-events-none fixed top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
        <div className={`text-5xl font-black tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] ${phaseColor}`}>
          {mm}:{ss}
        </div>
        <div className="text-sm text-white font-semibold tracking-widest drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          {PHASE_LABEL[phase]}
        </div>
      </div>

      {/* Top-right: back + scheme toggle */}
      <div className="pointer-events-auto fixed top-3 right-3 z-30 flex items-center gap-2">
        <div className="flex bg-black/50 backdrop-blur border border-white/10 rounded overflow-hidden text-xs">
          <button onClick={() => onSchemeChange("pc")} className={`px-2 py-1 ${scheme === "pc" ? "bg-white text-black" : "text-white/70"}`}>PC</button>
          <button onClick={() => onSchemeChange("mobile")} className={`px-2 py-1 ${scheme === "mobile" ? "bg-white text-black" : "text-white/70"}`}>모바일</button>
        </div>
        <Link to="/room/$code" params={{ code }}><Button size="sm" variant="outline">대기실</Button></Link>
      </div>

      {/* Bottom-left: current camouflage color */}
      {!isSeeker && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-30 flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10">
          <div className="w-8 h-8 rounded-full border-2 border-white/60" style={{ background: bodyColor }} />
          <div className="text-white text-xs leading-tight">
            <div className="font-bold">위장 색</div>
            <div className="text-white/60">E 추출 · F 칠하기</div>
          </div>
        </div>
      )}

      {/* Bottom-right: alive chameleon count */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-30 text-white text-right">
        <div className="text-xs uppercase tracking-widest text-white/60">남은 카멜레온</div>
        <div className="text-5xl font-black leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          {alive}<span className="text-2xl text-white/50">/{total}</span>
        </div>
      </div>

      {/* Crosshair */}
      {!paintMode && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          {isSeeker
            ? <div className="w-6 h-6 rounded-full border-2 border-[#ff3860]/80 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-[#ff3860]" />
              </div>
            : <div className="w-2 h-2 rounded-full border border-white/70" />}
        </div>
      )}

      {/* Click-to-start */}
      {!locked && !paintMode && scheme === "pc" && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="bg-black/70 backdrop-blur px-6 py-4 rounded border border-white/10 text-center text-white">
            <div className="text-lg font-bold tracking-widest">클릭해서 시작</div>
            <div className="mt-2 text-xs text-white/70 leading-relaxed">
              WASD 이동 · Shift 달리기 · Space 점프 · C 앉기<br/>
              <span className="text-[#3ad0ff]">E</span> 색 추출 · <span className="text-[#3ad0ff]">F</span> 몸 전체 칠하기 · <span className="text-[#3ad0ff]">P</span> 정밀 그리기<br/>
              <span className="text-[#f4ec3a]">Q</span> 벽에 붙기 · <span className="text-[#f4ec3a]">R</span> 포즈 변경 · <span className="text-[#f4ec3a]">1</span> 휘파람<br/>
              {isSeeker && <span className="text-[#ff3860]">좌클릭 — 페인트 샷건 발사!</span>}
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
        // touches that start on an action button must not become look-drags
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
      {/* Joystick */}
      <div ref={stickRef} className="fixed bottom-6 left-6 z-30 w-32 h-32 rounded-full bg-white/10 border border-white/30 backdrop-blur touch-none">
        <div ref={knobRef} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/70 border border-white/50 shadow" />
      </div>
      {/* Right buttons */}
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
        {!isSeeker && (
          <button onClick={onPaint}
            className="w-14 h-14 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow-lg touch-none">그리기</button>
        )}
      </div>
    </>
  );
}
