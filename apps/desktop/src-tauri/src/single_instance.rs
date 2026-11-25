//! One copy of the app at a time.
//!
//! Two copies of the app on one data folder race on the journal, the backup folder and the
//! backup plan: a launch removes temporary and staging files that the other copy may still be
//! writing, a backup removes the other copy's backup in progress, the last copy to store the
//! backup plan wins, and after a restore in one copy the other keeps saving to the journal that
//! was moved aside.
//!
//! Release builds therefore let one copy run. Launching the app again brings the open window
//! forward, and the new process exits while the app is being built: Tauri initialises plugins in
//! `Builder::build`, and the app's `setup`, which resolves the data folder and opens the journal,
//! only runs once the event loop has started. A second copy never gets there.
//!
//! The guard, `tauri-plugin-single-instance`, is keyed to the app identifier, which development
//! builds share with the installed app. Development builds never open the real journal (see
//! [`crate::paths`]), so they are not limited: otherwise `npm run dev` or a native smoke launch
//! would hand over to the installed app and exit, and launching the installed app would bring a
//! development window forward.

use crate::{appearance::MAIN_WINDOW, diagnostics};
use tauri::{AppHandle, Builder, Manager, Runtime};

/// Registers the guard in release builds. Call it before anything else is registered.
pub fn guard<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    if cfg!(debug_assertions) {
        builder
    } else {
        guarded(builder, |app| {
            show_open_window(app);
        })
    }
}

/// Registers the guard; `on_second_launch` runs in the open copy each time a later launch hands
/// over to it.
fn guarded<R: Runtime>(
    builder: Builder<R>,
    on_second_launch: impl Fn(&AppHandle<R>) + Send + Sync + 'static,
) -> Builder<R> {
    builder.plugin(tauri_plugin_single_instance::init(
        move |app, _arguments, _working_folder| on_second_launch(app),
    ))
}

/// Brings the journal window forward, out of the Dock if it was minimised. Returns whether it
/// could.
fn show_open_window<R: Runtime>(app: &AppHandle<R>) -> bool {
    let shown = app.get_webview_window(MAIN_WINDOW).is_some_and(|window| {
        window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus())
            .is_ok()
    });
    if !shown {
        diagnostics::record("show open window", "unknown");
    }
    shown
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::show_open_window;
    use crate::appearance::MAIN_WINDOW;
    use tauri::{WebviewUrl, WebviewWindowBuilder, test::mock_app};

    #[test]
    fn a_second_launch_brings_the_journal_window_forward() {
        let app = mock_app();
        // A copy that is closing its window has nothing to show.
        assert!(!show_open_window(app.handle()));
        WebviewWindowBuilder::new(&app, MAIN_WINDOW, WebviewUrl::default())
            .build()
            .unwrap();
        assert!(show_open_window(app.handle()));
    }
}

/// A second launch while a copy is open, across two processes: the test runs an open copy under
/// Tauri's mock runtime, then launches its own test binary again as the second copy.
#[cfg(all(test, target_os = "macos"))]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "a failed unwrap is a failed test"
)]
mod second_launch {
    use super::guarded;
    use crate::{keychain::fake::FakeKeychain, paths::DataPaths, state::AppState};
    use std::{
        env, fs,
        path::{Path, PathBuf},
        process::{Command, Output},
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };
    use tauri::{
        App, AppHandle,
        test::{MockRuntime, mock_builder, mock_context, noop_assets},
    };

    const TEST: &str = "single_instance::second_launch::a_second_launch_hands_over_to_the_open_copy_before_opening_the_journal";
    /// Set in the second copy: the app identifier of the open copy.
    const IDENTIFIER: &str = "TTD_TEST_SECOND_LAUNCH_IDENTIFIER";
    /// Set in the second copy: the synthetic data folder it would open.
    const DATA: &str = "TTD_TEST_SECOND_LAUNCH_DATA";
    /// Printed by a second copy that the guard let start.
    const STARTED: &str = "TTD_TEST_SECOND_COPY_STARTED";
    /// How long the open copy may take to hear of a second launch, or to start listening.
    const PATIENCE: Duration = Duration::from_secs(10);

