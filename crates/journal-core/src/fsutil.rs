use crate::Error;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::Path,
};

/// Prefix of every temporary file this crate creates next to a file it publishes.
///
/// Backup publication removes leftovers with this prefix from the backup folder, so an
/// interrupted write never accumulates there.
pub(crate) const TEMPORARY_PREFIX: &str = ".ttd-incomplete-";

/// Replaces `path` atomically and durably.
///
/// The bytes are written and flushed to a temporary file in the same directory, renamed over the
/// destination, and the directory entry is flushed. Readers see the previous or the new content,
/// never a partial file. `classify` turns each I/O failure into the caller's error.
pub(crate) fn write_atomically(
    path: &Path,
    bytes: &[u8],
    classify: impl Fn(&io::Error) -> Error,
) -> Result<(), Error> {
    let directory = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    let mut file = tempfile::Builder::new()
        .prefix(TEMPORARY_PREFIX)
        .tempfile_in(directory)
        .map_err(|error| classify(&error))?;
    file.write_all(bytes).map_err(|error| classify(&error))?;
    file.as_file()
        .sync_all()
        .map_err(|error| classify(&error))?;
    file.persist(path)
        .map_err(|failure| classify(&failure.error))?;
    sync_directory(directory).map_err(|error| classify(&error))
}

/// Opens a file of the backup folder for reading when it is a regular file, or returns `None`
/// when something else is in its place.
///
/// Anyone else who can write to the backup folder, such as another account, another computer
/// sharing the drive or a sync client, can replace a file there. A symbolic link is never
/// followed (`O_NOFOLLOW`), and opening a named pipe never waits for a writer (`O_NONBLOCK`,
/// which does not change how a regular file reads). A link, a pipe, a device, a socket or a
/// folder is then `None`, so reading the file can neither block nor go on without end. A
/// missing file and every other failure are the open's error.
pub(crate) fn open_regular_file(path: &Path) -> io::Result<Option<File>> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::custom_flags(
        &mut options,
        libc::O_NOFOLLOW | libc::O_NONBLOCK,
    );
    match options.open(path) {
        Ok(file) => Ok(file.metadata()?.is_file().then_some(file)),
        // A link, and a socket, cannot be opened at all: tell them from other failures.
        Err(error) => match fs::symlink_metadata(path) {
            Ok(metadata) if !metadata.is_file() => Ok(None),
            _ => Err(error),
        },
    }
}

/// Flushes a directory so a rename into it survives power loss.
pub(crate) fn sync_directory(directory: &Path) -> io::Result<()> {
    File::open(directory)?.sync_all()
}

/// Classifies a failed file operation in a backup folder.
///
/// A folder that is missing, is not a folder, refuses writing or lacks a file-system operation
/// the backup needs is [`Error::BackupFolder`]: the person can reconnect the drive or choose
/// another folder. Anything else, such as a full disk, is [`Error::Backup`].
pub(crate) fn backup_folder_error(error: &io::Error) -> Error {
    match error.kind() {
        io::ErrorKind::NotFound
        | io::ErrorKind::NotADirectory
        | io::ErrorKind::PermissionDenied
        | io::ErrorKind::ReadOnlyFilesystem
        | io::ErrorKind::Unsupported => Error::BackupFolder,
        _ => Error::Backup,
    }
}

/// Parses a stored JSON object, reporting anything else as `error`.
///
/// Derived deserialisers also accept a JSON array as a struct; a file holding `[]` must not load
/// as a default value.
pub(crate) fn parse_json_object<T: DeserializeOwned>(
    bytes: &[u8],
    error: Error,
) -> Result<T, Error> {
    match serde_json::from_slice(bytes) {
        Ok(value @ Value::Object(_)) => serde_json::from_value(value).map_err(|_| error),
        _ => Err(error),
    }
}
