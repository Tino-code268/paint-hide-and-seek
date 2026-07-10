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
            새하얀 몸에 주변 색을 칠해 배경 속으로 녹아들어라. 헌터는 페인트 샷건을 들고 사냥한다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to="/auth" className="px-6 py-3 rounded-md bg-primary text-primary-foreground font-semibold uppercase tracking-wider hover:brightness-110 transition">
              게임 시작
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            {[
              { t: "준비 10초 · 은신 120초", d: "헌터의 시야가 차단된 동안 E로 색을 추출하고 F로 몸을 칠해 배경에 녹아드세요. Q로 벽에 붙고 R로 포즈를 바꿔 완벽하게 위장!" },
              { t: "추격 400초", d: "헌터는 페인트 샷건을 들고 사냥합니다. 끝까지 살아남는 카멜레온이 승리합니다." },
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
