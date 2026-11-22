#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use common::{NOW, document};
use journal_core::{Entry, Error, Journal, Slot};
use std::collections::HashSet;

const ALL: [Error; 16] = [
    Error::Storage,
    Error::Conflict,
    Error::Occupied,
    Error::NotFound,
    Error::Date,
    Error::Document,
    Error::MigrationRequired,
    Error::Unsupported,
    Error::Score,
    Error::Completion,
    Error::Reflection,
    Error::Emotion,
    Error::Backup,
    Error::BackupValidation,
    Error::Restore,
    Error::Passphrase,
];

/// The documented code of each variant; the exhaustive match fails to compile when a variant is
/// added without deciding its code.
fn documented_code(error: Error) -> &'static str {
    match error {
        Error::Storage => "storage",
        Error::Conflict => "conflict",
        Error::Occupied => "occupied",
        Error::NotFound => "notFound",
        Error::Date => "date",
        Error::Document => "document",
        Error::MigrationRequired => "migrationRequired",
        Error::Unsupported => "unsupported",
        Error::Score => "score",
        Error::Completion => "completion",
        Error::Reflection => "reflection",
        Error::Emotion => "emotion",
        Error::Backup => "backup",
        Error::BackupValidation => "backupValidation",
        Error::Restore => "restore",
        Error::Passphrase => "passphrase",
    }
}

/// Codes are stable and every one is part of the desktop interface's `ErrorCode` union.
#[test]
fn error_codes_are_stable_and_match_the_desktop_contract() {
    let types = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../apps/desktop/src/api/types.ts"
    ))
    .unwrap();
    let union = types
        .split("export type ErrorCode =")
        .nth(1)
        .unwrap()
        .split(';')
        .next()
        .unwrap();
    let desktop_codes: HashSet<_> = union
        .split('|')
        .map(|code| code.trim().trim_matches('\''))
        .filter(|code| !code.is_empty())
        .collect();
    let mut codes = HashSet::new();
    for error in ALL {
        assert_eq!(error.code(), documented_code(error));
        assert!(
            desktop_codes.contains(error.code()),
            "{} is missing from ErrorCode",
            error.code()
        );
        assert!(codes.insert(error.code()), "{} is not unique", error.code());
    }
    assert_eq!(
        Error::Emotion.to_string(),
        "Choose an emotion from the list or describe it in your own words."
    );
    assert_eq!(
        Error::Unsupported.to_string(),
        "This journal was created by a newer version of Through the Days or is not a journal database. It has not been changed."
    );
}

/// local-data-protection — Protected secrets and logs / Failure logging; product-guardrails —
/// English first-party content.
#[test]
fn error_messages_are_fixed_english_sentences_without_journal_text() {
    for error in ALL {
        let message = error.to_string();
        assert!(message.is_ascii() && message.ends_with('.'), "{message}");
        assert!(
            message.chars().next().is_some_and(char::is_uppercase),
            "{message}"
        );
        assert!(
            !format!("{error:?}").contains(' '),
            "Debug output names the variant only"
        );
    }

    let marker = "Synthetic private marker 93be";
    let directory = tempfile::tempdir().unwrap();
    let mut journal = Journal::open(&directory.path().join("journal.sqlite")).unwrap();
    let mut entry = Entry::draft("2026-11-22", Slot::Evening);
    entry.document = document(marker);
    entry.reflection.difficulty = marker.into();
    let mut invalid_score = entry.clone();
    invalid_score.mood = Some(11);
    let mut invalid_emotion = entry.clone();
    invalid_emotion.emotion = marker.into();
    let not_a_backup = directory.path().join("notes.age");
    std::fs::write(&not_a_backup, marker).unwrap();
    let not_a_journal = directory.path().join("notes.sqlite");
    std::fs::write(&not_a_journal, marker).unwrap();
    let failures = [
        journal.save(invalid_score).unwrap_err(),
        journal.save(invalid_emotion).unwrap_err(),
        journal.restore_from(&not_a_backup, marker).unwrap_err(),
        journal
            .backup_to(directory.path(), "short 93be", NOW)
            .unwrap_err(),
        Journal::open(&not_a_journal).err().unwrap(),
    ];
    assert_eq!(
        failures,
        [
            Error::Score,
            Error::Emotion,
            Error::Restore,
            Error::Passphrase,
            Error::Unsupported
        ]
    );
    for failure in failures {
        let rendered = format!("{failure} {failure:?} {}", failure.code());
        assert!(!rendered.contains("93be"), "{rendered}");
    }
}
