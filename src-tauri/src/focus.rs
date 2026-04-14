// SamToast - Session window focus (Step 4-8)

/// Attempt to bring the terminal window associated with `pid` to the foreground.
///
/// Returns `true` if a matching window was found and focused.
#[cfg(target_os = "windows")]
pub fn focus_session_window(pid: u32) -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
    };

    struct SearchState {
        target_pid: u32,
        found: AtomicBool,
    }

    let state = Arc::new(SearchState {
        target_pid: pid,
        found: AtomicBool::new(false),
    });

    // SAFETY: The closure is passed as an LPARAM; its lifetime is tied to this
    // stack frame, and EnumWindows is synchronous on the calling thread.
    let state_ptr = Arc::as_ptr(&state) as isize;

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = &*(lparam.0 as *const SearchState);

        let mut window_pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut window_pid));

        if window_pid == state.target_pid && IsWindowVisible(hwnd).as_bool() {
            let _ = SetForegroundWindow(hwnd).ok();
            state.found.store(true, Ordering::Relaxed);
            // Return FALSE to stop enumeration
            BOOL(0)
        } else {
            BOOL(1) // continue
        }
    }

    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(state_ptr));
    }

    state.found.load(std::sync::atomic::Ordering::Relaxed)
}

#[cfg(not(target_os = "windows"))]
pub fn focus_session_window(_pid: u32) -> bool {
    false
}
