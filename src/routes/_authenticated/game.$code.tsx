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
import { usePresence, type PlayerState, type PaintStroke, type BodyPart } from "@/game/usePresence";
import {
  CANVAS_SIZE,
  createPaintCanvases, applyStroke, resetCanvases,
  type PaintCanvases, type PaintTextures,
} from "@/game/bodyPaint";
import { MAP_TEXTURES, loadTiledTexture } from "@/game/textures";
import { getControlScheme, type ControlScheme } from "@/game/controls";

export const Route = createFileRoute("/_authenticated/game/$code")({
  component: GameRoute,
});

type RoomData = { id: string; code: string; status: string; map_name: string; host_id: string };
type MyPlayer = { role: "hider" | "seeker" | null; username: string; spawnIndex: number };

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
  return <GameScene room={room} mapDef={mapDef} me={me} selfUserId={user.id} playerCount={playerCount} />;
}

// -----------------------------------------------------------------------------
// Phase (client-side timer)
// -----------------------------------------------------------------------------

type Phase = "prep" | "hide" | "seek" | "end";
const PHASE_DURATIONS: Record<Phase, number> = { prep: 10, hide: 60, seek: 180, end: 0 };
const PHASE_LABEL: Record<Phase, string> = {
  prep: "숨을 준비",
  hide: "숨을 시간",
  seek: "찾는 시간",
  end: "게임 종료",
};
const NEXT_PHASE: Record<Phase, Phase> = { prep: "hide", hide: "seek", seek: "end", end: "end" };

