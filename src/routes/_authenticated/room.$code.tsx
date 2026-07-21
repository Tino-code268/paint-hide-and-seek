import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { MAP_LIST, parseRoomConfig, encodeRoomConfig, MAPS } from "@/game/maps";

export const Route = createFileRoute("/_authenticated/room/$code")({
  component: Room,
});

type RoomRow = {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "playing" | "finished";
  map_name: string;
  max_players: number;
};

type PlayerRow = {
  id: string;
  room_id: string;
  user_id: string;
  is_ready: boolean;
  role: string | null;
  joined_at: string;
  username?: string;
};

function Room() {
  const { code } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlayers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("room_players")
      .select("id, room_id, user_id, is_ready, role, joined_at")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });
    const rows = (data ?? []) as PlayerRow[];
    if (rows.length) {
      const ids = rows.map((r) => r.user_id);
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p.username]));
      rows.forEach((r) => { r.username = map.get(r.user_id) ?? r.user_id.slice(0, 6); });
    }
    setPlayers(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: r, error } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
      if (cancelled) return;
      if (error || !r) {
        toast.error("방을 찾을 수 없습니다");
        navigate({ to: "/lobby", replace: true });
        return;
      }
      setRoom(r as RoomRow);
      await loadPlayers(r.id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code, navigate, loadPlayers]);

  // Realtime subscription
  useEffect(() => {
    if (!room) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Ensure Realtime socket has the latest auth token so RLS lets postgres_changes through
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`room:${room.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` },
          () => { loadPlayers(room.id); })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
          (payload) => { setRoom(payload.new as RoomRow); })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
          () => {
            toast.info("방장이 방을 닫았습니다");
            navigate({ to: "/lobby", replace: true });
          })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[room realtime] status:", status);
          }
        });
    })();

    // Polling fallback: refresh players every 3s while in waiting room
    const poll = setInterval(() => { loadPlayers(room.id); }, 3000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [room?.id, loadPlayers, navigate, room]);


  // Navigate to game when status flips to playing
  useEffect(() => {
    if (room?.status === "playing") {
      navigate({ to: "/game/$code", params: { code } });
    }
  }, [room?.status, code, navigate]);

  if (loading || !room) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">로딩 중...</div>;
  }

  const isHost = room.host_id === user.id;
  const me = players.find((p) => p.user_id === user.id);
  const allReady = players.length >= 2 && players.every((p) => p.is_ready);

  const cfg = parseRoomConfig(room.map_name);
  const updateCfg = async (patch: Partial<ReturnType<typeof parseRoomConfig>>) => {
    if (!isHost) return;
    const next = { ...cfg, ...patch };
    await supabase.from("rooms").update({ map_name: encodeRoomConfig(next) }).eq("id", room.id);
  };

  const toggleReady = async () => {
    if (!me) return;
    await supabase.from("room_players").update({ is_ready: !me.is_ready }).eq("id", me.id);
  };

  // 술래 지원: 내 role을 seeker/null로 토글 (게임 시작 때 지원자 중에서 랜덤 선발)
  const toggleVolunteer = async () => {
    if (!me) return;
    await supabase.from("room_players")
      .update({ role: me.role === "seeker" ? null : "seeker" })
      .eq("id", me.id);
  };

  const leaveRoom = async () => {
    if (isHost) {
      // Host leaving -> delete room (cascade removes players)
      await supabase.from("rooms").delete().eq("id", room.id);
    } else {
      await supabase.from("room_players").delete().eq("id", me!.id);
    }
    navigate({ to: "/lobby", replace: true });
  };

  const startGame = async () => {
    if (!isHost) return;
    if (players.length < 2) return toast.error("최소 2명이 필요합니다");
    if (!allReady) return toast.error("모든 플레이어가 준비되어야 합니다");

    // 역할은 게임 화면에서 시드 기반으로 모두가 똑같이 계산한다 (설정된 헌터 수만큼)
    const { error } = await supabase.from("rooms")
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", room.id);
    if (error) toast.error("게임 시작 실패: " + error.message);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success("코드가 복사되었습니다");
  };

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <Link to="/lobby" className="font-bold tracking-widest text-primary text-glow">← 로비</Link>
        <Button variant="outline" size="sm" onClick={leaveRoom}>
          {isHost ? "방 닫기" : "방 나가기"}
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">방 코드</div>
          <button onClick={copyCode} className="mt-2 text-6xl font-mono tracking-[0.4em] text-primary text-glow hover:brightness-125 transition">
            {code}
          </button>
          <div className="mt-2 text-xs text-muted-foreground">클릭해서 코드 복사</div>
        </div>

        <Card className="bg-card/70 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>대기실 · {players.length}/{room.max_players}</CardTitle>
            {isHost && <Badge variant="outline" className="border-primary text-primary">방장</Badge>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/50">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                      {p.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div className="font-semibold">
                        {p.username}
                        {p.user_id === room.host_id && <span className="ml-2 text-xs text-primary">HOST</span>}
                        {p.user_id === user.id && <span className="ml-2 text-xs text-muted-foreground">(나)</span>}
                      </div>
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    {p.role === "seeker" && <Badge className="bg-[#ff3860] text-white">🔫 술래지원</Badge>}
                    {p.is_ready
                      ? <Badge className="bg-primary text-primary-foreground">READY</Badge>
                      : <Badge variant="outline">대기중</Badge>}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col md:flex-row gap-3">
              <Button variant={me?.is_ready ? "outline" : "default"} onClick={toggleReady} className="flex-1 h-12 tracking-widest">
                {me?.is_ready ? "준비 취소" : "준비 완료"}
              </Button>
              <Button variant={me?.role === "seeker" ? "destructive" : "outline"} onClick={toggleVolunteer} className="flex-1 h-12 tracking-widest">
                {me?.role === "seeker" ? "🔫 술래 지원 중 (취소)" : "🔫 술래 지원하기"}
              </Button>
              {isHost && (
                <Button onClick={startGame} disabled={!allReady} className="flex-1 h-12 tracking-widest" variant="secondary">
                  게임 시작 {!allReady && "(전원 준비 필요)"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6 bg-card/70 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">게임 설정 {!isHost && <span className="text-xs text-muted-foreground font-normal">(방장만 변경 가능)</span>}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">맵</div>
                {isHost ? (
                  <Select value={cfg.map} onValueChange={(v) => updateCfg({ map: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAP_LIST.map((m) => <SelectItem key={m.name} value={m.name}>{m.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <div className="font-semibold">{MAPS[cfg.map]?.displayName ?? cfg.map}</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">숨는 시간</div>
                {isHost ? (
                  <Select value={String(cfg.hide)} onValueChange={(v) => updateCfg({ hide: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[30, 60, 90, 120, 180].map((n) => <SelectItem key={n} value={String(n)}>{n}초</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <div className="font-semibold">{cfg.hide}초</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">찾는 시간</div>
                {isHost ? (
                  <Select value={String(cfg.seek)} onValueChange={(v) => updateCfg({ seek: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[120, 180, 300, 400, 600].map((n) => <SelectItem key={n} value={String(n)}>{n}초</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <div className="font-semibold">{cfg.seek}초</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">게임 모드</div>
                {isHost ? (
                  <Select value={cfg.mode} onValueChange={(v) => updateCfg({ mode: v as "basic" | "infect" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">일반전</SelectItem>
                      <SelectItem value="infect">감염전 🧟</SelectItem>
                    </SelectContent>
                  </Select>
                ) : <div className="font-semibold">{cfg.mode === "infect" ? "감염전 🧟" : "일반전"}</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">헌터 수</div>
                {isHost ? (
                  <Select value={String(cfg.seekers)} onValueChange={(v) => updateCfg({ seekers: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}명</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : <div className="font-semibold">{cfg.seekers}명</div>}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          최소 2명 · 술래는 지원자 중에서 랜덤으로 뽑혀요 (지원자가 없으면 전체에서 랜덤)
        </p>
      </main>
    </div>
  );
}
