use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("The journal could not be saved. Check available disk space and try again.")]
    Storage,
    #[error("This entry has changed. Reopen it before saving to avoid overwriting another revision.")]
    Conflict,
    #[error("This date and slot already contain an entry. Choose a free slot.")]
    Occupied,
    #[error("The entry is no longer available.")]
    NotFound,
    #[error("Choose a valid journal date in YYYY-MM-DD format.")]
    Date,
    #[error("The journal document has an unsupported structure.")]
    Document,
    #[error("This journal needs a protected migration before it can be opened.")]
    MigrationRequired,
    #[error("Mood and energy must be whole numbers from 0 to 10; pride and progress from 1 to 10.")]
    Score,
    #[error("Add some writing, a mood score and an energy score before marking this entry complete.")]
    Completion,
    #[error("Each action and small win needs a unique ID and some text.")]
    Reflection,
    #[error("The backup could not be created. Check the selected folder and available disk space, then try again.")]
    Backup,
    #[error("Backup validation failed. The previous backups remain available.")]
    BackupValidation,
    #[error("The backup could not be restored. Check the passphrase and choose a complete supported backup. Your current journal is unchanged.")]
    Restore,
    #[error("Choose a backup passphrase with at least 12 characters. Keep it somewhere safe for recovery.")]
    Passphrase,
}

impl From<rusqlite::Error> for Error {
    fn from(_: rusqlite::Error) -> Self { Self::Storage }
}

impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self { Self::Document }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Slot { Morning, Evening }

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Depth { Quick, #[default] Daily, Deep }

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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Action { pub id: String, pub text: String, pub category: String }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Win {
    pub id: String,
    pub text: String,
    pub origin: String,
    pub include_in_insights: bool,
}

impl Win {
    pub fn manual(text: &str) -> Self {
        Self { id: Uuid::new_v4().to_string(), text: text.to_owned(), origin: "manual".into(), include_in_insights: true }
    }
}

impl Slot {
    pub(crate) fn as_str(self) -> &'static str {
        match self { Self::Morning => "morning", Self::Evening => "evening" }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    pub id: String,
    pub date: String,
    pub slot: Slot,
    pub document: Value,
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
    #[serde(default)]
    pub emotion: String,
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
    #[serde(default = "default_time_zone")]
    pub created_time_zone: String,
}

impl Entry {
    pub fn draft(date: &str, slot: Slot) -> Self {
        Self {
            id: Uuid::new_v4().to_string(), date: date.to_owned(), slot,
            document: json!({"type":"doc","content":[{"type":"paragraph"}]}),
            revision: 0,
            mood: None, energy: None, complete: false,
            title: String::new(), pride: None, progress: None, emotion: String::new(), another_emotion: String::new(), depth: Depth::Daily,
            reflection: Reflection::default(), actions: vec![], wins: vec![], created_time_zone: default_time_zone(),
        }
    }

    pub(crate) fn validate(&self) -> Result<(), Error> {
        if [self.mood, self.energy].into_iter().flatten().any(|v| !(0..=10).contains(&v)) { return Err(Error::Score); }
        if [self.pride, self.progress].into_iter().flatten().any(|v| !(1..=10).contains(&v)) { return Err(Error::Score); }
        if self.created_time_zone.parse::<chrono_tz::Tz>().is_err() { return Err(Error::Date); }
        let mut ids = std::collections::HashSet::new();
        for action in &self.actions {
            if action.id.is_empty() || action.text.trim().is_empty() || !ids.insert(&action.id) { return Err(Error::Reflection); }
        }
        let mut ids = std::collections::HashSet::new();
        let mut promoted = false;
        for win in &self.wins {
            if win.id.is_empty() || win.text.trim().is_empty() || !ids.insert(&win.id) || !matches!(win.origin.as_str(), "manual" | "pride") { return Err(Error::Reflection); }
            if win.origin == "pride" {
                if promoted { return Err(Error::Reflection); }
                promoted = true;
            }
        }
        let date = NaiveDate::parse_from_str(&self.date, "%Y-%m-%d").map_err(|_| Error::Date)?;
        if date.format("%Y-%m-%d").to_string() != self.date { return Err(Error::Date); }
        if Uuid::parse_str(&self.id).is_err() || self.document.get("type").and_then(Value::as_str) != Some("doc") {
            return Err(Error::Document);
        }
        validate_node(&self.document)
    }

    pub fn can_complete(&self) -> bool {
        self.mood.is_some() && self.energy.is_some() && !document_text(&self.document).trim().is_empty()
    }

    pub fn promote_pride(&mut self) {
        if self.reflection.proud_of.trim().is_empty() || self.wins.iter().any(|w| w.origin == "pride") { return; }
        let mut win = Win::manual(&self.reflection.proud_of);
        win.origin = "pride".into();
        self.wins.push(win);
    }
}

fn default_time_zone() -> String { "Europe/Paris".into() }

pub fn document_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) { return text.to_owned(); }
    node.get("content").and_then(Value::as_array)
        .map(|children| children.iter().map(document_text).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

fn validate_node(node: &Value) -> Result<(), Error> {
    let kind = node.get("type").and_then(Value::as_str).ok_or(Error::Document)?;
    if !matches!(kind, "doc" | "paragraph" | "text" | "heading" | "bulletList" | "orderedList" | "listItem" | "blockquote" | "codeBlock" | "hardBreak" | "horizontalRule") {
        return Err(Error::Document);
    }
    if kind == "text" && node.get("text").and_then(Value::as_str).is_none() { return Err(Error::Document); }
    if let Some(marks) = node.get("marks") {
        for mark in marks.as_array().ok_or(Error::Document)? {
            if !matches!(mark.get("type").and_then(Value::as_str), Some("bold" | "italic" | "strike" | "code" | "underline")) {
                return Err(Error::Document);
            }
        }
    }
    if let Some(content) = node.get("content") {
        for child in content.as_array().ok_or(Error::Document)? { validate_node(child)?; }
    }
    Ok(())
}
