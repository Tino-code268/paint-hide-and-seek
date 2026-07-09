import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  MAPS, type MapDef, type WallBox, type Prop,
  PLAYER_EYE_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS,
} from "@/game/maps";
import { usePresence, type PlayerState, type PaintStroke, type BodyPart } from "@/game/usePresence";
import {
  BODY_PARTS, PART_LABEL, CANVAS_SIZE,
  createPaintCanvases, applyStroke, resetCanvases,
  type PaintCanvases, type PaintTextures,
} from "@/game/bodyPaint";

export const Route = createFileRoute("/_authenticated/game/$code")({
  component: GameRoute,
});

type RoomData = {
  id: string;
  code: string;
  status: string;
  map_name: string;
  host_id: string;
};

type MyPlayer = {
  role: "hider" | "seeker" | null;
  username: string;
  spawnIndex: number;
};

function GameRoute() {
  const { code } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [me, setMe] = useState<MyPlayer | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r, error: rErr } = await supabase
        .from("rooms").select("id, code, status, map_name, host_id").eq("code", code).maybeSingle();
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
      setPlayerCount(rows.length);
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
          if (next.status !== "playing") {
            navigate({ to: "/room/$code", params: { code }, replace: true });
          }
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        () => { navigate({ to: "/lobby", replace: true }); })
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

  return (
    <GameScene
      room={room}
      mapDef={mapDef}
      me={me}
      selfUserId={user.id}
      playerCount={playerCount}
    />
  );
}

// -----------------------------------------------------------------------------
// Scene
// -----------------------------------------------------------------------------

function GameScene({
  room, mapDef, me, selfUserId, playerCount,
}: {
  room: RoomData;
  mapDef: MapDef;
  me: MyPlayer;
  selfUserId: string;
  playerCount: number;
}) {
  const [locked, setLocked] = useState(false);
  const [paintMode, setPaintMode] = useState(false);

  // Per-user paint canvases (self + remotes lazy-created)
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

  // Self entry created eagerly
  useEffect(() => {
    getOrCreatePaint(selfUserId);
  }, [selfUserId, getOrCreatePaint]);

  const handleRemotePaint = useCallback((s: PaintStroke) => {
    const entry = getOrCreatePaint(s.userId);
    entry.strokes.push(s);
    applyStroke(entry.canvases, entry.textures, s);
  }, [getOrCreatePaint]);

  const { remoteRef, sendState, sendPaint } = usePresence(
    room.id, selfUserId,
    { username: me.username, role: me.role },
    handleRemotePaint,
  );

  const spawn = mapDef.spawnPoints[me.spawnIndex % mapDef.spawnPoints.length];

  // Toggle paint mode with P
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyP") {
        e.preventDefault();
        setPaintMode((m) => !m);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // When paint mode opens, release pointer lock
  useEffect(() => {
    if (paintMode && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [paintMode]);

  const applyLocalStroke = useCallback((part: BodyPart, x: number, y: number, size: number, color: string, from?: { x: number; y: number }) => {
    const entry = getOrCreatePaint(selfUserId);
    const stroke: PaintStroke = { userId: selfUserId, part, x, y, size, color, from };
    entry.strokes.push(stroke);
    applyStroke(entry.canvases, entry.textures, stroke);
    sendPaint({ part, x, y, size, color, from });
  }, [getOrCreatePaint, selfUserId, sendPaint]);

  const clearSelf = useCallback(() => {
    const entry = getOrCreatePaint(selfUserId);
    entry.strokes = [];
    resetCanvases(entry.canvases, entry.textures);
    // Note: remote clear could be added; for now local reset only.
  }, [getOrCreatePaint, selfUserId]);

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: spawn }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[mapDef.skyColor]} />
        <fog attach="fog" args={[mapDef.skyColor, mapDef.fogNear, mapDef.fogFar]} />
        <ambientLight intensity={0.9} color={mapDef.ambientColor} />
        <hemisphereLight args={[mapDef.skyColor, mapDef.groundColor, 0.6]} />
        <directionalLight position={[30, 40, 20]} intensity={1.1} castShadow />

        <Floor mapDef={mapDef} />
        <Walls walls={mapDef.walls} />
        <Props props={mapDef.props} />

        <RemotePlayersRenderer
          remoteRef={remoteRef}
          selfUserId={selfUserId}
          getPaint={getOrCreatePaint}
        />

        <LocalPlayer
          spawn={spawn}
          walls={mapDef.walls}
          props={mapDef.props}
          floorSize={mapDef.floorSize}
          sendState={sendState}
          paintMode={paintMode}
        />

        {!paintMode && (
          <PointerLockControls
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
        )}
      </Canvas>

      <Hud
        code={room.code}
        role={me.role}
        username={me.username}
        playerCount={playerCount}
        locked={locked}
        paintMode={paintMode}
      />

      {paintMode && (
        <PaintOverlay
          canvases={getOrCreatePaint(selfUserId).canvases}
          textures={getOrCreatePaint(selfUserId).textures}
          onStroke={applyLocalStroke}
          onClear={clearSelf}
          onClose={() => setPaintMode(false)}
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
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={mapDef.floorColor} />
    </mesh>
  );
}

function Walls({ walls }: { walls: WallBox[] }) {
  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} castShadow receiveShadow>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color={w.color ?? "#556677"} />
        </mesh>
      ))}
    </>
  );
}

