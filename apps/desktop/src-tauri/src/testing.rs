//! Helpers shared by the shell's unit tests.

#![allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]

use std::{fs, path::Path};

/// Names of every entry in `folder`, sorted.
pub fn names_in(folder: &Path) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}
