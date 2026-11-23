#![allow(clippy::unwrap_used, clippy::expect_used)]

use journal_core::emotion_vocabulary;
use std::collections::HashSet;

/// daily-check-in — Nuanced emotion labels: an original, versioned English vocabulary with
/// descriptions whose identifiers stay stable.
#[test]
fn bundled_vocabulary_is_versioned_with_stable_unique_identifiers() {
    let vocabulary = emotion_vocabulary();
    assert!(
        std::ptr::eq(vocabulary, emotion_vocabulary()),
        "parsed once"
    );
    assert_eq!(vocabulary.version, 1);
    let families: Vec<_> = vocabulary
        .families
        .iter()
        .map(|family| family.id.as_str())
        .collect();
    assert_eq!(
        families,
        [
            "unpleasant-high",
            "pleasant-high",
            "unpleasant-low",
            "pleasant-low"
        ]
    );
    assert_eq!(vocabulary.emotions.len(), 36);

    let mut ids = HashSet::new();
    for emotion in &vocabulary.emotions {
        assert!(
            ids.insert(emotion.id.as_str()),
            "{} is duplicated",
            emotion.id
        );
        assert!(
            emotion
                .id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-'),
            "{} is a lowercase identifier",
            emotion.id
        );
        assert!(
            families.contains(&emotion.family.as_str()),
            "{} has a known family",
            emotion.id
        );
        assert!(
            !emotion.label.is_empty() && emotion.description.ends_with('.'),
            "{}",
            emotion.id
        );
        assert!(
            emotion.label.is_ascii() && emotion.description.is_ascii(),
            "{} is English copy",
            emotion.id
        );
    }
    for family in &families {
        let members = vocabulary
            .emotions
            .iter()
            .filter(|emotion| emotion.family == *family)
            .count();
        assert_eq!(members, 9, "{family}");
    }

    let anxious = vocabulary.emotion("anxious").unwrap();
    assert_eq!(
        (anxious.label.as_str(), anxious.family.as_str()),
        ("Anxious", "unpleasant-high")
    );
    assert_eq!(vocabulary.emotion("at-ease").unwrap().label, "At Ease");
    assert!(vocabulary.emotion("Anxious").is_none());
    assert!(vocabulary.emotion("").is_none());
}
