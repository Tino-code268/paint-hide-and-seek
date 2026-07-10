# 4단계: 영상 스타일 전면 리메이크

참고 영상(메챠 카멜레온)의 UI/UX/캐릭터/맵 톤을 재현합니다.

## 1. 캐릭터 리디자인 (영상 스타일)
현재 스틱맨 → 영상의 "둥근 화이트 마스코트"로 교체.
- 큰 둥근 머리(눈 2개 + 웃는 입), 통통한 몸통, 짧은 팔/다리 (전부 흰색 매트 재질)
- 3인칭 기본 뷰(현재는 1인칭). 카메라는 캐릭터 뒤 상단.
- 걷기/달리기/앉기 애니메이션 유지, 팔 스윙만 살짝.

## 2. 인게임 페인팅 (핵심 변경)
현재: `P` 누르면 2D 캔버스 오버레이 → 주변이 안 보임.
변경: **주변을 보면서** 3인칭으로 자기 캐릭터에 직접 페인트.
- `P`로 페인트 모드 진입. 카메라는 캐릭터를 근접 3인칭으로 orbit(마우스 드래그로 회전/확대).
- 마우스 커서로 캐릭터 표면을 직접 클릭/드래그 → raycast로 mesh의 uv 좌표 계산 → 해당 부위 CanvasTexture에 stroke 기록.
- 하단 컴팩트 팔레트 바(색상 8개 + 브러시 크기 슬라이더 + 지우개). 좌측/우측 도구 아이콘은 영상처럼 세로 배치.
- 부위 선택 UI 제거(레이캐스트가 자동으로 부위 판정).
- 페인트 중에도 다른 플레이어/월드가 계속 렌더 → "숨어야 하는 배경"을 보면서 색 매칭 가능.

## 3. 상단 타이머 HUD (영상 스타일)
- 화면 상단 중앙: 큰 카운트다운 숫자 + 상태 라벨("숨을 시간" / "숨을 준비" / "찾는 시간").
- 우측 하단: "残り人数 N" 스타일 남은 플레이어 수.
- 우측 세로 아이콘 바: 페인트(P) / 시야(V) / 채팅(T).
- 게임 상태 머신을 방장이 관리(broadcast로 동기화): `hide_prep(15s) → hide(120s) → seek(350s) → end`.
- 이번 단계에서는 타이머/HUD/상태 표시까지만. 술래 총 발사/탈락 판정은 5단계.

## 4. 맵 퀄리티 상승 (AI 텍스처)
현재: 코드 primitive에 단색.
변경: 각 맵의 바닥/벽/주요 소품에 **AI 생성 텍스처 이미지**를 적용 → 영상의 벽지·나무바닥·벽돌 느낌.
- 이미지 생성: `imagegen--generate_image` (standard 품질, 1024×1024, seamless tileable prompt)로
  - `restaurant`: 진녹 다마스크 벽지 / 오크 마루 / 흰 격자 타일
  - `market`: 벽돌 벽 / 아스팔트 / 캔버스 천막
  - `arcade`: 어두운 카펫 / 네온 포스터 벽 / 금속 패널
- 각 텍스처는 `THREE.RepeatWrapping` + `anisotropy`로 타일링. 벽/바닥 material을 `MeshStandardMaterial({ map, roughness })`로 승격.
- 조명: `directionalLight`(태양) + 벽등(pointLight) 스팟 추가로 명암 대비 강화(현재는 너무 flat).
- 소품 몇 개(액자, 의자 등받이)에도 텍스처 적용.

외부 GLB는 번들/성능 리스크로 이번엔 배제. 텍스처만으로 영상 톤을 근사.

## 5. 모바일 / PC 컨트롤 선택
- 로비 상단에 "조작: [PC] [모바일]" 토글(localStorage 저장).
- **PC**: 현재대로 PointerLock + WASD + 마우스.
- **모바일**: 
  - 좌측 하단 가상 조이스틱(이동), 우측 하단 스와이프 영역(시점).
  - 우측 버튼: 점프 / 앉기 / 페인트.
  - `touch-action: none`, viewport meta 이미 설정.
  - 페인트 모드는 손가락 드래그로 캐릭터 표면에 그리기.
- 컨트롤 스킴 결정 로직: 저장값 우선 → 없으면 `matchMedia('(pointer: coarse)')`로 자동.

## 6. 파일 변경 요약
- `src/game/maps.ts`: 텍스처 URL 필드 추가, 조명 강화, wall material 업그레이드.
- `src/game/textures.ts` (신규): 텍스처 로더 + 캐시.
- `src/assets/textures/*.jpg.asset.json` (신규, imagegen으로 생성 후 lovable-assets 업로드).
- `src/game/PaintController.tsx` (신규): 3인칭 orbit + raycast 페인트.
- `src/game/Mascot.tsx` (신규): 캐릭터 컴포넌트(스마일 마스코트).
- `src/game/TouchControls.tsx` (신규): 조이스틱/버튼.
- `src/game/GamePhase.ts` (신규): 상태 머신 + broadcast 훅.
- `src/routes/_authenticated/game.$code.tsx`: 3인칭 카메라, 상단 타이머 HUD, 우측 아이콘 바, 조작 스킴 분기.
- `src/routes/_authenticated/lobby.tsx`: PC/모바일 토글.

## 7. 검증
Playwright로 로그인 → 방 생성(restaurant) → 게임 시작 → 스크린샷 3장:
1. 게임 뷰(3인칭 마스코트 + 상단 타이머 + 텍스처 벽지)
2. 페인트 모드(오버레이 없이 캐릭터에 직접 색칠)
3. 모바일 뷰(뷰포트 375×812로 조이스틱 확인)

---

## 이번 단계 제외 (5단계)
- 술래 총 발사(레이캐스트) / 피격 판정
- 탈락 및 관전 모드 전환
- 최종 승패 화면
