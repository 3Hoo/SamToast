// FunnyToastAlarm - Notification sound playback (Step 4-6)

/// Play a notification sound.
///
/// * `sound_path` — Optional path to a WAV file. `None` plays the OS default.
pub fn play_notification_sound(sound_path: Option<&str>) {
    #[cfg(target_os = "windows")]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_NODEFAULT};
        use windows::Win32::System::Diagnostics::Debug::MessageBeep;
        use windows::Win32::UI::WindowsAndMessaging::MB_ICONASTERISK;

        if let Some(path) = sound_path {
            // Encode path as wide string (null-terminated)
            let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
            let flags = SND_FILENAME | SND_ASYNC | SND_NODEFAULT;
            let played = unsafe { PlaySoundW(PCWSTR(wide.as_ptr()), None, flags).as_bool() };
            if !played {
                // Fall back to default beep if the file can't be played
                eprintln!("[sound] PlaySoundW failed for '{path}', falling back to default beep");
                unsafe { MessageBeep(MB_ICONASTERISK).ok() };
            }
        } else {
            // Windows default notification sound (MB_ICONASTERISK = "Windows Asterisk")
            unsafe { MessageBeep(MB_ICONASTERISK).ok() };
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // No-op on non-Windows platforms for now
        let _ = sound_path;
    }
}