function useGamePhase() {
  const [phase, setPhase] = useState<Phase>("prep");
  const [remaining, setRemaining] = useState(PHASE_DURATIONS.prep);
  useEffect(() => {
    if (phase === "end") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          const next = NEXT_PHASE[phase];
          setPhase(next);
          return PHASE_DURATIONS[next];
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);
  return { phase, remaining };
}

// -----------------------------------------------------------------------------
// Scene
// -----------------------------------------------------------------------------

function GameScene({
  room, mapDef, me, selfUserId, playerCount,
}: {
  room: RoomData; mapDef: MapDef; me: MyPlayer; selfUserId: string; playerCount: number;
}) {
  const [locked, setLocked] = useState(false);
  const [paintMode, setPaintMode] = useState(false);
  const [scheme, setScheme] = useState<ControlScheme>(() => getControlScheme());
  const { phase, remaining } = useGamePhase();

  // Mobile input state (shared via ref, read in LocalPlayer)
  const touchInput = useRef({
    mx: 0, mz: 0, // movement axes -1..1
    lookX: 0, lookY: 0, // look delta since last frame (radians)
    jump: false, crouch: false,
  });

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

  const handleRemotePaint = useCallback((s: PaintStroke) => {
    const entry = getOrCreatePaint(s.userId);
    entry.strokes.push(s);
    applyStroke(entry.canvases, entry.textures, s);
  }, [getOrCreatePaint]);

  const { remoteRef, sendState, sendPaint } = usePresence(
    room.id, selfUserId, { username: me.username, role: me.role }, handleRemotePaint,
  );

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

  const [brushColor, setBrushColor] = useState("#e83a3a");
  const [brushSize, setBrushSize] = useState(14);

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

  const isMobile = scheme === "mobile";

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
        <directionalLight position={[30, 45, 20]} intensity={1.2} castShadow
          shadow-mapSize-width={1024} shadow-mapSize-height={1024} />

        <Floor mapDef={mapDef} />
        <Walls mapDef={mapDef} />
        <Props props={mapDef.props} />

        <RemotePlayersRenderer remoteRef={remoteRef} selfUserId={selfUserId} getPaint={getOrCreatePaint} />

        {paintMode && (
          <SelfMascot
            spawn={spawn}
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
        />

        {!paintMode && !isMobile && (
          <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
        )}
      </Canvas>

      <Hud
        code={room.code}
        role={me.role}
        username={me.username}
        playerCount={playerCount}
        locked={locked}
        paintMode={paintMode}
        phase={phase}
        remaining={remaining}
        scheme={scheme}
        onSchemeChange={setScheme}
      />

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
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
        const isBig = Math.max(sx, sz) > 6;
        return (
          <mesh key={i} position={w.pos} castShadow receiveShadow>
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
// Local player + camera
// -----------------------------------------------------------------------------

const GRAVITY = -22;
const JUMP_V = 8;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const CROUCH_SPEED = 2.4;

function LocalPlayer({
  spawn, walls, props, floorSize, sendState, paintMode, touchInput, isMobile,
}: {
  spawn: [number, number, number];
  walls: WallBox[]; props: Prop[]; floorSize: [number, number];
  sendState: (x: number, y: number, z: number, ry: number, crouch: boolean, moving: boolean) => void;
  paintMode: boolean;
  touchInput: React.MutableRefObject<{ mx: number; mz: number; lookX: number; lookY: number; jump: boolean; crouch: boolean }>;
  isMobile: boolean;
}) {
  const { camera } = useThree();
  const posRef = useRef(new THREE.Vector3(spawn[0], spawn[1], spawn[2]));
  const velY = useRef(0);
  const onGround = useRef(true);
  const crouchRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const keys = useRef<Record<string, boolean>>({});

  // Third-person camera anchor when in paint mode
  const paintAngle = useRef({ yaw: 0, dist: 3.2 });

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

    // Paint mode: orbit camera around self, freeze locomotion.
    if (paintMode) {
      paintAngle.current.yaw += 0; // could be dragged, kept static here
      const yaw = paintAngle.current.yaw;
      const dist = paintAngle.current.dist;
      camera.position.set(
        p.x + Math.sin(yaw) * dist,
        p.y + 0.4,
        p.z + Math.cos(yaw) * dist,
      );
      camera.lookAt(p.x, p.y - 0.2, p.z);
      sendState(p.x, p.y, p.z, yawRef.current, crouchRef.current, false);
      return;
    }

    // Mobile look integration
    if (isMobile) {
      yawRef.current -= touchInput.current.lookX;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitchRef.current - touchInput.current.lookY));
      touchInput.current.lookX = 0;
      touchInput.current.lookY = 0;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, "YXZ"));
      camera.quaternion.copy(q);
    }

    const k = keys.current;
    const ti = touchInput.current;
    const crouch = !!k["KeyC"] || ti.crouch;
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
    if (isMobile && (ti.mx !== 0 || ti.mz !== 0)) {
      move.addScaledVector(forward, -ti.mz);
      move.addScaledVector(right, ti.mx);
    }
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize();

    const speed = crouch ? CROUCH_SPEED : (k["ShiftLeft"] || k["ShiftRight"] ? RUN_SPEED : WALK_SPEED);
    const dx = move.x * speed * dt;
    const dz = move.z * speed * dt;

    tryAxisMove(p, colliders, floorSize, dx, 0);
    tryAxisMove(p, colliders, floorSize, 0, dz);

    if (onGround.current && (k["Space"] || ti.jump)) {
      velY.current = JUMP_V;
      onGround.current = false;
      ti.jump = false;
    }
    velY.current += GRAVITY * dt;
    p.y += velY.current * dt;
    const groundY = crouch ? PLAYER_CROUCH_HEIGHT : PLAYER_EYE_HEIGHT;
    if (p.y <= groundY) { p.y = groundY; velY.current = 0; onGround.current = true; }

    camera.position.copy(p);

    if (!isMobile) {
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
      yawRef.current = euler.y;
    }
    sendState(p.x, p.y, p.z, yawRef.current, crouch, moving);
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
    if (maxY < playerBottom || minY > playerTop) continue;
    const minX = wx - sx / 2 - r; const maxX = wx + sx / 2 + r;
    const minZ = wz - sz / 2 - r; const maxZ = wz + sz / 2 + r;
    if (cx > minX && cx < maxX && cz > minZ && cz < maxZ) {
      if (dx !== 0 && dz === 0) { p.x = dx > 0 ? minX - 0.001 : maxX + 0.001; return; }
      if (dz !== 0 && dx === 0) { p.z = dz > 0 ? minZ - 0.001 : maxZ + 0.001; return; }
    }
  }
  p.x = cx; p.z = cz;
}

