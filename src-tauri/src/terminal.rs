//! Terminal sessions for the Terminal view: one shell (`cmd.exe` on Windows)
//! per session on a pseudo-terminal (ConPTY via `portable-pty`). Output
//! streams to the webview as `term-data` events; `term-exit` fires when the
//! shell ends. The frontend (xterm.js) owns everything you see.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

#[allow(unused_imports)]
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Terminals {
    next: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

#[derive(Serialize, Clone)]
struct DataEvent {
    id: u32,
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    id: u32,
    code: Option<u32>,
}

#[derive(Serialize)]
pub struct Spawned {
    pub id: u32,
    /// Folder the shell started in.
    pub cwd: String,
    pub shell: String,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(2),
        cols: cols.max(10),
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// How many leading bytes of `buf` are complete UTF-8. A multi-byte character
/// split across two reads waits for the next one; truly invalid bytes are
/// passed through (lossily) so they can't stall the stream.
fn utf8_ready(buf: &[u8]) -> usize {
    match std::str::from_utf8(buf) {
        Ok(_) => buf.len(),
        Err(e) if e.error_len().is_some() => buf.len(),
        Err(e) => e.valid_up_to(),
    }
}

/// Loaded by bash instead of ~/.bashrc (which it sources first). Each prompt
/// reports the folder (OSC 7) and marks where the prompt ends (OSC 133;B), so
/// the frontend can show folder + status without reading the prompt text.
/// On Windows the frontend reads cmd's `C:\path>` prompt instead.
#[cfg(target_os = "linux")]
const BASH_INIT: &str = r#"[ -f ~/.bashrc ] && . ~/.bashrc
__dotmd_prompt() {
  printf '\e]7;file://%s%s\a' "${HOSTNAME:-}" "$PWD"
  case "$PS1" in *'133;B'*) ;; *) PS1="$PS1"'\[\e]133;B\a\]' ;; esac
}
PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND
}__dotmd_prompt"
"#;

#[cfg(target_os = "linux")]
fn unix_shell_setup(app: &AppHandle, shell: &str, cmd: &mut CommandBuilder) {
    // Apps launched from a desktop menu often have no TERM, so shells and
    // tools would fall back to no colour.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let is_bash = std::path::Path::new(shell).file_name().is_some_and(|n| n == "bash");
    if !is_bash {
        return;
    }
    let Ok(dir) = app.path().app_cache_dir() else { return };
    let rc = dir.join("bash-init.sh");
    if std::fs::create_dir_all(&dir).is_ok() && std::fs::write(&rc, BASH_INIT).is_ok() {
        cmd.arg("--rcfile");
        cmd.arg(rc);
    }
}

/// Start a shell. `cwd` falls back to the home folder.
#[tauri::command]
pub fn term_spawn(
    app: AppHandle,
    state: State<'_, Terminals>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<Spawned, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    let shell = if cfg!(windows) {
        "cmd.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
    };
    let dir = cwd
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| app.path().home_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&dir);
    #[cfg(target_os = "linux")]
    unix_shell_setup(&app, &shell, &mut cmd);

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let killer = child.clone_killer();

    let id = state.next.fetch_add(1, Ordering::SeqCst) + 1;
    state.sessions.lock().map_err(|e| e.to_string())?.insert(
        id,
        Session {
            master: pair.master,
            writer,
            killer,
        },
    );

    // Output → webview.
    let out = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let ready = utf8_ready(&pending);
                    if ready > 0 {
                        let chunk: Vec<u8> = pending.drain(..ready).collect();
                        let data = String::from_utf8_lossy(&chunk).into_owned();
                        let _ = out.emit("term-data", DataEvent { id, data });
                    }
                }
            }
        }
    });

    // Wait for the shell to end, then close the PTY. With ConPTY the output
    // pipe only ends once the pseudo-console is closed, so dropping the
    // session here is what lets the reader thread above finish.
    let done = app.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code());
        let _ = done.emit("term-exit", ExitEvent { id, code });
        if let Ok(mut map) = done.state::<Terminals>().sessions.lock() {
            map.remove(&id);
        }
    });

    Ok(Spawned {
        id,
        cwd: dir.display().to_string(),
        shell,
    })
}

/// Keystrokes / pasted text → the shell.
#[tauri::command]
pub fn term_write(
    state: State<'_, Terminals>,
    id: u32,
    data: String,
    binary: Option<bool>,
) -> Result<(), String> {
    let mut map = state.sessions.lock().map_err(|e| e.to_string())?;
    let s = map.get_mut(&id).ok_or("Terminal has exited")?;
    // xterm's onBinary (X10-style mouse reports) gives one char per raw byte;
    // sending those as UTF-8 would turn bytes >= 0x80 into two bytes.
    let bytes: Vec<u8> = if binary.unwrap_or(false) {
        data.chars().map(|c| c as u32 as u8).collect()
    } else {
        data.into_bytes()
    };
    s.writer.write_all(&bytes).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_resize(state: State<'_, Terminals>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.sessions.lock().map_err(|e| e.to_string())?;
    match map.get(&id) {
        Some(s) => s.master.resize(size(cols, rows)).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// End a shell (closing its tab or restarting). Already gone is fine.
#[tauri::command]
pub fn term_kill(state: State<'_, Terminals>, id: u32) -> Result<(), String> {
    let session = state.sessions.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(mut s) = session {
        let _ = s.killer.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::utf8_ready;

    #[test]
    fn waits_for_split_characters() {
        let e = "é".as_bytes(); // 2 bytes
        assert_eq!(utf8_ready(b"abc"), 3);
        assert_eq!(utf8_ready(&[b'a', e[0]]), 1);
        assert_eq!(utf8_ready(&[b'a', e[0], e[1]]), 3);
        assert_eq!(utf8_ready(&[b'a', 0xff, b'b']), 3);
    }
}
