import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/50 backdrop-blur">
        <div className="font-bold tracking-widest text-primary text-glow">MECHA · CHAMELEON</div>
        <nav className="flex gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">로그인</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <div className="inline-block px-3 py-1 mb-6 rounded-full border border-primary/40 text-xs tracking-widest text-primary uppercase">
            3D · Multiplayer · Real-time
          </div>
          <h1 className="text-6xl md:text-7xl font-bold text-glow leading-tight">
            메챠 카멜레온
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            친구들과 방을 만들어 3D 공간을 뛰어다니는 멀티플레이 숨바꼭질. 카멜레온처럼 숨거나, 사냥꾼처럼 추적하라.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/auth" className="px-6 py-3 rounded-md bg-primary text-primary-foreground font-semibold uppercase tracking-wider hover:brightness-110 transition">
              게임 시작
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              { t: "120초 은신 페이즈", d: "술래의 시야가 차단된 동안 3D 맵을 자유롭게 탐색하며 숨을 곳을 찾으세요." },
              { t: "350초 추격 페이즈", d: "술래는 총을 들고 사냥합니다. 살아남는 카멜레온이 승리합니다." },
              { t: "6자리 방 코드", d: "코드 하나로 친구들을 즉시 초대. Realtime 동기화로 랙 없는 플레이." },
            ].map((f) => (
              <div key={f.t} className="rounded-lg border border-border bg-card/50 p-4">
                <div className="text-sm text-primary font-semibold uppercase tracking-wider">{f.t}</div>
                <div className="mt-2 text-sm text-muted-foreground">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="p-4 text-center text-xs text-muted-foreground">
        1단계 빌드: 로그인 & 방 시스템 · 곧 3D 게임 페이즈가 추가됩니다.
      </footer>
    </div>
  );
}
