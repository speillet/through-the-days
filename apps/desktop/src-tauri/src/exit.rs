//! Quitting without losing pending input.
//!
//! When the person quits with the app's Quit menu item or its ⌘Q shortcut while a window is
//! open, the renderer receives [`FLUSH_REQUEST_EVENT`] and flushes its pending saves. It then
//! calls `confirm_exit`, or `cancel_exit` when a save still fails: the app stays open with the
//! unsaved writing on screen, and a later quit asks again. If the renderer answers neither
//! within [`FLUSH_TIMEOUT`], the app stays open and a later quit can retry. A timeout or
//! unavailable renderer never substitutes for a successful save acknowledgment. Closing
//! the window is handled by the renderer itself before it destroys the window.
//!
//! Known limit: a quit that macOS starts itself skips this gate. Quit from the Dock or from the
//! app switcher, logging out, restarting or shutting down, and an AppleScript `quit` send
//! `terminate:`. The windowing library (tao) implements `applicationWillTerminate:` but not
//! `applicationShouldTerminate:`, so the process exits at once: no [`RunEvent::ExitRequested`]
//! is emitted and the renderer is never asked to flush. Input still waiting for its autosave
//! can then be lost. The renderer narrows that window by saving pending input as soon as the
//! window loses focus or the page is hidden. Answering `applicationShouldTerminate:` natively
//! is deferred.

use std::{
    sync::{Mutex, MutexGuard, PoisonError},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime};

/// Event asking the renderer to flush pending saves before the app quits.
pub const FLUSH_REQUEST_EVENT: &str = "app://flush-request";
/// How long a quit waits before allowing another attempt without approving exit.
pub const FLUSH_TIMEOUT: Duration = Duration::from_secs(10);

/// What to do with a request to quit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExitDecision {
    /// Let the app quit now.
    Proceed,
    /// Keep running, ask the renderer to flush and start the retry timer of this request.
    FlushFirst(u64),
    /// Keep running: a flush request is already waiting for an answer.
    AwaitFlush,
}

/// Whether a quit was confirmed and which flush request, if any, waits for an answer.
#[derive(Debug, Default)]
pub struct ExitGate {
    state: Mutex<GateState>,
}

#[derive(Debug, Default)]
struct GateState {
    confirmed: bool,
    /// The flush request waiting for the renderer's answer.
    outstanding: Option<u64>,
    /// Flush requests sent so far; each one is identified by its number.
    requests: u64,
}

impl ExitGate {
    fn state(&self) -> MutexGuard<'_, GateState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Decides how to answer a quit request. `explicit` is a programmatic exit with a code,
    /// including the one made after confirmation, which always proceeds.
    pub fn on_quit_requested(&self, explicit: bool, open_windows: usize) -> ExitDecision {
        let mut state = self.state();
        if explicit || open_windows == 0 || state.confirmed {
            return ExitDecision::Proceed;
        }
        if state.outstanding.is_some() {
            return ExitDecision::AwaitFlush;
        }
        state.requests += 1;
        state.outstanding = Some(state.requests);
        ExitDecision::FlushFirst(state.requests)
    }

    /// Records the confirmation; `true` only for the first one.
    pub fn confirm(&self) -> bool {
        !std::mem::replace(&mut self.state().confirmed, true)
    }

    /// The renderer could not flush: the app keeps running, and the next quit asks again.
    pub fn cancel(&self) {
        self.state().outstanding = None;
    }

    /// Keeps the app open when `request` never received an answer, allowing a later retry.
    /// A stale timeout cannot cancel a newer request or replace a confirmation.
    pub fn cancel_unanswered(&self, request: u64) -> bool {
        let mut state = self.state();
        if state.confirmed || state.outstanding != Some(request) {
            return false;
        }
        state.outstanding = None;
        true
    }
}

/// Answers [`RunEvent::ExitRequested`] for quits that come from the runtime, such as an exit
/// requested in code.
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
        ExitDecision::FlushFirst(request) => {
            prevent_exit();
            request_flush(app, request);
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
        ExitDecision::FlushFirst(request) => request_flush(app, request),
        ExitDecision::AwaitFlush => {}
    }
}

/// Quits after the renderer flushed. Only the first call exits.
pub fn confirm_and_exit<R: Runtime>(app: &AppHandle<R>) {
    if app.state::<ExitGate>().confirm() {
        app.exit(0);
    }
}

/// Keeps the app open after the renderer could not flush its pending saves.
pub fn cancel<R: Runtime>(app: &AppHandle<R>) {
    app.state::<ExitGate>().cancel();
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

fn request_flush<R: Runtime>(app: &AppHandle<R>, request: u64) {
    if app.emit(FLUSH_REQUEST_EVENT, ()).is_err() {
        app.state::<ExitGate>().cancel_unanswered(request);
        crate::diagnostics::record("request exit flush", "exitFlush");
        return;
    }
    let handle = app.clone();
    let retry_timer = thread::Builder::new()
        .name("exit-flush-timeout".into())
        .spawn(move || {
            thread::sleep(FLUSH_TIMEOUT);
            if handle.state::<ExitGate>().cancel_unanswered(request) {
                crate::diagnostics::record("wait for exit flush", "exitFlushTimeout");
            }
        });
    if retry_timer.is_err() {
        // A failed timer must never approve quitting without the renderer's acknowledgment.
        app.state::<ExitGate>().cancel_unanswered(request);
        crate::diagnostics::record("schedule exit retry", "exitFlush");
    }
}

#[cfg(test)]
mod tests {
    use super::{ExitDecision, ExitGate};

    #[test]
    fn a_quit_with_an_open_window_waits_for_one_flush() {
        let gate = ExitGate::default();
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(1)
        );
        // Asking again while the renderer flushes does not send a second request.
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::AwaitFlush);
        assert!(gate.confirm());
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::Proceed);
        // The timeout of an answered request does nothing.
        assert!(!gate.cancel_unanswered(1));
    }

    #[test]
    fn explicit_exits_and_windowless_quits_proceed() {
        let gate = ExitGate::default();
        assert_eq!(gate.on_quit_requested(true, 1), ExitDecision::Proceed);
        assert_eq!(gate.on_quit_requested(false, 0), ExitDecision::Proceed);
        // Neither of them started a flush request.
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(1)
        );
    }

    #[test]
    fn only_the_first_confirmation_exits() {
        let gate = ExitGate::default();
        assert!(gate.confirm());
        assert!(!gate.confirm());
    }

    #[test]
    fn an_unanswered_flush_keeps_the_app_open_and_allows_retry() {
        let gate = ExitGate::default();
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(1)
        );
        // A slow save or unresponsive renderer has not acknowledged the writing.
        gate.cancel_unanswered(1);
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(2)
        );
    }

    #[test]
    fn a_failed_flush_keeps_the_app_open_until_a_later_quit_succeeds() {
        let gate = ExitGate::default();
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(1)
        );
        gate.cancel();
        // The timeout of the cancelled request cannot change a later quit.
        assert!(!gate.cancel_unanswered(1));
        // The next quit asks the renderer again, with its own timeout.
        assert_eq!(
            gate.on_quit_requested(false, 1),
            ExitDecision::FlushFirst(2)
        );
        assert!(!gate.cancel_unanswered(1));
        assert!(gate.confirm());
        assert!(!gate.cancel_unanswered(2));
        assert_eq!(gate.on_quit_requested(false, 1), ExitDecision::Proceed);
    }
}