function Props({ props }: { props: Prop[] }) {
  return (
    <>
      {props.map((p, i) => {
        if (p.kind === "cylinder") {
          return (
            <mesh key={i} position={p.pos} castShadow receiveShadow>
              <cylinderGeometry args={[p.radiusTop, p.radiusBottom, p.height, 20]} />
              <meshStandardMaterial color={p.color} />
            </mesh>
          );
        }
        return (
          <mesh key={i} position={p.pos} castShadow>
            <sphereGeometry args={[p.radius, 20, 16]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.4} />
          </mesh>
        );
      })}
    </>
  );
}

// -----------------------------------------------------------------------------
// Local player
// -----------------------------------------------------------------------------

const GRAVITY = -22;
const JUMP_V = 8;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const CROUCH_SPEED = 2.4;

function LocalPlayer({
  spawn, walls, props, floorSize, sendState, paintMode,
}: {
  spawn: [number, number, number];
  walls: WallBox[];
  props: Prop[];
  floorSize: [number, number];
  sendState: (x: number, y: number, z: number, ry: number, crouch: boolean, moving: boolean) => void;
  paintMode: boolean;
}) {
  const { camera } = useThree();
  const posRef = useRef(new THREE.Vector3(spawn[0], spawn[1], spawn[2]));
  const velY = useRef(0);
  const onGround = useRef(true);
  const crouchRef = useRef(false);
  const keys = useRef<Record<string, boolean>>({});

  // AABB colliders assembled from walls + collidable props
  const colliders = useMemo(() => {
    const list: WallBox[] = [...walls];
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
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
    if (paintMode) {
      // freeze input but keep broadcasting position
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      sendState(p.x, p.y, p.z, euler.y, crouchRef.current, false);
      return;
    }

    const k = keys.current;
    const crouch = !!k["KeyC"];
    crouchRef.current = crouch;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (k["KeyW"]) move.add(forward);
    if (k["KeyS"]) move.sub(forward);
    if (k["KeyD"]) move.add(right);
    if (k["KeyA"]) move.sub(right);
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize();

    const speed = crouch ? CROUCH_SPEED : (k["ShiftLeft"] || k["ShiftRight"] ? RUN_SPEED : WALK_SPEED);
    const dx = move.x * speed * dt;
    const dz = move.z * speed * dt;

    tryAxisMove(p, colliders, floorSize, dx, 0);
    tryAxisMove(p, colliders, floorSize, 0, dz);

    if (onGround.current && k["Space"]) {
      velY.current = JUMP_V;
      onGround.current = false;
    }
    velY.current += GRAVITY * dt;
    p.y += velY.current * dt;
    const groundY = crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    if (p.y <= groundY) {
      p.y = groundY;
      velY.current = 0;
      onGround.current = true;
    }

    camera.position.copy(p);

    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    sendState(p.x, p.y, p.z, euler.y, crouch, moving);
  });

  return null;
}

