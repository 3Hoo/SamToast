# FunnyToastAlarm — Design Spec

**Date:** 2026-04-12  
**Stack:** Tauri + Rust (backend) + Vite + Vanilla TypeScript (frontend)

---

## 1. 목적

Claude Code hook 이벤트 발생 시 유저에게 커스텀 토스트 알림을 보여주는 데스크탑 앱.  
세션당 알림 창이 독립적으로 존재하며, 이미지/사운드/동작을 자유롭게 커스터마이즈할 수 있다.

---

## 2. 전체 아키텍처

### Cargo Workspace 구조

```
FunnyToastAlarm/
├── src-tauri/              메인 Tauri 앱
│   ├── src/
│   │   ├── main.rs         트레이 + 윈도우 관리 + HTTP 서버 초기화
│   │   ├── server.rs       axum HTTP 서버 (hook 수신, 포트: 12759 기본)
│   │   ├── notification.rs 세션별 알림 창 생성/관리
│   │   ├── session.rs      세션 상태 (session_id, pid, 창 위치 등)
│   │   ├── config.rs       config.json 읽기/쓰기
│   │   └── focus.rs        Windows API로 터미널 창 포커스
│   └── tauri.conf.json
├── src/                    프론트엔드
│   ├── notification/       알림 창 UI (Vanilla TS)
│   └── settings/           설정 GUI UI (Vanilla TS)
├── config.json             실행파일 옆 (포터블)
└── Cargo.toml              workspace 루트
```

### 데이터 흐름

```
Claude Code hook 발생
  → stdin JSON → curl POST http://localhost:12759/hook
  → axum 핸들러 → session_id로 기존 창 조회
  → 새 세션: WebviewWindow 생성
    기존 세션: 숨김이면 재표시 + 이벤트 전달 / 활성이면 이벤트만 업데이트
  → 프론트엔드: 이미지/사운드 재생 + 알림 표시
```

### Hook 수신 방식

- **로컬 HTTP 서버** (axum): `POST /hook`
- Claude Code `settings.json` hooks 설정:
  ```json
  {
    "hooks": {
      "Stop": [{ "matcher": "", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:12759/hook -H \"Content-Type: application/json\" -d @-" }] }]
    }
  }
  ```
- 비활성 이벤트 요청 → 200 OK 후 무시 (hook 블록 방지)

---

## 3. 알림 창

### 창 속성

- 프레임리스(frameless), 항상 위(always-on-top), 투명 배경
- 초기 위치: 우하단. 드래그 후 위치는 세션별로 config에 저장
- 드래그: `mousedown` → `window.__TAURI__.window.appWindow.startDragging()`

### 표시 상태

| 상태 | 설명 |
|------|------|
| `idle` | 숨김 또는 최소 크기 대기 |
| `active` | 이미지 + 이벤트 뱃지 + 세션 경로 표시 |
| `closing` | 닫기 전용 이미지/애니메이션 재생 후 숨김 |

### 알림 창 레이아웃 (C형 — 썸네일 + 정보)

```
┌─────────────────────────────┐
│ [이미지 80×80]  Claude Code │
│                /project/foo │
│                [Stop] badge │
└─────────────────────────────┘
```

### 이미지 애니메이션

- 이미지 경로가 **파일**: 단일 이미지 표시
- 이미지 경로가 **폴더**: `0.png`, `1.png`, `2.png`... 순으로 프레임 전환
- 프레임 간격: 이벤트별 설정 (기본 100ms)
- 폴더에 `0.png` 없으면 기본 이미지로 폴백

### 이미지 컨테이너 설정 (이벤트별)

- **표시 영역**: width × height (px) — 논리적 픽셀(logical pixel) 기준
- **배경색**: hex 색상
- **배경 투명도**: 0~100%

### DPI 지원

- 알림 창은 Tauri의 `ScaleFactor` API로 현재 모니터 DPI 배율을 읽어 물리적 픽셀로 변환
- 이미지 표시 영역(width × height)은 논리 픽셀로 저장, 렌더링 시 `scale_factor`를 곱해 선명하게 표시
- 창 위치(window_x, window_y)도 논리 픽셀로 저장, 모니터 간 이동 시 해당 모니터의 scale_factor로 재계산
- 멀티모니터 환경에서 DPI가 다른 모니터로 창을 드래그하면 자동으로 재조정

### Timeout

- 활성 상태 진입 후 N초 뒤 자동으로 `closing` 상태 전환
- `0` = timeout 없음

### 클릭 동작

- **이동**: 대상 Claude Code 터미널 창을 Windows API로 포커스 / 없음
- **창 반응**: 즉시 닫기 / 닫기 애니메이션 재생 후 닫기

---

## 4. 설정 GUI

**열기:** 트레이 아이콘 **좌클릭**  
**닫기/종료:** 트레이 **우클릭** → 컨텍스트 메뉴

### 레이아웃 (B형 — 사이드바)

```
┌─────────────┬──────────────────────────────────┐
│ Hook 이벤트  │  [선택된 섹션 콘텐츠]             │
│ 알림 설정    │                                  │
│ 일반         │                                  │
└─────────────┴──────────────────────────────────┘
```

