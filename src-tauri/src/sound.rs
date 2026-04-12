// FunnyToastAlarm - Notification sound playback (Step 4-6)
//
// Custom paths: played via rodio (supports MP3, WAV, OGG, FLAC).
// No path: Windows default notification sound via MessageBeep.

/// Play a notification sound.
///
/// * `sound_path` — Optional path to an audio file (MP3/WAV/OGG/FLAC).
///   `None` plays the OS default notification sound.
pub fn play_notification_sound(sound_path: Option<&str>) {
    if let Some(path) = sound_path {
        use rodio::{Decoder, OutputStream, Sink};
        use std::fs::File;
        use std::io::BufReader;

        let file = match File::open(path) {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[sound] Cannot open '{path}': {e}");
                play_default_sound();
                return;
            }
        };

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

        match Decoder::new(BufReader::new(file)) {
            Ok(source) => {
                sink.append(source);
                sink.sleep_until_end(); // blocks until playback completes (OK in spawn_blocking)
            }
            Err(e) => {
                eprintln!("[sound] Cannot decode '{path}': {e} — falling back to default");
                play_default_sound();
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
