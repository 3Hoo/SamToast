// SamToast - Notification sound playback (Step 4-6)
//
// Custom paths: played via rodio (supports MP3, WAV, OGG, FLAC).
// No path: Windows default notification sound via MessageBeep.
//
// sound_loop=true  → repeats until the CancellationToken is cancelled
//                    (token is shared with the notification timeout so sound
//                     stops automatically when the notification hides or a
//                     new event arrives for the same session).
// sound_loop=false → plays once; still stops early if token is cancelled
//                    (e.g. user clicks the notification mid-playback).

use tokio_util::sync::CancellationToken;

/// Play a notification sound, blocking the calling thread until done or cancelled.
///
/// Designed to be called inside `tokio::task::spawn_blocking`.
pub fn play_notification_sound(
    sound_path: Option<&str>,
    sound_loop: bool,
    cancel: &CancellationToken,
) {
    if let Some(path) = sound_path {
        use rodio::{Decoder, OutputStream, Sink};
        use std::fs::File;
        use std::io::BufReader;
        use std::time::Duration;

        let (_stream, handle) = match OutputStream::try_default() {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("[sound] No audio output device: {e}");
                return;
            }
        };

        let sink = match Sink::try_new(&handle) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[sound] Cannot create audio sink: {e}");
                return;
            }
        };

        let open_file = || File::open(path).map(BufReader::new);

        if sound_loop {
            // repeat_infinite reuses the same decoder; we need to re-open per
            // iteration because rodio's repeat_infinite doesn't rewind on every
            // cycle when the source is a file decoder on all backends.
            // Simpler: loop manually, re-appending a fresh decoder each round.
            loop {
                if cancel.is_cancelled() {
                    sink.stop();
                    return;
                }
                let file = match open_file() {
                    Ok(f) => f,
                    Err(e) => { eprintln!("[sound] Cannot open '{path}': {e}"); return; }
                };
                let source = match Decoder::new(file) {
                    Ok(s) => s,
                    Err(e) => { eprintln!("[sound] Cannot decode '{path}': {e}"); return; }
                };
                sink.append(source);
                // Wait for this iteration to finish (or cancel)
                while !sink.empty() {
                    if cancel.is_cancelled() {
                        sink.stop();
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        } else {
            let file = match open_file() {
                Ok(f) => f,
                Err(e) => {
                    eprintln!("[sound] Cannot open '{path}': {e}");
                    play_default_sound();
                    return;
                }
            };
            match Decoder::new(file) {
                Ok(source) => {
                    sink.append(source);
                    // Poll so we can bail out early if the notification is dismissed
                    while !sink.empty() {
                        if cancel.is_cancelled() {
                            sink.stop();
                            return;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
                Err(e) => {
                    eprintln!("[sound] Cannot decode '{path}': {e} — falling back to default");
                    play_default_sound();
                }
            }
        }
    } else {
        play_default_sound();
    }
}

fn play_default_sound() {
    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::System::Diagnostics::Debug::MessageBeep;
        use windows::Win32::UI::WindowsAndMessaging::MB_ICONASTERISK;
        MessageBeep(MB_ICONASTERISK).ok();
    }
}