    /// desktop-shell — One running copy / Second launch while open.
    #[test]
    fn a_second_launch_hands_over_to_the_open_copy_before_opening_the_journal() {
        if let (Some(identifier), Some(data)) = (env::var_os(IDENTIFIER), env::var_os(DATA)) {
            return second_copy(identifier.to_str().unwrap(), Path::new(&data));
        }
        // Unique to this run, so the test never finds, or is found by, an installed app.
        let identifier = format!(
            "com.throughthedays.test.second-launch.p{}",
            std::process::id()
        );
        let data = tempfile::tempdir().unwrap();
        let folder = data.path();
        // Files of a backup and a restore that the open copy is still writing; a launch removes
        // leftovers with these names.
        let leftovers = [".ttd-incomplete-backup", ".ttd-restore-staging-copy"];
        for name in leftovers {
            fs::write(folder.join(name), "Synthetic file being written.").unwrap();
        }

        let (handed_over, second_launches) = mpsc::channel();
        let open = app(&identifier, move |_| {
            let _ = handed_over.send(());
        });
        wait_until_listening(&identifier);
        let second = launch_second_copy(&identifier, folder);
        assert!(second.status.success(), "{second:?}");
        assert!(!stdout(&second).contains(STARTED), "{second:?}");
        second_launches
            .recv_timeout(PATIENCE)
            .expect("the open copy heard of no second launch");
        // No journal was created and the open copy's files are still there.
        assert_eq!(names_in(folder), leftovers);

        // Once the open copy has quit, a launch starts and opens the journal, cleaning up as it
        // goes: the checks above would have seen a second copy that started.
        open.cleanup_before_exit();
        let next = launch_second_copy(&identifier, folder);
        assert!(next.status.success(), "{next:?}");
        assert!(stdout(&next).contains(STARTED), "{next:?}");
        assert!(folder.join("journal.sqlite").is_file());
        assert!(leftovers.iter().all(|name| !folder.join(name).exists()));
        assert!(second_launches.try_recv().is_err());
    }

    /// The second copy builds the app as `run` does, then launches like `setup`.
    fn second_copy(identifier: &str, data: &Path) {
        // Exits inside `build` when an open copy holds the guard.
        let app = app(identifier, |_| {});
        println!("{STARTED}");
        let state = AppState::new(
            DataPaths::new(data.to_path_buf()),
            Box::new(FakeKeychain::default()),
        );
        state.launch(chrono::Utc::now());
        app.cleanup_before_exit();
    }

    /// A copy of the app with the guard, under `identifier`.
    fn app(
        identifier: &str,
        on_second_launch: impl Fn(&AppHandle<MockRuntime>) + Send + Sync + 'static,
    ) -> App<MockRuntime> {
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = identifier.into();
        guarded(mock_builder(), on_second_launch)
            .build(context)
            .unwrap()
    }

    /// Waits until the open copy listens for later launches. On macOS the plugin listens on a
    /// Unix socket named after the app identifier, bound just after the app is built.
    fn wait_until_listening(identifier: &str) {
        let socket = PathBuf::from(format!(
            "/tmp/{}_si.sock",
            identifier.replace(['.', '-'], "_")
        ));
        let deadline = Instant::now() + PATIENCE;
        while !socket.exists() {
            assert!(
                Instant::now() < deadline,
                "no guard socket at {}: has the plugin moved it?",
                socket.display()
            );
            thread::sleep(Duration::from_millis(10));
        }
    }

    /// Launches this test binary as a second copy that runs only this test.
    fn launch_second_copy(identifier: &str, data: &Path) -> Output {
        Command::new(env::current_exe().unwrap())
            .args(["--exact", TEST, "--nocapture", "--test-threads=1"])
            .env(IDENTIFIER, identifier)
            .env(DATA, data)
            .output()
            .unwrap()
    }

    fn stdout(output: &Output) -> String {
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    /// Names of the entries in `folder`, sorted.
    fn names_in(folder: &Path) -> Vec<String> {
        let mut names: Vec<_> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }
}