// -----------------------------------------------------------------------------
// Self mascot (rendered only in paint mode) — supports in-world painting via raycast uv
// -----------------------------------------------------------------------------

function SelfMascot({
  spawn, textures, onPaint,
}: {
  spawn: [number, number, number];
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

  const [x, , z] = spawn;
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
        <Mascot key={id} userId={id} remoteRef={remoteRef} getPaint={getPaint} />
      ))}
    </>
  );
}

function Mascot({
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
    if (armL.current) armL.current.rotation.x =  Math.sin(t) * amp;
    if (armR.current) armR.current.rotation.x = -Math.sin(t) * amp;
    if (legL.current) legL.current.rotation.x = -Math.sin(t) * amp;
    if (legR.current) legR.current.rotation.x =  Math.sin(t) * amp;
  });

  const initial = state ? [state.x, 0, state.z] as [number, number, number] : [0, 0, 0] as [number, number, number];
  return (
    <group ref={group} position={initial}>
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
      <Html position={[0, 2.4, 0]} center distanceFactor={10}>
        <div className="px-2 py-0.5 text-xs font-mono rounded" style={{
          background: "rgba(0,0,0,0.65)", color: nameColor, border: `1px solid ${nameColor}`,
          whiteSpace: "nowrap", pointerEvents: "none",
        }}>{state?.username ?? "player"}</div>
      </Html>
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
      <Button size="sm" variant="outline" onClick={onClear}>지우기</Button>
      <Button size="sm" onClick={onClose}>완료 (P)</Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// HUD — top-center timer, top-left info, bottom-right survivor count
// -----------------------------------------------------------------------------

function Hud({
  code, role, username, playerCount, locked, paintMode, phase, remaining, scheme, onSchemeChange,
}: {
  code: string; role: "hider" | "seeker" | null; username: string; playerCount: number;
  locked: boolean; paintMode: boolean; phase: Phase; remaining: number;
  scheme: ControlScheme; onSchemeChange: (s: ControlScheme) => void;
}) {
  const roleColor = role === "seeker" ? "text-[#ff3860]" : role === "hider" ? "text-[#3ad0ff]" : "text-muted-foreground";
  const roleLabel = role === "seeker" ? "술래" : role === "hider" ? "숨는 사람" : "관전";
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

      {/* Bottom-right: survivor count */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-30 text-white text-right">
        <div className="text-xs uppercase tracking-widest text-white/60">남은 인원</div>
        <div className="text-5xl font-black leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{playerCount}</div>
      </div>

      {/* Crosshair */}
      {!paintMode && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full border border-white/70" />
        </div>
      )}

      {/* Click-to-start */}
      {!locked && !paintMode && scheme === "pc" && (
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

// -----------------------------------------------------------------------------
// Touch controls (mobile)
// -----------------------------------------------------------------------------

function TouchControls({
  touchInput, onPaint,
}: {
  touchInput: React.MutableRefObject<{ mx: number; mz: number; lookX: number; lookY: number; jump: boolean; crouch: boolean }>;
  onPaint: () => void;
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
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3 items-end">
        <button onClick={() => { touchInput.current.jump = true; }}
          className="w-16 h-16 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold backdrop-blur touch-none">JUMP</button>
        <button onTouchStart={() => { touchInput.current.crouch = true; }} onTouchEnd={() => { touchInput.current.crouch = false; }}
          className="w-16 h-16 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold backdrop-blur touch-none">앉기</button>
        <button onClick={onPaint}
          className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg touch-none">페인트</button>
      </div>
    </>
  );
}
