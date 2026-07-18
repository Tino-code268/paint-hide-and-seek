import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { generateRoomCode } from "@/lib/auth-helpers";
import { MAP_LIST } from "@/game/maps";
import { getControlScheme, setControlScheme, type ControlScheme } from "@/game/controls";

export const Route = createFileRoute("/_authenticated/lobby")({
  component: Lobby,
});

function Lobby() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>("");
  const [stats, setStats] = useState({ wins: 0, losses: 0 });
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapName, setMapName] = useState<string>("house");
  const [editingNick, setEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState("");

  const saveNick = async () => {
    const t = nickInput.trim();
    if (t.length < 1 || t.length > 12) return toast.error("닉네임은 1~12자");
    const { error } = await supabase.from("profiles").update({ username: t }).eq("id", user.id);
    if (error) return toast.error("이미 있는 닉네임이에요! 다른 걸로 해봐");
    setUsername(t);
    setEditingNick(false);
    toast.success("닉네임 변경 완료!");
  };
  const [scheme, setScheme] = useState<ControlScheme>(() => getControlScheme());
  const applyScheme = (s: ControlScheme) => { setScheme(s); setControlScheme(s); };


  useEffect(() => {
    supabase.from("profiles").select("username, wins, losses").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username);
          setStats({ wins: data.wins, losses: data.losses });
        }
      });
  }, [user.id]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      // Try a few codes in case of unique collision
      let code = "";
      let roomId = "";
      for (let i = 0; i < 5; i++) {
        code = generateRoomCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({ code, host_id: user.id, map_name: mapName, max_players: 30 })
          .select("id")
          .single();
        if (!error && data) { roomId = data.id; break; }

      }
      if (!roomId) throw new Error("방 생성 실패");

      const { error: joinErr } = await supabase.from("room_players").insert({
        room_id: roomId, user_id: user.id, is_ready: true,
      });
      if (joinErr) throw joinErr;

      navigate({ to: "/room/$code", params: { code } });
    } catch (e) {
      toast.error("방 생성 실패: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(joinCode)) return toast.error("6자리 숫자 코드를 입력하세요");
    setBusy(true);
    try {
      const { data: room, error } = await supabase
        .from("rooms").select("id, status").eq("code", joinCode).maybeSingle();
      if (error || !room) throw new Error("방을 찾을 수 없습니다");
      if (room.status !== "waiting") throw new Error("이미 시작된 방입니다");

      // Upsert player row (ignore duplicate)
      const { error: joinErr } = await supabase.from("room_players")
        .upsert({ room_id: room.id, user_id: user.id }, { onConflict: "room_id,user_id" });
      if (joinErr) throw joinErr;

      navigate({ to: "/room/$code", params: { code: joinCode } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <Link to="/" className="font-bold tracking-widest text-primary text-glow">MECHA · CHAMELEON</Link>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-muted-foreground flex items-center gap-2">
            {editingNick ? (
              <span className="flex items-center gap-1">
                <Input value={nickInput} onChange={(e) => setNickInput(e.target.value)} maxLength={12}
                  className="h-8 w-32 text-sm" placeholder="새 닉네임"
                  onKeyDown={(e) => { if (e.key === "Enter") saveNick(); }} autoFocus />
                <Button size="sm" className="h-8 px-2" onClick={saveNick}>저장</Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingNick(false)}>취소</Button>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="text-foreground font-semibold">{username || "..."}</span>
                <button onClick={() => { setNickInput(username); setEditingNick(true); }}
                  className="text-xs opacity-60 hover:opacity-100" title="닉네임 변경">✏️</button>
              </span>
            )}
            <span className="ml-2 text-xs">W {stats.wins} · L {stats.losses}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>로그아웃</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-widest text-glow">로비</h1>
          <p className="mt-2 text-muted-foreground text-sm">방을 만들거나 코드로 참가하세요</p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border border-border/60 overflow-hidden text-sm">
            <span className="px-3 py-2 bg-muted/40 text-muted-foreground">조작</span>
            <button
              onClick={() => applyScheme("pc")}
              className={`px-4 py-2 transition ${scheme === "pc" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
            >PC (WASD)</button>
            <button
              onClick={() => applyScheme("mobile")}
              className={`px-4 py-2 transition ${scheme === "mobile" ? "bg-primary text-primary-foreground" : "hover:bg-muted/40"}`}
            >모바일 (터치)</button>
          </div>
        </div>


        <div className="grid gap-6 md:grid-cols-2">
          <Card className="bg-card/70 border-border/60">
            <CardHeader>
              <CardTitle>방 만들기</CardTitle>
              <CardDescription>새 방을 열고 6자리 코드를 친구들에게 공유합니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="map">맵 선택</Label>
                <Select value={mapName} onValueChange={setMapName}>
                  <SelectTrigger id="map"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAP_LIST.map((m) => (
                      <SelectItem key={m.name} value={m.name}>{m.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} disabled={busy} className="w-full h-14 text-lg tracking-widest">
                {busy ? "..." : "새 방 생성"}
              </Button>
            </CardContent>

          </Card>

          <Card className="bg-card/70 border-border/60">
            <CardHeader>
              <CardTitle>방 참가하기</CardTitle>
              <CardDescription>친구가 알려준 6자리 코드로 입장합니다</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">방 코드</Label>
                  <Input
                    id="code" inputMode="numeric" maxLength={6}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
                <Button type="submit" disabled={busy || joinCode.length !== 6} className="w-full h-14 tracking-widest" variant="secondary">
                  참가
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
