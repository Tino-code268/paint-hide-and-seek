import { useEffect, useRef, useState, useMemo } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  MAPS, type MapDef, type WallBox,
  PLAYER_EYE_HEIGHT, PLAYER_CROUCH_HEIGHT, PLAYER_RADIUS,
} from "@/game/maps";
import { usePresence, type PlayerState } from "@/game/usePresence";

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

  // Watch room status: back to lobby / room on end
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

  const mapDef = MAPS[room.map_name] ?? MAPS.warehouse;

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
  const { remoteRef, sendState } = usePresence(room.id, selfUserId, {
    username: me.username,
    role: me.role,
  });

  const spawn = mapDef.spawnPoints[me.spawnIndex % mapDef.spawnPoints.length];

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        shadows
        camera={{ fov: 75, near: 0.1, far: 500, position: spawn }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#05070c"]} />
        <fog attach="fog" args={["#05070c", 30, 90]} />
        <ambientLight intensity={0.5} color={mapDef.ambientColor} />
        <directionalLight position={[20, 30, 10]} intensity={0.8} castShadow />

        <Floor mapDef={mapDef} />
        <Walls walls={mapDef.walls} />

        <RemotePlayersRenderer remoteRef={remoteRef} selfUserId={selfUserId} />

        <LocalPlayer
          spawn={spawn}
          walls={mapDef.walls}
          floorSize={mapDef.floorSize}
          sendState={sendState}
        />

        <PointerLockControls
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
      </Canvas>

      <Hud
        code={room.code}
        role={me.role}
        username={me.username}
        playerCount={playerCount}
        locked={locked}
      />
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

// -----------------------------------------------------------------------------
// Local player: WASD + jump + crouch, AABB collision with walls
// -----------------------------------------------------------------------------

const GRAVITY = -22;
const JUMP_V = 8;
const WALK_SPEED = 5;
const RUN_SPEED = 8;
const CROUCH_SPEED = 2.4;

function LocalPlayer({
  spawn, walls, floorSize, sendState,
}: {
  spawn: [number, number, number];
  walls: WallBox[];
  floorSize: [number, number];
  sendState: (x: number, y: number, z: number, ry: number, crouch: boolean) => void;
}) {
  const { camera } = useThree();
  const posRef = useRef(new THREE.Vector3(spawn[0], spawn[1], spawn[2]));
  const velY = useRef(0);
  const onGround = useRef(true);
  const crouchRef = useRef(false);
  const keys = useRef<Record<string, boolean>>({});

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
    const k = keys.current;
    const crouch = !!k["KeyC"];
    crouchRef.current = crouch;

    // horizontal input in camera space (ignore y)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    if (k["KeyW"]) move.add(forward);
    if (k["KeyS"]) move.sub(forward);
    if (k["KeyD"]) move.add(right);
    if (k["KeyA"]) move.sub(right);
    if (move.lengthSq() > 0) move.normalize();

    const speed = crouch ? CROUCH_SPEED : (k["ShiftLeft"] || k["ShiftRight"] ? RUN_SPEED : WALK_SPEED);
    const dx = move.x * speed * dt;
    const dz = move.z * speed * dt;

    // AABB collision: try X then Z independently
    const p = posRef.current;
    tryAxisMove(p, walls, floorSize, dx, 0);
    tryAxisMove(p, walls, floorSize, 0, dz);

    // gravity + jump
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

    // yaw = camera rotation around Y
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    sendState(p.x, p.y, p.z, euler.y, crouch);
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

  // outer floor bounds
  const halfW = floorSize[0] / 2 - r - 0.3;
  const halfD = floorSize[1] / 2 - r - 0.3;
  const cx = Math.max(-halfW, Math.min(halfW, nx));
  const cz = Math.max(-halfD, Math.min(halfD, nz));

  // wall AABB check (only walls whose Y extent overlaps player)
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
      // collision: pick the axis being moved this call
      if (dx !== 0 && dz === 0) {
        // resolve on X
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
  remoteRef, selfUserId,
}: {
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
  selfUserId: string;
}) {
  const [tick, setTick] = useState(0);
  // Re-render on a slow tick so react tracks joining/leaving players.
  // Position lerp still happens inside RemotePlayer via useFrame.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  const ids = Array.from(remoteRef.current.keys()).filter((id) => id !== selfUserId);
  // include tick in deps
  void tick;

  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} userId={id} remoteRef={remoteRef} />
      ))}
    </>
  );
}

