import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/game/$code")({
  component: GamePlaceholder,
});

function GamePlaceholder() {
  const { code } = Route.useParams();
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <div className="text-xs text-muted-foreground uppercase tracking-widest">Room {code}</div>
        <h1 className="mt-3 text-4xl font-bold text-glow">3D 페이즈 준비 중</h1>
        <p className="mt-4 text-muted-foreground">
          1단계(로그인 + 방 시스템)가 완성되었습니다. 다음 단계에서 R3F 3D 씬, WASD 이동, 다른 플레이어 위치 동기화가 추가됩니다.
        </p>
        <Link to="/room/$code" params={{ code }}>
          <Button className="mt-6" variant="outline">대기실로 돌아가기</Button>
        </Link>
      </div>
    </div>
  );
}
