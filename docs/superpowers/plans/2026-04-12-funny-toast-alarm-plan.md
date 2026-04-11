# FunnyToastAlarm — Implementation Plan

**Date:** 2026-04-12  
**Spec:** `docs/superpowers/specs/2026-04-12-funny-toast-alarm-design.md`  
**Stack:** Tauri 2.x + Rust + Vite + Vanilla TypeScript

---

## Phase 0: 프로젝트 스캐폴딩

### Step 0-1. Tauri 프로젝트 초기화
- `cargo tauri init` 으로 프로젝트 생성 (Vite + Vanilla TS 템플릿)
- `Cargo.toml` workspace 설정
- `.gitignore` 설정 (`.superpowers/` 포함)
- `tauri.conf.json` 기본 설정: 트레이 활성화, 메인 윈도우 숨김 시작

### Step 0-2. 의존성 추가
**Rust (Cargo.toml):**
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-ico", "image-png"] }
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
windows = { version = "0.58", features = ["Win32_UI_WindowsAndMessaging", "Win32_Foundation"] }
notify-rust = "4"   # Windows 알림음 재생
```

**Frontend (package.json):**
```json
"devDependencies": {
  "vite": "^5",
  "typescript": "^5",
  "@tauri-apps/api": "^2",
  "@tauri-apps/cli": "^2"
}
```

---

## Phase 1: Config 시스템

### Step 1-1. Config 스키마 정의 (`src-tauri/src/config.rs`)
- `AppConfig`, `NotificationConfig`, `EventConfig`, `ImageArea`, `SessionPos` 구조체 정의
- `serde` derive로 JSON 직렬화
- 기본값 구현 (`Default` trait)

### Step 1-2. Config 읽기/쓰기
- 실행파일 옆 `config.json` 로드 (없으면 기본값으로 생성)
- `Arc<RwLock<AppConfig>>`로 전역 상태 관리
- 설정 변경 시 즉시 파일에 저장하는 `save_config()` 함수

---

## Phase 2: HTTP 서버 (Hook 수신)

### Step 2-1. axum 서버 (`src-tauri/src/server.rs`)
- `POST /hook` 엔드포인트: Claude Code hook JSON 파싱
- 비활성 이벤트 → 200 OK 즉시 반환
- 활성 이벤트 → Tauri 이벤트 채널로 메인 앱에 전달

### Step 2-2. Hook 페이로드 구조체
```rust
struct HookPayload {
    session_id: String,
    hook_event_name: String,  // "Stop", "Notification", etc.
    cwd: Option<String>,
    pid: Option<u32>,
}
```

### Step 2-3. 포트 충돌 처리
- 바인딩 실패 시 Tauri 이벤트로 에러 전파 → 트레이 아이콘 경고 상태

---

## Phase 3: 세션 관리

### Step 3-1. 세션 레지스트리 (`src-tauri/src/session.rs`)
- `HashMap<String, SessionState>` — session_id → 창 핸들 + 상태
- `Arc<Mutex<SessionRegistry>>`로 서버/앱 간 공유

### Step 3-2. SessionState 구조체
```rust
struct SessionState {
    window_label: String,
    cwd: Option<String>,
    pid: Option<u32>,
    status: NotificationStatus,  // Idle | Active | Closing
}
```

---

## Phase 4: 알림 창

### Step 4-1. WebviewWindow 생성 (`src-tauri/src/notification.rs`)
- hook 수신 시 session_id 기반으로 창 존재 여부 확인
- 없으면: `WebviewWindowBuilder`로 프레임리스 + always-on-top + 투명 창 생성
  - 초기 위치: config의 sessions 맵 확인 → 없으면 우하단 계산
  - DPI: `monitor.scale_factor()` 읽어 물리 픽셀 위치 계산
- 있으면: `window.show()` + 프론트엔드에 이벤트 emit

### Step 4-2. 창 이동 시 위치 저장
- `on_window_event(WindowEvent::Moved)` → 논리 픽셀로 변환 후 config 저장

### Step 4-3. DPI 처리
- 창 생성/이동 시 `window.current_monitor()?.scale_factor()` 사용
- 물리 픽셀 ↔ 논리 픽셀 변환 헬퍼 함수

### Step 4-4. 알림 창 프론트엔드 (`src/notification/`)
- `index.html` + `main.ts`: 썸네일(80×80) + 세션 경로 + 이벤트 뱃지 레이아웃
- Tauri 이벤트 수신으로 상태 업데이트
- 드래그: `mousedown` → `appWindow.startDragging()`
- 클릭: `on_click_focus_session` 설정에 따라 Tauri command 호출

### Step 4-5. 이미지/애니메이션 렌더링 (`src/notification/image.ts`)
- 경로가 파일: `<img src>` 단일 표시
- 경로가 폴더: `0.png`부터 순서대로 `setInterval`로 프레임 전환
- 컨테이너 width/height/background-color/opacity CSS 적용
- DPI: CSS `image-rendering: pixelated` + 실제 픽셀 크기는 `devicePixelRatio` 반영

### Step 4-6. 사운드 재생 (`src-tauri/src/sound.rs`)
- `sound_path: null` → Windows 기본 알림음 (`MessageBeep`)
- 커스텀 경로 → `rodio` 또는 `windows-rs`의 `PlaySound`로 재생

### Step 4-7. Timeout 처리
- 활성 상태 진입 시 `tokio::time::sleep` 태스크 스폰
- timeout 동안 새 이벤트 오면 타이머 리셋
- 0 = timeout 없음

### Step 4-8. 클릭 → 세션 포커스 (`src-tauri/src/focus.rs`)
- `windows-rs`의 `EnumWindows` + `GetWindowThreadProcessId`로 pid 매칭
- 창 찾으면 `SetForegroundWindow` 호출

---

## Phase 5: 설정 GUI

### Step 5-1. 설정 창 생성
- 트레이 좌클릭 → 설정 `WebviewWindow` show/focus
- `tauri.conf.json`에 설정 창 사전 정의 (숨김 시작)

### Step 5-2. 설정 GUI 프론트엔드 (`src/settings/`)
- `index.html` + `main.ts`: 사이드바 레이아웃
- 3개 섹션: Hook 이벤트 / 알림 설정 / 일반
- Tauri `invoke('get_config')` → 초기 상태 로드
- 변경 시 `invoke('save_config', { config })` 호출

### Step 5-3. Hook 이벤트 섹션 (`src/settings/events.ts`)
- 이벤트 목록 렌더링 + 토글
- 이벤트 클릭 시 세부 설정 패널 인라인 펼침
- 파일/폴더 선택: `open()` dialog (Tauri dialog 플러그인)

### Step 5-4. 실시간 미리보기 (`src/settings/preview.ts`)
- 이미지 설정 변경 시 설정 창 내 미리보기 패널 즉시 업데이트
- 알림 창과 동일한 `image.ts` 로직 재사용
- 애니메이션 미리보기: 실제 frame_interval_ms 속도로 재생
- 저장 전 확인 가능

### Step 5-5. 알림 설정 섹션 (`src/settings/notification.ts`)
- timeout 입력, 클릭 동작 선택, 닫기 애니메이션 설정

### Step 5-6. 일반 섹션 (`src/settings/general.ts`)
- 포트 번호 입력
- 자동 시작 토글 → `invoke('set_auto_start', { enabled })`
- **Claude Code Hook 자동 설정** 버튼 → `invoke('configure_claude_hooks')`

### Step 5-7. Claude Code Hook 자동 설정 (`src-tauri/src/hooks_config.rs`)
- `%USERPROFILE%\.claude\settings.json` 경로 탐색
- 파일 없으면 생성, 있으면 JSON 파싱
- 파싱 실패 시 `.bak` 백업 후 재생성
- hooks 항목 병합 (현재 활성 이벤트 + 포트 기준)
- 성공/실패 결과 반환 → 프론트엔드 인라인 피드백
- 쓰기 실패 시 JSON 스니펫 클립보드 복사

---

## Phase 6: 트레이 & 앱 생명주기

### Step 6-1. 트레이 아이콘 설정
- 좌클릭: 설정 창 토글
- 우클릭: 컨텍스트 메뉴 (종료)
- 포트 충돌 시: 경고 아이콘으로 교체

### Step 6-2. 앱 시작 시
- config.json 로드
- HTTP 서버 시작 (별도 tokio 태스크)
- 트레이 아이콘 등록
- 메인 윈도우 숨김

### Step 6-3. 앱 종료 시
- 모든 알림 창 닫기
- sessions 위치 데이터 config에 저장

---

## Phase 7: 마무리

### Step 7-1. 빌드 & 패키징
- `cargo tauri build`
- 실행파일 옆 `config.json` 기본값 파일 포함
- 기본 Claude 아이콘 에셋 포함

### Step 7-2. 수동 테스트 체크리스트
- [ ] curl로 각 hook 이벤트 전송 → 알림 창 표시 확인
- [ ] 알림 창 드래그 → 위치 저장 → 앱 재시작 후 위치 유지 확인
- [ ] 애니메이션 이미지 폴더 지정 → 미리보기 + 실제 알림에서 재생 확인
- [ ] DPI 125%/150% 환경에서 창 선명도 확인
- [ ] 멀티모니터 드래그 시 DPI 재조정 확인
- [ ] Claude Code Hook 자동 설정 버튼 → settings.json 확인
- [ ] timeout 0 (없음) / 유효 값 동작 확인
- [ ] 포트 충돌 시 트레이 경고 표시 확인

---

## 구현 순서 요약

```
Phase 0 (스캐폴딩)
  → Phase 1 (Config)
  → Phase 2 (HTTP 서버)
  → Phase 3 (세션 관리)
  → Phase 4 (알림 창 — 백엔드 → 프론트엔드 순)
  → Phase 5 (설정 GUI — 백엔드 커맨드 → 프론트엔드 순)
  → Phase 6 (트레이 & 생명주기)
  → Phase 7 (빌드 & 테스트)
```

각 Phase는 독립적으로 동작 가능한 상태로 완성 후 다음으로 진행.
