use crate::{Error, emotion_vocabulary};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use uuid::Uuid;

/// The person's chosen part of the day; never inferred from the time of writing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Slot {
    Morning,
    Evening,
}

impl Slot {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Morning => "morning",
            Self::Evening => "evening",
        }
    }
}

/// A presentation of the same entry. Switching depth never changes identity or content.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Depth {
    Quick,
    #[default]
    Daily,
    Deep,
}

/// Optional written answers of the check-in. An empty string means unanswered.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Reflection {
    pub intention: String,
    pub proud_of: String,
    pub difficulty: String,
    pub next_step: String,
    pub helped: String,
    pub learned: String,
}

/// Something the person explicitly reports having done.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Action {
    pub id: String,
    pub text: String,
    /// Preset category identifier, or an empty string for a custom action.
    pub category: String,
}

/// A small win the person explicitly recognised; counted once by its identifier.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Win {
    pub id: String,
    pub text: String,
    /// `manual` when entered directly, `pride` when promoted from the pride reflection.
    pub origin: String,
    pub include_in_insights: bool,
}

impl Win {
    pub fn manual(text: &str) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            text: text.to_owned(),
            origin: "manual".into(),
            include_in_insights: true,
        }
    }
}

/// The complete entry aggregate, saved and acknowledged as one revision.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub id: String,
    /// Chosen civil journal date (`YYYY-MM-DD`); never recomputed from timestamps.
    pub date: String,
    pub slot: Slot,
    /// Canonical editor document; Markdown is derived from it.
    pub document: Value,
    /// Last acknowledged revision; 0 for an entry that has never been saved.
    pub revision: u32,
    #[serde(default)]
    pub mood: Option<i32>,
    #[serde(default)]
    pub energy: Option<i32>,
    #[serde(default)]
    pub complete: bool,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub pride: Option<i32>,
    #[serde(default)]
    pub progress: Option<i32>,
    /// Emotion vocabulary identifier, or an empty string when none was chosen.
    #[serde(default)]
    pub emotion: String,
    /// The person's own word for a feeling, in any language.
    #[serde(default)]
    pub another_emotion: String,
    #[serde(default)]
    pub depth: Depth,
    #[serde(default)]
    pub reflection: Reflection,
    #[serde(default)]
    pub actions: Vec<Action>,
    #[serde(default)]
    pub wins: Vec<Win>,
    /// IANA time zone configured when the entry was created; context only.
    #[serde(default = "default_time_zone")]
    pub created_time_zone: String,
}

impl Entry {
    pub fn draft(date: &str, slot: Slot) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            date: date.to_owned(),
            slot,
            document: json!({"type": "doc", "content": [{"type": "paragraph"}]}),
            revision: 0,
            mood: None,
            energy: None,
            complete: false,
            title: String::new(),
            pride: None,
            progress: None,
            emotion: String::new(),
            another_emotion: String::new(),
            depth: Depth::Daily,
            reflection: Reflection::default(),
            actions: vec![],
            wins: vec![],
            created_time_zone: default_time_zone(),
        }
    }

    pub(crate) fn validate(&self) -> Result<(), Error> {
        let mut momentary = [self.mood, self.energy].into_iter().flatten();
        let mut optional = [self.pride, self.progress].into_iter().flatten();
        if momentary.any(|score| !(0..=10).contains(&score))
            || optional.any(|score| !(1..=10).contains(&score))
        {
            return Err(Error::Score);
        }
        if !self.emotion.is_empty() && emotion_vocabulary().emotion(&self.emotion).is_none() {
            return Err(Error::Emotion);
        }
        if self.created_time_zone.parse::<chrono_tz::Tz>().is_err() {
            return Err(Error::Date);
        }
        let mut action_ids = HashSet::new();
        for action in &self.actions {
            if action.id.is_empty()
                || action.text.trim().is_empty()
                || !action_ids.insert(&action.id)
            {
                return Err(Error::Reflection);
            }
        }
        let mut win_ids = HashSet::new();
        let mut promoted = false;
        for win in &self.wins {
            if win.id.is_empty()
                || win.text.trim().is_empty()
                || !win_ids.insert(&win.id)
                || !matches!(win.origin.as_str(), "manual" | "pride")
            {
                return Err(Error::Reflection);
            }
            if win.origin == "pride" {
                if promoted {
                    return Err(Error::Reflection);
                }
                promoted = true;
            }
        }
        parse_date(&self.date)?;
        if Uuid::parse_str(&self.id).is_err()
            || self.document.get("type").and_then(Value::as_str) != Some("doc")
        {
            return Err(Error::Document);
        }
        validate_node(&self.document, 1)
    }

    /// Whether an explicit completion request may succeed: writing, mood and energy are present.
    pub fn can_complete(&self) -> bool {
        self.mood.is_some()
            && self.energy.is_some()
            && !document_text(&self.document).trim().is_empty()
    }

    /// Adds one small win linked to the pride reflection, at most once.
    pub fn promote_pride(&mut self) {
        if self.reflection.proud_of.trim().is_empty()
            || self.wins.iter().any(|win| win.origin == "pride")
        {
            return;
        }
        let mut win = Win::manual(&self.reflection.proud_of);
        win.origin = "pride".into();
        self.wins.push(win);
    }
}

