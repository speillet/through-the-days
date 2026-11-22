use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

const BUNDLED_VOCABULARY: &str = include_str!("../assets/emotion-vocabulary.json");

/// The original, versioned English emotion vocabulary offered by the check-in.
///
/// Entries store emotion identifiers, so an identifier is never renamed or reused; labels and
/// descriptions are first-party English copy. The person's own words for a feeling belong in
/// `Entry::another_emotion`, which accepts any language.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmotionVocabulary {
    pub version: u32,
    pub families: Vec<EmotionFamily>,
    pub emotions: Vec<Emotion>,
}

/// One of the four families that group emotions by pleasantness and energy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmotionFamily {
    pub id: String,
    pub label: String,
}

/// A selectable emotion with its short English description.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Emotion {
    pub id: String,
    pub label: String,
    /// Identifier of the [`EmotionFamily`] this emotion belongs to.
    pub family: String,
    pub description: String,
}

impl EmotionVocabulary {
    /// Returns the emotion with this stable identifier, if the vocabulary offers it.
    pub fn emotion(&self, id: &str) -> Option<&Emotion> {
        self.emotions.iter().find(|emotion| emotion.id == id)
    }
}

/// The vocabulary bundled with this build, parsed once on first use.
pub fn emotion_vocabulary() -> &'static EmotionVocabulary {
    static VOCABULARY: OnceLock<EmotionVocabulary> = OnceLock::new();
    VOCABULARY.get_or_init(parse_bundled_vocabulary)
}

#[allow(
    clippy::expect_used,
    reason = "the bundled asset is compiled in and its validity is verified by the crate's tests"
)]
fn parse_bundled_vocabulary() -> EmotionVocabulary {
    serde_json::from_str(BUNDLED_VOCABULARY).expect("the bundled emotion vocabulary is valid")
}
