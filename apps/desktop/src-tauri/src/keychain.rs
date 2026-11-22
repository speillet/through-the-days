//! Optional storage of the backup passphrase in macOS Keychain (D-006).
//!
//! The passphrase is a generic password item: service [`SERVICE`] (a separate service for
//! development builds, so they never read the release item) and account [`ACCOUNT`]. Other
//! platforms have no store: nothing is remembered and the passphrase lives for the session.

use zeroize::Zeroizing;

/// Keychain service of the backup passphrase item.
#[cfg(not(debug_assertions))]
pub const SERVICE: &str = "com.throughthedays.app.backup";
/// Keychain service of the backup passphrase item in development builds.
#[cfg(debug_assertions)]
pub const SERVICE: &str = "com.throughthedays.app.dev.backup";
/// Keychain account of the backup passphrase item.
pub const ACCOUNT: &str = "backup-passphrase";

/// The secret store could not complete the operation. It never carries the secret or details.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeychainError;

/// Where a remembered backup passphrase is kept between sessions.
pub trait SecretStore: Send {
    /// The remembered passphrase, or `None` when nothing is stored.
    fn read(&self) -> Result<Option<Zeroizing<String>>, KeychainError>;
    /// Stores `passphrase`, replacing any earlier one.
    fn store(&self, passphrase: &str) -> Result<(), KeychainError>;
    /// Removes the remembered passphrase; succeeds when nothing is stored.
    fn delete(&self) -> Result<(), KeychainError>;
}

/// The secret store of this platform: macOS Keychain, or no store elsewhere.
pub fn platform_store() -> Box<dyn SecretStore> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::Keychain)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Box::new(Unavailable)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{ACCOUNT, KeychainError, SERVICE, SecretStore};
    use security_framework::passwords::{
        PasswordOptions, delete_generic_password, generic_password, set_generic_password,
    };
    use zeroize::Zeroizing;

    /// `errSecItemNotFound` from the Security framework.
    const ITEM_NOT_FOUND: i32 = -25300;

    /// The login Keychain of the person's macOS account.
    pub struct Keychain;

    impl SecretStore for Keychain {
        fn read(&self) -> Result<Option<Zeroizing<String>>, KeychainError> {
            match generic_password(PasswordOptions::new_generic_password(SERVICE, ACCOUNT)) {
                Ok(bytes) => {
                    let bytes = Zeroizing::new(bytes);
                    let text = std::str::from_utf8(&bytes).map_err(|_| KeychainError)?;
                    Ok(Some(Zeroizing::new(text.to_owned())))
                }
                Err(error) if error.code() == ITEM_NOT_FOUND => Ok(None),
                Err(_) => Err(KeychainError),
            }
        }

        fn store(&self, passphrase: &str) -> Result<(), KeychainError> {
            set_generic_password(SERVICE, ACCOUNT, passphrase.as_bytes()).map_err(|_| KeychainError)
        }

        fn delete(&self) -> Result<(), KeychainError> {
            match delete_generic_password(SERVICE, ACCOUNT) {
                Ok(()) => Ok(()),
                Err(error) if error.code() == ITEM_NOT_FOUND => Ok(()),
                Err(_) => Err(KeychainError),
            }
        }
    }
}

/// No secret store: a passphrase is never remembered.
#[cfg(not(target_os = "macos"))]
pub struct Unavailable;

#[cfg(not(target_os = "macos"))]
impl SecretStore for Unavailable {
    fn read(&self) -> Result<Option<Zeroizing<String>>, KeychainError> {
        Ok(None)
    }

    fn store(&self, _passphrase: &str) -> Result<(), KeychainError> {
        Err(KeychainError)
    }

    fn delete(&self) -> Result<(), KeychainError> {
        Ok(())
    }
}

/// An in-memory secret store for tests, so they never touch the real Keychain.
#[cfg(test)]
pub mod fake {
    use super::{KeychainError, SecretStore};
    use std::sync::{Arc, Mutex, PoisonError};
    use zeroize::Zeroizing;

    #[derive(Debug, Default)]
    pub struct Contents {
        pub item: Option<String>,
        /// Every operation fails while this is set, like a denied Keychain prompt.
        pub failing: bool,
    }

    /// A shared handle: the test keeps one clone to inspect what the shell stored.
    #[derive(Debug, Clone, Default)]
    pub struct FakeKeychain(pub Arc<Mutex<Contents>>);

    impl FakeKeychain {
        pub fn holding(passphrase: &str) -> Self {
            let keychain = Self::default();
            keychain.contents().item = Some(passphrase.to_owned());
            keychain
        }

        pub fn contents(&self) -> std::sync::MutexGuard<'_, Contents> {
            self.0.lock().unwrap_or_else(PoisonError::into_inner)
        }
    }

    impl SecretStore for FakeKeychain {
        fn read(&self) -> Result<Option<Zeroizing<String>>, KeychainError> {
            let contents = self.contents();
            if contents.failing {
                return Err(KeychainError);
            }
            Ok(contents.item.clone().map(Zeroizing::new))
        }

        fn store(&self, passphrase: &str) -> Result<(), KeychainError> {
            let mut contents = self.contents();
            if contents.failing {
                return Err(KeychainError);
            }
            contents.item = Some(passphrase.to_owned());
            Ok(())
        }

        fn delete(&self) -> Result<(), KeychainError> {
            let mut contents = self.contents();
            if contents.failing {
                return Err(KeychainError);
            }
            contents.item = None;
            Ok(())
        }
    }
}

#[cfg(all(test, debug_assertions))]
mod tests {
    use super::{ACCOUNT, SERVICE};

    #[test]
    fn development_builds_use_their_own_keychain_item() {
        // Tests are debug builds: they must never read or write the release item.
        assert_eq!(SERVICE, "com.throughthedays.app.dev.backup");
        assert_eq!(ACCOUNT, "backup-passphrase");
    }
}
