import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlayerState = {
  userId: string;
  username: string;
  role: "hider" | "seeker" | null;
  x: number;
  y: number;
  z: number;
  ry: number;      // yaw
  crouch: boolean;
  t: number;       // last update timestamp
};

export type RemotePlayers = Map<string, PlayerState>;

const SEND_HZ = 15;
const SEND_MS = 1000 / SEND_HZ;

/**
 * Establishes a broadcast channel for a room and returns a ref-based API.
 * - `remoteRef.current` : Map of remote players (mutated in place; read in useFrame)
 * - `sendState(state)`  : throttled broadcast of the local player state
 */
export function usePresence(roomId: string | null, selfUserId: string, selfMeta: { username: string; role: "hider" | "seeker" | null }) {
  const remoteRef = useRef<RemotePlayers>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSentRef = useRef(0);

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

      channel.subscribe((status) => {
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

  // Periodically prune stale remotes (5s no update)
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now();
      for (const [uid, p] of remoteRef.current) {
        if (now - p.t > 5000) remoteRef.current.delete(uid);
      }
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const sendState = (x: number, y: number, z: number, ry: number, crouch: boolean) => {
    const ch = channelRef.current;
    if (!ch) return;
    const now = performance.now();
    if (now - lastSentRef.current < SEND_MS) return;
    lastSentRef.current = now;
    const payload: PlayerState = {
      userId: selfUserId,
      username: selfMeta.username,
      role: selfMeta.role,
      x, y, z, ry, crouch,
      t: now,
    };
    ch.send({ type: "broadcast", event: "pos", payload }).catch(() => {});
  };

  return { remoteRef, sendState };
}
