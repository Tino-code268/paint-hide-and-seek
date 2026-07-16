import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BodyPart = "head" | "torso" | "armL" | "armR" | "legL" | "legR";

export type PlayerState = {
  userId: string;
  username: string;
  role: "hider" | "seeker" | null;
  x: number;
  y: number;
  z: number;
  ry: number;
  crouch: boolean;
  moving: boolean;
  pose: number;      // 0 = normal, 1 = arms up, 2 = statue (frozen arms)
  caught: boolean;   // hit by the hunter → out
  flat: boolean;     // pressed flat against a wall (Q)
  t: number;
};

export type PaintStroke = {
  userId: string;
  part: BodyPart;
  x: number;   // canvas px
  y: number;
  size: number;
  color: string;
  from?: { x: number; y: number };
  fill?: boolean; // fill the whole part with `color`
};

export type ShotEvent = {
  shooterId: string;
  targets: string[];                 // userIds that were hit
  points: [number, number, number][]; // world-space pellet impact points
  color: string;                      // paint splat color
};

export type RemotePlayers = Map<string, PlayerState>;

const SEND_HZ = 15;
const SEND_MS = 1000 / SEND_HZ;

export function usePresence(
  roomId: string | null,
  selfUserId: string,
  selfMeta: { username: string; role: "hider" | "seeker" | null },
  handlers: {
    onPaint?: (s: PaintStroke) => void;
    onShot?: (e: ShotEvent) => void;
    onWhistle?: (userId: string) => void;
    onPaintClear?: (userId: string) => void;
    /** Called when a newly-joined player asks for existing paint. Return my strokes. */
    getMyStrokes?: () => PaintStroke[];
  },
) {
  const remoteRef = useRef<RemotePlayers>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      const channel = supabase.channel(`game:${roomId}`, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "pos" }, ({ payload }) => {
        const p = payload as PlayerState;
        if (!p || p.userId === selfUserId) return;
        p.t = performance.now();
        remoteRef.current.set(p.userId, p);
      });

      channel.on("broadcast", { event: "leave" }, ({ payload }) => {
        const uid = (payload as { userId: string }).userId;
        remoteRef.current.delete(uid);
      });

      channel.on("broadcast", { event: "paint" }, ({ payload }) => {
        const s = payload as PaintStroke;
        if (!s || s.userId === selfUserId) return;
        handlersRef.current.onPaint?.(s);
      });

      channel.on("broadcast", { event: "paint_batch" }, ({ payload }) => {
        const b = payload as { userId: string; strokes: PaintStroke[] };
        if (!b || b.userId === selfUserId) return;
        for (const s of b.strokes) handlersRef.current.onPaint?.(s);
      });

      channel.on("broadcast", { event: "shot" }, ({ payload }) => {
        const e = payload as ShotEvent;
        if (!e || e.shooterId === selfUserId) return;
        handlersRef.current.onShot?.(e);
      });

      channel.on("broadcast", { event: "paint_clear" }, ({ payload }) => {
        const uid = (payload as { userId: string }).userId;
        if (uid === selfUserId) return;
        handlersRef.current.onPaintClear?.(uid);
      });

      channel.on("broadcast", { event: "whistle" }, ({ payload }) => {
        const uid = (payload as { userId: string }).userId;
        if (uid === selfUserId) return;
        handlersRef.current.onWhistle?.(uid);
      });

      channel.on("broadcast", { event: "paint_req" }, ({ payload }) => {
        const uid = (payload as { userId: string }).userId;
        if (uid === selfUserId) return;
        // Someone joined and wants existing paint — send mine (capped).
        const strokes = handlersRef.current.getMyStrokes?.() ?? [];
        if (strokes.length === 0) return;
        const capped = strokes.slice(-400);
        channel.send({
          type: "broadcast", event: "paint_batch",
          payload: { userId: selfUserId, strokes: capped },
        }).catch(() => {});
      });

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Ask others for their existing paint state
          channel.send({ type: "broadcast", event: "paint_req", payload: { userId: selfUserId } }).catch(() => {});
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[presence] status:", status);
        }
      });

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      if (ch) {
        ch.send({ type: "broadcast", event: "leave", payload: { userId: selfUserId } }).catch(() => {});
        supabase.removeChannel(ch);
      }
      channelRef.current = null;
      remoteRef.current.clear();
    };
  }, [roomId, selfUserId]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      for (const [uid, p] of remoteRef.current) {
        if (now - p.t > 5000) remoteRef.current.delete(uid);
      }
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const sendState = (
    x: number, y: number, z: number, ry: number,
    crouch: boolean, moving: boolean, pose: number, caught: boolean, flat: boolean,
  ) => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = performance.now();
    if (now - lastSentRef.current < SEND_MS) return;
    lastSentRef.current = now;
    const payload: PlayerState = {
      userId: selfUserId,
      username: selfMeta.username,
      role: selfMeta.role,
      x, y, z, ry, crouch, moving, pose, caught, flat,
      t: now,
    };
    ch.send({ type: "broadcast", event: "pos", payload }).catch(() => {});
  };

  const sendPaint = (s: Omit<PaintStroke, "userId">) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "paint", payload: { ...s, userId: selfUserId } }).catch(() => {});
  };

  const sendShot = (e: Omit<ShotEvent, "shooterId">) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "shot", payload: { ...e, shooterId: selfUserId } }).catch(() => {});
  };

  const sendPaintClear = () => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "paint_clear", payload: { userId: selfUserId } }).catch(() => {});
  };

  const sendWhistle = () => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "whistle", payload: { userId: selfUserId } }).catch(() => {});
  };

  return { remoteRef, sendState, sendPaint, sendShot, sendWhistle, sendPaintClear };
}