function tryAxisMove(
  p: THREE.Vector3,
  walls: WallBox[],
  floorSize: [number, number],
  dx: number,
  dz: number,
) {
  const nx = p.x + dx;
  const nz = p.z + dz;
  const r = PLAYER_RADIUS;

  const halfW = floorSize[0] / 2 - r - 0.3;
  const halfD = floorSize[1] / 2 - r - 0.3;
  const cx = Math.max(-halfW, Math.min(halfW, nx));
  const cz = Math.max(-halfD, Math.min(halfD, nz));

  const playerY = p.y;
  const playerBottom = playerY - PLAYER_EYE_HEIGHT + 0.1;
  const playerTop = playerY + 0.1;

  for (const w of walls) {
    const [wx, wy, wz] = w.pos;
    const [sx, sy, sz] = w.size;
    const minY = wy - sy / 2;
    const maxY = wy + sy / 2;
    if (maxY < playerBottom || minY > playerTop) continue;

    const minX = wx - sx / 2 - r;
    const maxX = wx + sx / 2 + r;
    const minZ = wz - sz / 2 - r;
    const maxZ = wz + sz / 2 + r;

    if (cx > minX && cx < maxX && cz > minZ && cz < maxZ) {
      if (dx !== 0 && dz === 0) {
        if (dx > 0) p.x = minX - 0.001;
        else p.x = maxX + 0.001;
        return;
      }
      if (dz !== 0 && dx === 0) {
        if (dz > 0) p.z = minZ - 0.001;
        else p.z = maxZ + 0.001;
        return;
      }
    }
  }

  p.x = cx;
  p.z = cz;
}

// -----------------------------------------------------------------------------
// Remote players
// -----------------------------------------------------------------------------