function RemotePlayer({
  userId, remoteRef,
}: {
  userId: string;
  remoteRef: React.MutableRefObject<Map<string, PlayerState>>;
}) {
  const group = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const state = remoteRef.current.get(userId);
  const color = useMemo(() => {
    const role = state?.role;
    if (role === "seeker") return "#ff3860";
    if (role === "hider") return "#3ad0ff";
    return "#a0a0a0";
  }, [state?.role]);
  const [username] = useState(state?.username ?? "player");

  useFrame((_, dt) => {
    const s = remoteRef.current.get(userId);
    if (!s || !group.current) return;
    const g = group.current;
    const targetY = s.crouch ? PLAYER_CROUCH_HEIGHT * 0.5 : PLAYER_EYE_HEIGHT * 0.55;
    const lerp = 1 - Math.pow(0.001, dt); // fast catch-up
    g.position.x += (s.x - g.position.x) * lerp;
    g.position.y += (targetY - g.position.y) * lerp;
    g.position.z += (s.z - g.position.z) * lerp;
    g.rotation.y = s.ry;
  });

  return (
    <group ref={group} position={[state?.x ?? 0, PLAYER_EYE_HEIGHT * 0.55, state?.z ?? 0]}>
      {/* Body: capsule */}
      <mesh castShadow>
        <capsuleGeometry args={[0.35, 0.9, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {/* Facing indicator */}
      <mesh position={[0, 0.4, -0.4]}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Html position={[0, 1.1, 0]} center distanceFactor={10}>
        <div
          ref={labelRef}
          className="px-2 py-0.5 text-xs font-mono rounded"
          style={{
            background: "rgba(0,0,0,0.65)",
            color,
            border: `1px solid ${color}`,
            whiteSpace: "nowrap",
            transform: "translateY(-4px)",
            pointerEvents: "none",
          }}
        >
          {state?.username ?? username}
        </div>
      </Html>
    </group>
  );
}

// -----------------------------------------------------------------------------
// HUD
// -----------------------------------------------------------------------------

function Hud({
  code, role, username, playerCount, locked,
}: {
  code: string;
  role: "hider" | "seeker" | null;
  username: string;
  playerCount: number;
  locked: boolean;
}) {
  const roleColor = role === "seeker" ? "text-[#ff3860]" : role === "hider" ? "text-[#3ad0ff]" : "text-muted-foreground";
  const roleLabel = role === "seeker" ? "술래" : role === "hider" ? "숨는 사람" : "관전";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 flex items-start justify-between px-4 py-3 text-xs font-mono text-white/90">
        <div className="pointer-events-auto flex items-center gap-3 bg-black/50 backdrop-blur px-3 py-2 rounded border border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Room</div>
            <div className="text-primary">{code}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Player</div>
            <div>{username}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Role</div>
            <div className={roleColor}>{roleLabel}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Players</div>
            <div>{playerCount}</div>
          </div>
        </div>
        <div className="pointer-events-auto">
          <Link to="/room/$code" params={{ code }}>
            <Button size="sm" variant="outline">대기실</Button>
          </Link>
        </div>
      </div>

      {/* Crosshair */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full border border-white/70" />
      </div>

      {/* Click to lock overlay */}
      {!locked && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="bg-black/70 backdrop-blur px-6 py-4 rounded border border-white/10 text-center text-white">
            <div className="text-lg font-bold tracking-widest">클릭해서 시작</div>
            <div className="mt-2 text-xs text-white/70 leading-relaxed">
              WASD 이동 · Shift 달리기 · Space 점프 · C 앉기 · ESC 마우스 해제
            </div>
          </div>
        </div>
      )}
    </>
  );
}