### Hook 이벤트 섹션

이벤트 목록: `Stop` / `Notification` / `PreToolUse` / `PostToolUse` / `SubagentStop`  
기본 활성: `Stop`, `Notification`  

각 이벤트 토글 + 클릭 시 세부 설정 인라인 펼침:
- 알림음 경로 (파일 선택, 기본값: Windows 알림음)
- 알림 이미지 경로 (파일 또는 폴더 선택, 기본값: Claude 아이콘)
- 이미지 표시 영역 (width × height px, 논리 픽셀)
- 이미지 배경색 (색상 피커)
- 이미지 배경 투명도 (슬라이더 0~100%)
- 애니메이션 프레임 간격 (ms, 폴더 지정 시 활성화)
- **실시간 미리보기**: 이미지 경로, 표시 영역, 배경색, 투명도, 프레임 간격 변경 시 설정 창 내 인라인 미리보기 패널에 즉시 반영. 애니메이션도 실제 재생 속도로 미리보기. 저장 전에 확인 가능.

### 알림 설정 섹션

- Timeout (초, 0 = 없음)
- 클릭 시 이동: `대상 세션 포커스` / `없음`
- 클릭 시 창 반응: `즉시 닫기` / `닫기 애니메이션 후 닫기`
  - 후자 선택 시: 닫기 전용 이미지/폴더 경로 설정

### 일반 섹션

- HTTP 포트 번호 (기본: 12759)
- 앱 자동 시작 (Windows 레지스트리)
- **Claude Code Hook 자동 설정** 버튼:
  - `%USERPROFILE%\.claude\settings.json` 읽기 → hooks 항목 병합 후 저장
  - 기존 설정 있으면 덮어쓸지 확인 다이얼로그
  - `settings.json` 없으면 새로 생성
  - JSON 파싱 실패 시 `.bak` 백업 후 진행
  - 쓰기 권한 없으면 에러 + 수동 설정용 JSON 클립보드 복사 제공
  - 성공/실패 인라인 피드백 표시

---

## 5. Config 스키마

파일 위치: 실행파일 옆 `config.json` (포터블)

```json
{
  "port": 12759,
  "auto_start": false,
  "notification": {
    "timeout_secs": 5,
    "on_click_focus_session": true,
    "on_click_close": "animate",
    "close_image_path": null
  },
  "events": {
    "Stop": {
      "enabled": true,
      "sound_path": null,
      "image_path": null,
      "image_area": { "width": 80, "height": 80 },
      "image_bg_color": "#000000",
      "image_bg_opacity": 0.0,
      "frame_interval_ms": 100
    },
    "Notification": {
      "enabled": true,
      "sound_path": null,
      "image_path": null,
      "image_area": { "width": 80, "height": 80 },
      "image_bg_color": "#000000",
      "image_bg_opacity": 0.0,
      "frame_interval_ms": 100
    },
    "PreToolUse":   { "enabled": false },
    "PostToolUse":  { "enabled": false },
    "SubagentStop": { "enabled": false }
  },
  "sessions": {
    "abc123": { "window_x": 1820, "window_y": 900 }
  }
}
```

`null` 값 = 기본값 사용 (sound: Windows 알림음, image: Claude 아이콘)

---

## 6. 에러 처리

### HTTP 서버
- 포트 충돌 → 트레이 아이콘 경고 + 설정 GUI 인라인 에러
- 비활성 이벤트 → 200 OK 후 무시
- 잘못된 JSON → 400 반환, 로그 기록

### Config 폴백
- `on_click_close: "animate"`이지만 `close_image_path: null`인 경우 → 닫기 애니메이션 없이 즉시 닫기로 폴백
- 앱 재시작 시 `sessions` 맵의 위치 데이터(window_x, window_y)는 유지, 활성 세션 상태만 초기화

### 알림 창
- 이미지 경로 없음/파일 없음 → Claude 아이콘으로 폴백
- 폴더에 `0.png` 없음 → 단일 이미지 폴백
- 기존 세션 창에 새 이벤트 → 숨김이면 재표시, 활성이면 이벤트만 업데이트

### 세션 종료
- `Stop` 이벤트 수신 → timeout 처리 후 창 닫기
- 앱 재시작 → sessions 맵 초기화 (위치 정보만 유지)

---

## 7. 결정 사항 요약

| 항목 | 결정 |
|------|------|
| Hook 이벤트 | 5종 전체 지원, 기본 Stop/Notification 활성 |
| 세션 이동 | Windows API로 터미널 창 포커스 |
| 세션 관리 | session_id별 독립 창, 드래그 가능, 위치 저장 |
| 알림 창 스타일 | 썸네일 + 정보 (C형) |
| 설정 GUI | 사이드바 방식 (B형) |
| Hook 수신 | 로컬 HTTP 서버 (axum) |
| Config 저장 | 실행파일 옆 config.json (포터블) |
| 프론트엔드 | Vite + Vanilla TypeScript |
| DPI | 논리 픽셀 기준 저장, 모니터 scale_factor로 렌더링 시 변환 |
| 설정 미리보기 | 이미지/배경 설정 변경 시 설정 창 내 인라인 실시간 미리보기 |
