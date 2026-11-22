//! Quitting without losing pending input.
//!
//! When the person asks the app to quit while a window is open, the renderer receives
//! [`FLUSH_REQUEST_EVENT`], flushes its pending saves and calls the `confirm_exit` command.
//! If it does not answer within [`FLUSH_TIMEOUT`], the app quits anyway: acknowledged revisions
//! are already durable, so only unacknowledged input could be lost. Closing the window is
//! handled by the renderer itself before it destroys the window.

use std::{
    sync::atomic::{AtomicBool, Ordering},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime};

/// Event asking the renderer to flush pending saves before the app quits.
pub const FLUSH_REQUEST_EVENT: &str = "app://flush-request";
/// How long a quit waits for the renderer before it proceeds without confirmation.
pub const FLUSH_TIMEOUT: Duration = Duration::from_secs(10);

/// What to do with a request to quit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitDecision {
    /// Let the app quit now.
    Proceed,
    /// Keep running, ask the renderer to flush and start the fallback timer.
    FlushFirst,
    /// Keep running: a flush request is already waiting for confirmation.
    AwaitFlush,
}

/// Whether a quit was confirmed and whether a flush request is outstanding.
#[derive(Debug, Default)]
pub struct ExitGate {
    confirmed: AtomicBool,
    flush_requested: AtomicBool,
}

impl ExitGate {
    /// Decides how to answer a quit request. `explicit` is a programmatic exit with a code,
    /// including the one made after confirmation, which always proceeds.
    pub fn on_quit_requested(&self, explicit: bool, open_windows: usize) -> ExitDecision {
        if explicit || open_windows == 0 || self.confirmed.load(Ordering::SeqCst) {
            return ExitDecision::Proceed;
        }
        if self.flush_requested.swap(true, Ordering::SeqCst) {
            ExitDecision::AwaitFlush
        } else {
            ExitDecision::FlushFirst
        }
    }

    /// Records the confirmation; `true` only for the first one.
    pub fn confirm(&self) -> bool {
        !self.confirmed.swap(true, Ordering::SeqCst)
    }
}

/// Answers [`RunEvent::ExitRequested`] for quits that come from the system or the runtime.
fn on_exit_requested<R: Runtime>(
    app: &AppHandle<R>,
    code: Option<i32>,
    prevent_exit: impl FnOnce(),
) {
    let decision = app
        .state::<ExitGate>()
        .on_quit_requested(code.is_some(), app.webview_windows().len());
    match decision {
        ExitDecision::Proceed => {}
        ExitDecision::FlushFirst => {
            prevent_exit();
            request_flush(app);
        }
        ExitDecision::AwaitFlush => prevent_exit(),
    }
}

/// Starts a quit from the application menu.
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let gate = app.state::<ExitGate>();
    match gate.on_quit_requested(false, app.webview_windows().len()) {
        ExitDecision::Proceed => {
            gate.confirm();
            app.exit(0);
        }
        ExitDecision::FlushFirst => request_flush(app),
        ExitDecision::AwaitFlush => {}
    }
}

/// Quits after the renderer flushed, or after the fallback timeout. Only the first call exits.
pub fn confirm_and_exit<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<ExitGate>().confirm() {
        app.exit(0);
    }
}

/// Handles the application's run events: a quit request waits for pending saves while a window
/// is open, and the journal connection is closed at exit unless an operation still holds it.
pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: RunEvent) {
    match event {
        RunEvent::ExitRequested { code, api, .. } => {
            on_exit_requested(app, code, || api.prevent_exit());
        }
        RunEvent::Exit => {
            if let Some(state) = app.try_state::<crate::state::AppState>() {
                state.close_if_idle();
            }
        }
        _ => {}
    }
}

fn request_flush<R: Runtime>(app: &AppHandle<R>) {
    if app.emit(FLUSH_REQUEST_EVENT, ()).is_err() {
        confirm_and_exit(app);
        return;
    }
    let handle = app.clone();
    let fallback = thread::Builder::new()
        .name("exit-fallback".into())
        .spawn(move || {
            thread::sleep(FLUSH_TIMEOUT);
            confirm_and_exit(&handle);
        });
    if fallback.is_err() {
        // Never leave a quit waiting on a renderer that may not answer.
        confirm_and_exit(app);
    }
}

#[cfg(test)]
mod tests {
    use super::{ExitDecision, ExitGate};

    #[test]
    fn a_quit_with_an_open_window_waits_for_one_flush() {
        let gate = ExitGate::default();
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::FlushFirst);
        // Asking again while the renderer flushes does not send a second request.
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::AwaitFlush);
        assert!(gate.confirm());
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::Proceed);
    }

    #[test]
    fn explicit_exits_and_windowless_quits_proceed() {
        let gate = ExitGate::default();
        assert_eq!(gate.on_quit_requested(true, 1), ExitDecision::Proceed);
        assert_eq!(gate.on_quit_requested(false, 0), ExitDecision::Proceed);
        // Neither of them started a flush request.
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::FlushFirst);
    }

    #[test]
    fn only_the_first_confirmation_exits() {
        let gate = ExitGate::default();
        assert!(gate.confirm());
        assert!(!gate.confirm());
    }
}
