## 문제

방장 화면에서 나중에 참가한 플레이어가 목록에 나타나지 않음. 친구(뒤에 참가한 쪽)에서는 방장이 보임 — 자기 화면에서 `loadPlayers()`가 한 번 실행되기 때문. 방장 쪽은 참가 이후 발생한 `INSERT` 이벤트를 받아야 갱신되는데, Realtime 채널이 인증 토큰이 소켓에 반영되기 전에 subscribe되면 RLS 필터에 걸려 이벤트가 배달되지 않는 케이스입니다.

## 1단계 버그 수정 (`src/routes/_authenticated/room.$code.tsx`)

1. 채널 구독 전에 명시적으로 Realtime 인증 토큰 세팅:
   - `const { data: { session } } = await supabase.auth.getSession();`
   - `supabase.realtime.setAuth(session.access_token)`
2. `.subscribe((status) => ...)` 콜백에서 상태 로깅하고, `CHANNEL_ERROR`/`TIMED_OUT`이면 재시도.
3. 안전망으로 대기실 상태일 때 3초 간격 폴링(`setInterval`)을 두어 Realtime이 실패해도 목록이 최신화되도록. (게임 시작 후에는 clear)
4. 방 참가 직후(로비 → 방 이동) 첫 렌더에서 `loadPlayers`가 한 번 확실히 실행되도록 유지.

## 검증

Playwright로 두 세션(방장 + 참가자)을 띄워, 참가자가 조인한 뒤 방장 화면의 플레이어 목록에 참가자가 나타나는지 스크린샷으로 확인.

## 다음 단계 (2단계) — 버그 수정 후 이어서 진행

- React Three Fiber 설치 및 `/game/$code` 라우트에 3D 씬 구성
- 3개 맵 중 하나 선택 (방 생성 시 map_name으로 저장된 값 사용) — MVP는 박스/벽으로 구성된 실내 맵 1개 먼저, 이후 2개 추가
- WASD 이동 + 마우스 시점 회전 (PointerLockControls)
- 점프/앉기
- 다른 플레이어 위치 실시간 동기화: Supabase Realtime **Broadcast** 채널(초당 ~15회 위치 송신, DB 부하 방지)
- 각 플레이어를 캡슐 메시로 표시, 역할별 색상

3단계(숨는 시간/찾는 시간/총 발사/승패)는 2단계 완료 후 별도 계획으로.