function RemotePlayersRenderer({
  remoteRef, selfUserId, getPaint,
}: {
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
  selfUserId: string;
  getPaint: (uid: string) => { canvases: PaintCanvases; textures: PaintTextures; strokes: PaintStroke[] };
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const ids = Array.from(remoteRef.current.keys()).filter((id) => id !== selfUserId);
  void tick;

  return (
    <>
      {ids.map((id) => (
        <Stickman key={id} userId={id} remoteRef={remoteRef} getPaint={getPaint} />
      ))}
    </>
  );
}

// -----------------------------------------------------------------------------
// Stickman (white-body character painted from CanvasTextures)
// -----------------------------------------------------------------------------

function Stickman({
  userId, remoteRef, getPaint,
}: {
  userId: string;
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
  getPaint: (uid: string) => { textures: PaintTextures };
}) {
  const group = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Mesh>(null);
  const armR = useRef<THREE.Mesh>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const swingRef = useRef(0);
  const state = remoteRef.current.get(userId);
  const { textures } = getPaint(userId);
  const nameColor = state?.role === "seeker" ? "#ff3860" : state?.role === "hider" ? "#3ad0ff" : "#a0a0a0";

  useFrame((_, dt) => {
    const s = remoteRef.current.get(userId);
    if (!s || !group.current) return;
    const g = group.current;
    const baseY = s.crouch ? 0.55 : 0.0;
    const lerp = 1 - Math.pow(0.001, dt);
    g.position.x += (s.x - g.position.x) * lerp;
    g.position.y += (baseY - g.position.y) * lerp;
    g.position.z += (s.z - g.position.z) * lerp;
    g.rotation.y = s.ry;

    // Limb swing when moving
    const target = s.moving ? 1 : 0;
    swingRef.current += ((target - swingRef.current) * Math.min(1, dt * 8));
    const t = performance.now() * 0.008;
    const amp = 0.6 * swingRef.current;
    if (armL.current) armL.current.rotation.x =  Math.sin(t) * amp;
    if (armR.current) armR.current.rotation.x = -Math.sin(t) * amp;
    if (legL.current) legL.current.rotation.x = -Math.sin(t) * amp;
    if (legR.current) legR.current.rotation.x =  Math.sin(t) * amp;
  });

  const initial = state ? [state.x, 0, state.z] as [number, number, number] : [0, 0, 0] as [number, number, number];

  return (
    <group ref={group} position={initial}>
      {/* Legs */}
      <group position={[-0.18, 0.5, 0]}>
        <mesh ref={legL} position={[0, -0.4, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.9, 12]} />
          <meshStandardMaterial map={textures.legL} color="#ffffff" />
        </mesh>
      </group>
      <group position={[0.18, 0.5, 0]}>
        <mesh ref={legR} position={[0, -0.4, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.9, 12]} />
          <meshStandardMaterial map={textures.legR} color="#ffffff" />
        </mesh>
      </group>

      {/* Torso */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.8, 16]} />
        <meshStandardMaterial map={textures.torso} color="#ffffff" />
      </mesh>

      {/* Arms */}
      <group position={[-0.32, 1.15, 0]}>
        <mesh ref={armL} position={[0, -0.35, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.75, 12]} />
          <meshStandardMaterial map={textures.armL} color="#ffffff" />
        </mesh>
      </group>
      <group position={[0.32, 1.15, 0]}>
        <mesh ref={armR} position={[0, -0.35, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.75, 12]} />
          <meshStandardMaterial map={textures.armR} color="#ffffff" />
        </mesh>
      </group>

      {/* Head */}
      <mesh position={[0, 1.65, 0]} castShadow>
        <sphereGeometry args={[0.28, 24, 20]} />
        <meshStandardMaterial map={textures.head} color="#ffffff" />
      </mesh>
      {/* Simple face features */}
      <mesh position={[-0.09, 1.7, -0.25]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color="#111" />
      </mesh>
      <mesh position={[ 0.09, 1.7, -0.25]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color="#111" />
      </mesh>

      <Html position={[0, 2.15, 0]} center distanceFactor={10}>
        <div
          className="px-2 py-0.5 text-xs font-mono rounded"
          style={{
            background: "rgba(0,0,0,0.65)",
            color: nameColor,
            border: `1px solid ${nameColor}`,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {state?.username ?? "player"}
        </div>
      </Html>
    </group>
  );
}

// -----------------------------------------------------------------------------
// Paint overlay
// -----------------------------------------------------------------------------

const PALETTE = [
  "#000000", "#ffffff", "#e83a3a", "#f4a83a", "#f4ec3a",
  "#3ae85c", "#3ac8e8", "#3a5ce8", "#a03ae8", "#e83aa0",
  "#8b5a2b", "#c9a878", "#3a5a2a", "#556677", "#c0c0c0",
];

function PaintOverlay({
  canvases, textures, onStroke, onClear, onClose,
}: {
  canvases: PaintCanvases;
  textures: PaintTextures;
  onStroke: (part: BodyPart, x: number, y: number, size: number, color: string, from?: { x: number; y: number }) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [part, setPart] = useState<BodyPart>("torso");
  const [color, setColor] = useState<string>("#e83a3a");
  const [size, setSize] = useState<number>(6);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Copy source canvas onto the display each frame
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const src = canvases[part];
      const dst = displayRef.current;
      if (dst) {
        const ctx = dst.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, dst.width, dst.height);
        ctx.drawImage(src, 0, 0, dst.width, dst.height);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvases, part]);

  const toCanvasCoord = (clientX: number, clientY: number) => {
    const dst = displayRef.current!;
    const rect = dst.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CANVAS_SIZE;
    const y = ((clientY - rect.top) / rect.height) * CANVAS_SIZE;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const { x, y } = toCanvasCoord(e.clientX, e.clientY);
    onStroke(part, x, y, size, color);
    lastRef.current = { x, y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const { x, y } = toCanvasCoord(e.clientX, e.clientY);
    const from = lastRef.current ?? { x, y };
    onStroke(part, x, y, size, color, from);
    lastRef.current = { x, y };
  };
  const onPointerUp = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  void textures;

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur flex flex-col text-white">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/50">Body Paint</div>
          <div className="text-lg font-bold tracking-widest">몸에 그림을 그려서 배경에 숨어라</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClear}>전체 지우기</Button>
          <Button size="sm" onClick={onClose}>완료 (P)</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Part selector */}
        <div className="w-40 border-r border-white/10 p-3 space-y-2">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-2">부위</div>
          {BODY_PARTS.map((p) => (
            <button
              key={p}
              onClick={() => setPart(p)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition ${
                part === p ? "bg-primary text-primary-foreground" : "bg-white/5 hover:bg-white/10"
              }`}
            >
              {PART_LABEL[p]}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white rounded shadow-2xl" style={{ padding: 4 }}>
            <canvas
              ref={displayRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                width: 512,
                height: 512,
                touchAction: "none",
                cursor: "crosshair",
                imageRendering: "pixelated",
                display: "block",
              }}
            />
          </div>
        </div>

        {/* Color + brush */}
        <div className="w-56 border-l border-white/10 p-3 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50 mb-2">색상</div>
            <div className="grid grid-cols-5 gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`aspect-square rounded border-2 ${color === c ? "border-white" : "border-white/20"}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="mt-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 rounded bg-transparent cursor-pointer"
              />
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-white/50 mb-2">브러시 크기 · {size}px</div>
            <input
              type="range" min={1} max={40} step={1}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="text-[11px] text-white/50 leading-relaxed pt-2 border-t border-white/10">
            드래그로 그리기. 부위별로 캔버스가 분리되어 있으며, 실시간으로 다른 플레이어에게 보입니다.
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HUD
// -----------------------------------------------------------------------------

function Hud({
  code, role, username, playerCount, locked, paintMode,
}: {
  code: string;
  role: "hider" | "seeker" | null;
  username: string;
  playerCount: number;
  locked: boolean;
  paintMode: boolean;
}) {
  const roleColor = role === "seeker" ? "text-[#ff3860]" : role === "hider" ? "text-[#3ad0ff]" : "text-muted-foreground";
  const roleLabel = role === "seeker" ? "술래" : role === "hider" ? "숨는 사람" : "관전";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 flex items-start justify-between px-4 py-3 text-xs font-mono text-white/90">
        <div className="pointer-events-auto flex items-center gap-3 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10">
          <div><div className="text-[10px] uppercase tracking-widest text-white/50">Room</div><div className="text-primary">{code}</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-white/50">Player</div><div>{username}</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-white/50">Role</div><div className={roleColor}>{roleLabel}</div></div>
          <div><div className="text-[10px] uppercase tracking-widest text-white/50">Players</div><div>{playerCount}</div></div>
        </div>
        <div className="pointer-events-auto">
          <Link to="/room/$code" params={{ code }}>
            <Button size="sm" variant="outline">대기실</Button>
          </Link>
        </div>
      </div>

      {!paintMode && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full border border-white/70" />
        </div>
      )}

      {!locked && !paintMode && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="bg-black/70 backdrop-blur px-6 py-4 rounded border border-white/10 text-center text-white">
            <div className="text-lg font-bold tracking-widest">클릭해서 시작</div>
            <div className="mt-2 text-xs text-white/70 leading-relaxed">
              WASD 이동 · Shift 달리기 · Space 점프 · C 앉기<br/>
              <span className="text-[#3ad0ff]">P 키</span>로 몸에 그림 그리기 · ESC 마우스 해제
            </div>
          </div>
        </div>
      )}
    </>
  );
}
