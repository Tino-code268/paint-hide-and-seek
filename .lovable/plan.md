## 2단계: 3D 씬 + 이동 + 실시간 위치 동기화

### 패키지 설치
- `three`, `@react-three/fiber`, `@react-three/drei`

### 맵 (`src/game/maps.ts`)
3개 맵을 코드로 정의 (프로시저럴 박스/벽 구성, 각 맵 개성 있게):
- `warehouse` — 넓은 창고, 컨테이너 상자 배치, 중앙 통로
- `office` — 방 여러 개 + 복도 (벽 파티션으로 구획)
- `arena` — 원형 경기장, 원기둥/장애물 클러스터
각 맵: `{ name, floorSize, walls: [{pos,size,color}], props: [...], spawnPoints: [] }` 구조.
방 만들 때 로비에 맵 선택 드롭다운 추가 → `rooms.map_name`에 저장.

### 3D 씬 (`/game/$code`)
`src/routes/_authenticated/game.$code.tsx` 를 R3F Canvas로 대체:
- `<Canvas>` + `PointerLockControls` (1인칭)
- 맵 지오메트리 렌더 (바닥, 벽, 프롭)
- 로컬 플레이어: 카메라 = 눈 위치, 물리 없이 간단한 AABB 벽 충돌
- 조작: WASD 이동, Shift 달리기, Space 점프(중력 시뮬), C 앉기(카메라 낮춤 + 이동속도↓)
- 마우스 클릭으로 pointer lock 활성화, ESC로 해제
- 상단 HUD: 방 코드, 내 역할(hider/seeker), 플레이어 수, "대기실로" 버튼

### 다른 플레이어 동기화 (Broadcast)
- `src/game/usePresence.ts` 훅
- 채널: `supabase.channel(\`game:${roomId}\`, { config: { broadcast: { self: false } } })`
- 로컬: 약 15Hz(66ms)로 `{userId, x,y,z, ry, crouch}` broadcast
- 원격: 마지막 상태를 map으로 보관, 렌더에서 lerp 보간
- 원격 플레이어: 캡슐 메시 + 이름 태그(`<Html>` from drei), 역할별 색상 (숨는 사람=시안, 술래=빨강, 자기 자신은 안 그림)
- 언마운트 시 채널 정리

### 시작/역할 로딩
- 씬 마운트 시 `rooms` + `room_players` (내 role) fetch
- `rooms.status !== "playing"`이면 대기실로 리다이렉트
- 3D 좌표 스폰: `spawnPoints[playerIndex % n]`

### 로비 맵 선택
- 방 만들기 카드에 select(warehouse/office/arena) 추가, `handleCreate`에 `map_name` 포함

### 검증
Playwright로 로그인 → 방 만들기(맵 선택) → 게임 시작 → Canvas 렌더 및 pointer lock, HUD 표시 스크린샷 확인.

### 3단계 (다음)
숨는 시간 120s / 찾는 시간 350s 타이머, 총 발사(레이캐스트), 탈락/관전, 승패 판정.
