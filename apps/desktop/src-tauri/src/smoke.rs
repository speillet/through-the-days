//! Debug-only native smoke harness.
//!
//! Browser tests exercise the interface in WebKit, but only the real application window proves
//! that the bundled interface, the native commands and the SQLite journal work together on
//! macOS. When a debug build is launched with `TTD_SMOKE_SCRIPT=<file>` (and normally
//! `TTD_DATA_DIR=<scratch folder>`), the script is evaluated in the main window once its page
//! has loaded. The harness then polls `window.__ttdSmoke` until the script reports
//! `{ "done": true, "ok": <bool>, ... }`, prints that report on stdout as one
//! `TTD_SMOKE_REPORT <json>` line and quits (exit code 0 when `ok`, 2 otherwise, 3 on timeout).
//!
//! Release builds do not contain this module. Scripts must use synthetic content only.

use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Manager, Runtime, Webview,
    webview::{PageLoadEvent, PageLoadPayload},
};

/// Environment variable naming the script to evaluate in the main window.
const SCRIPT_ENV: &str = "TTD_SMOKE_SCRIPT";
/// How long a script may take before the harness gives up.
const TIMEOUT: Duration = Duration::from_secs(90);
/// How often the harness reads the script's report.
const POLL_INTERVAL: Duration = Duration::from_millis(250);

static STARTED: AtomicBool = AtomicBool::new(false);

/// Evaluates the smoke script after the main window's first page load and starts polling.
pub fn on_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Finished || STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(path) = std::env::var_os(SCRIPT_ENV) else {
        return;
    };
    let app = webview.app_handle().clone();
    let Ok(script) = std::fs::read_to_string(&path) else {
        finish(
            &app,
            r#"{"done":true,"ok":false,"error":"The smoke script could not be read."}"#,
        );
        return;
    };
    if webview.eval(script).is_err() {
        finish(
            &app,
            r#"{"done":true,"ok":false,"error":"The smoke script could not be evaluated."}"#,
        );
        return;
    }
    let label = webview.label().to_owned();
    let _ = thread::Builder::new()
        .name("smoke-harness".into())
        .spawn(move || poll(app, label));
}

fn poll<R: Runtime>(app: AppHandle<R>, label: String) {
    let deadline = Instant::now() + TIMEOUT;
    let finished = Arc::new(AtomicBool::new(false));
    while Instant::now() < deadline {
        thread::sleep(POLL_INTERVAL);
        if finished.load(Ordering::SeqCst) {
            return;
        }
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        let reporter = app.clone();
        let reported = Arc::clone(&finished);
        let _ =
            window.eval_with_callback("JSON.stringify(window.__ttdSmoke ?? null)", move |raw| {
                let Some(report) = decode(&raw) else {
                    return;
                };
                let done = report.get("done").and_then(serde_json::Value::as_bool) == Some(true);
                if done && !reported.swap(true, Ordering::SeqCst) {
                    finish(&reporter, &report.to_string());
                }
            });
    }
    if !finished.swap(true, Ordering::SeqCst) {
        println!(r#"TTD_SMOKE_REPORT {{"done":true,"ok":false,"error":"timeout"}}"#);
        app.exit(3);
    }
}

/// Prints the report and quits with a code reflecting its `ok` field.
fn finish<R: Runtime>(app: &AppHandle<R>, report: &str) {
    println!("TTD_SMOKE_REPORT {report}");
    let ok = decode(report)
        .and_then(|value| value.get("ok").and_then(serde_json::Value::as_bool))
        .unwrap_or(false);
    app.exit(if ok { 0 } else { 2 });
}

/// Reads the value returned by `eval_with_callback`: a JSON-encoded result, which for
/// `JSON.stringify(...)` is itself a JSON string containing the report.
fn decode(raw: &str) -> Option<serde_json::Value> {
    match serde_json::from_str::<serde_json::Value>(raw).ok()? {
        serde_json::Value::String(inner) => match serde_json::from_str(&inner).ok()? {
            serde_json::Value::Null => None,
            value => Some(value),
        },
        serde_json::Value::Null => None,
        value => Some(value),
    }
}

#[cfg(test)]
mod tests {
    use super::decode;

    #[test]
    fn decodes_a_stringified_report_and_ignores_an_absent_one() {
        let report = decode(r#""{\"done\":true,\"ok\":true}""#);
        assert_eq!(
            report.and_then(|value| value.get("ok").and_then(serde_json::Value::as_bool)),
            Some(true)
        );
        assert!(decode(r#""null""#).is_none());
        assert!(decode("null").is_none());
        assert!(decode("not json").is_none());
    }
}
