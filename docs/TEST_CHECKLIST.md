# Phase 7 — 빌드 검증 및 수동 테스트 체크리스트

## 빌드 결과

| 단계 | 명령 | 결과 |
|------|------|------|
| Frontend (Vite) | `npm run build` | 23 modules, 7 output files — OK |
| Backend (Rust) | `cargo build` (debug) | 컴파일 성공, 경고 없음 — OK |

## 버그 수정 내역 (Phase 7에서 발견)

### 1. `event_config` 페이로드 누락
- **문제:** `notification-show` 이벤트 페이로드에 `event_config` 필드가 없어서 프론트엔드가 커스텀 이미지/애니메이션 설정을 받지 못했음
- **수정:** `NotificationShowPayload`에 `event_config: EventConfig` 필드 추가, `EventConfig`에 `Default` trait 구현, 두 emit 지점에서 config 포함
- **파일:** `src-tauri/src/notification.rs`, `src-tauri/src/config.rs`

### 2. Vite 빌드 출력 경로 vs. Tauri URL 불일치
- **문제:** Vite는 `dist/src/notification/index.html`로 출력하지만 `tauri.conf.json`과 `notification.rs`는 `notification/index.html`을 참조했음
- **수정:** `tauri.conf.json` 창 URL과 `WebviewUrl::App()` 경로를 `src/notification/index.html`, `src/settings/index.html`로 수정
- **파일:** `src-tauri/tauri.conf.json`, `src-tauri/src/notification.rs`

### 3. 기본 아이콘 에셋 미포함
- **문제:** `image.ts`가 `/assets/default-icon.png`를 참조하지만 `src/notification/assets/`는 Vite public 디렉토리가 아니어서 dist에 복사되지 않음
- **수정:** `public/assets/default-icon.png`로 복사하여 Vite가 자동으로 dist에 포함하도록 함
- **파일:** `public/assets/default-icon.png` (신규)

---

## 수동 테스트 체크리스트

### [코드 검사 OK] curl로 각 hook 이벤트 전송 → 알림 창 표시 확인

`server.rs`의 `handle_hook` handler는 `POST /hook`을 수신하고, `hook_event_name`이 config에서 enabled인 경우 `event_tx`로 전송한다. `notification.rs`의 `handle_hook_event`가 이를 받아 Tauri 창을 생성하거나 기존 창을 갱신한다.

테스트 명령:
```bash
curl -s -X POST http://localhost:12759/hook \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-001","hook_event_name":"Stop","cwd":"/tmp"}'
```

**상태:** 런타임 테스트 필요

---

### [코드 검사 OK] 알림 창 드래그 → 위치 저장 → 앱 재시작 후 위치 유지 확인

`notification.rs`의 `window.on_window_event` 핸들러에서 `WindowEvent::Moved(pos)`를 감지하고:
1. DPI scale으로 논리 픽셀 변환
2. `config.sessions`에 `SessionPos { window_x, window_y }` 저장
3. 즉시 `config::save_config()`로 디스크에 기록

재시작 시 `load_config()`가 이를 읽고, 새 창 생성 시 `saved_pos`를 적용한다.

**상태:** 런타임 테스트 필요

---

### [코드 검사 OK] 애니메이션 이미지 폴더 지정 → 미리보기 + 실제 알림에서 재생 확인

`image.ts`의 `setImage()` 함수:
1. `readDir(imagePath)` 시도
2. `^\d+\.(png|gif|jpg|webp)$` 패턴으로 파일 필터링 및 숫자 정렬
3. 2개 이상이면 `setInterval`로 `frame_interval_ms` 간격 애니메이션
4. 1개면 정적 이미지, 실패하면 파일 경로 직접 사용

`event_config.image_path`와 `frame_interval_ms`가 이제 payload에 포함되어 정상 동작한다.

설정 UI의 preview 기능은 `src/settings/preview.ts`에서 동일한 `setImage()` 함수를 사용한다.

**상태:** 런타임 테스트 필요

---

### [코드 검사 OK] DPI 125%/150% 환경에서 창 선명도 확인

`notification.rs`의 창 생성 시:
- `WebviewWindowBuilder`는 내부 사이즈를 논리 픽셀로 지정 (Tauri 2.x 기본)
- `get_bottom_right_position()`은 `monitor.scale_factor()`로 물리 픽셀 위치를 계산
- 저장된 위치 복원 시에도 scale factor를 적용하여 올바른 물리 픽셀로 변환

창 투명도는 `.transparent(true)`로 설정되어 OS가 DPI 스케일링을 처리한다.

**상태:** 런타임 테스트 필요 (물리적 DPI 환경 필요)

---

### [코드 검사 OK] 멀티모니터 드래그 시 DPI 재조정 확인

`WindowEvent::Moved` 핸들러에서 `window_clone.current_monitor()`를 호출하여 **현재 창이 있는 모니터**의 scale factor를 사용한다. 따라서 다른 DPI 모니터로 드래그 시 해당 모니터의 scale factor가 적용되어 위치가 올바르게 저장된다.

**상태:** 런타임 테스트 필요 (멀티모니터 환경 필요)

---

### [코드 검사 OK] Claude Code Hook 자동 설정 버튼 → settings.json 확인

`commands.rs`의 `configure_claude_hooks` 커맨드가 `hooks_config::configure_hooks(port, &enabled_events)`를 호출한다. `hooks_config.rs`는:
1. `%USERPROFILE%\.claude\settings.json` 읽기 (없으면 생성)
2. 손상된 경우 `.bak` 백업
3. enabled 이벤트 hook 항목 병합 (다른 키 보존)
4. 디스크에 저장

설정 UI의 "Claude Code 연동" 버튼이 이 커맨드를 호출한다 (`src/settings/general.ts`).

**상태:** 런타임 테스트 필요

---

### [코드 검사 OK] timeout 0 (없음) / 유효 값 동작 확인

`notification.rs`의 `start_timeout()`:
```rust
if timeout_secs == 0 {
    return;  // 즉시 종료 — 타이머 없음
}
```
0이면 함수 즉시 반환, 양수면 `tokio::time::sleep` 후 `notification-closing` 이벤트 발생 + 600ms grace period 후 강제 hide.

**상태:** 코드 검사로 확인됨 — 0 처리 명확함, 런타임 확인 권장

---

### [코드 검사 OK] 포트 충돌 시 트레이 경고 표시 확인

`lib.rs`에서 서버 시작 실패 시:
```rust
if let Err(e) = server::start_server(port, config_clone, tx).await {
    if let Some(tray) = handle_for_server.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(
            "FunnyToastAlarm — 포트 충돌! 설정에서 포트를 변경하세요.",
        ));
    }
}
```
`TcpListener::bind` 실패 시 tray tooltip이 경고 메시지로 변경된다.

**상태:** 코드 검사로 확인됨, 런타임 테스트 권장 (포트 점유 후 실행)

---

## 코드 검사만으로 확인된 항목

- timeout 0 처리 로직
- 포트 충돌 tray 경고 로직

## 런타임 테스트가 필요한 항목

- curl hook 전송 → 알림 창 표시
- 드래그 → 위치 저장 → 재시작 유지
- 애니메이션 폴더 지정 → 재생
- DPI 스케일링 창 선명도
- 멀티모니터 DPI 재조정
- Claude Code Hook 자동 설정