/// Validates a journal date written as `YYYY-MM-DD`.
pub(crate) fn parse_date(date: &str) -> Result<NaiveDate, Error> {
    let parsed = NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| Error::Date)?;
    if parsed.format("%Y-%m-%d").to_string() != date {
        return Err(Error::Date);
    }
    Ok(parsed)
}

fn default_time_zone() -> String {
    "Europe/Paris".into()
}

/// Node types of the editor schema, `JOURNAL_NODE_TYPES` in
/// `apps/desktop/src/features/editor/extensions.ts`.
const NODE_TYPES: [&str; 11] = [
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "hardBreak",
    "horizontalRule",
];

/// Mark types of the editor schema, `JOURNAL_MARK_TYPES` in the same file. Links are not part
/// of the journal document.
const MARK_TYPES: [&str; 5] = ["bold", "italic", "strike", "code", "underline"];

/// Deepest node nesting a journal document may have; the document node itself is level 1.
///
/// The editor never nests deeper, and the limit keeps every accepted document well inside the
/// JSON nesting limit (128) of the desktop shell's command parser and of stored payloads.
const MAXIMUM_DOCUMENT_DEPTH: usize = 32;

/// Plain text of an editor document, one line per text block.
pub fn document_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_owned();
    }
    node.get("content")
        .and_then(Value::as_array)
        .map(|children| {
            children
                .iter()
                .map(document_text)
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

/// Accepts only what the editor schema has: its node and mark types (no links), non-empty text
/// nodes, and at most [`MAXIMUM_DOCUMENT_DEPTH`] levels. A document the editor could not load
/// would open as a blank page, and the next edit would replace the stored writing.
fn validate_node(node: &Value, depth: usize) -> Result<(), Error> {
    if depth > MAXIMUM_DOCUMENT_DEPTH {
        return Err(Error::Document);
    }
    let kind = node
        .get("type")
        .and_then(Value::as_str)
        .ok_or(Error::Document)?;
    if !NODE_TYPES.contains(&kind) {
        return Err(Error::Document);
    }
    // ProseMirror refuses empty text nodes; an empty block simply has no content.
    if kind == "text"
        && node
            .get("text")
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
    {
        return Err(Error::Document);
    }
    if let Some(marks) = node.get("marks") {
        for mark in marks.as_array().ok_or(Error::Document)? {
            if !mark
                .get("type")
                .and_then(Value::as_str)
                .is_some_and(|kind| MARK_TYPES.contains(&kind))
            {
                return Err(Error::Document);
            }
        }
    }
    if let Some(content) = node.get("content") {
        for child in content.as_array().ok_or(Error::Document)? {
            validate_node(child, depth + 1)?;
        }
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used, reason = "a failed unwrap is a failed test")]
mod tests {
    use super::{MARK_TYPES, NODE_TYPES};

    /// journal-editor — Portable document fidelity: the journal accepts exactly the node and mark
    /// types of the editor schema, so a document one accepts the other can represent.
    #[test]
    fn accepted_node_and_mark_types_match_the_editor_schema() {
        let source = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../apps/desktop/src/features/editor/extensions.ts"
        ))
        .unwrap();
        let editor_list = |name: &str| -> Vec<String> {
            source
                .split(&format!("export const {name} = ["))
                .nth(1)
                .unwrap()
                .split(']')
                .next()
                .unwrap()
                .split(',')
                .map(|item| item.trim().trim_matches('\'').to_owned())
                .filter(|item| !item.is_empty())
                .collect()
        };
        assert_eq!(editor_list("JOURNAL_NODE_TYPES"), NODE_TYPES);
        assert_eq!(editor_list("JOURNAL_MARK_TYPES"), MARK_TYPES);
    }
}
