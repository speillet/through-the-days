use crate::{Depth, Error, Journal};
use chrono::{DateTime, Utc};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

/// Interface text sizes the person can choose, in percent of the default size.
const TEXT_SCALES: [u16; 4] = [100, 115, 130, 150];

/// Display preferences stored in the journal.
///
/// Missing fields take their defaults, so preferences stored by an earlier version still load;
/// unknown fields are rejected rather than silently dropped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    /// IANA time zone used for new-entry defaults and daily backups.
    pub time_zone: String,
    /// `system`, `light` or `dark`.
    pub theme: String,
    /// Gentle view: hides optional tracking without deleting data.
    pub gentle: bool,
    pub show_durations: bool,
    pub show_toolbar: bool,
    pub show_scores: bool,
    pub sidebar_open: bool,
    /// Disables nonessential animation even when the system setting allows it.
    pub reduce_motion: bool,
    /// Writing depth offered first for a new entry; presentation only.
    pub default_depth: Depth,
    pub show_word_count: bool,
    /// Text size of the interface and the journal page in percent: 100, 115, 130 or 150.
    pub text_scale: u16,
    pub timeline_days: u8,
    pub timeline_metrics: Vec<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            time_zone: "Europe/Paris".into(),
            theme: "system".into(),
            gentle: false,
            show_durations: true,
            show_toolbar: true,
            show_scores: true,
            sidebar_open: true,
            reduce_motion: false,
            default_depth: Depth::Daily,
            show_word_count: false,
            text_scale: 100,
            timeline_days: 14,
            timeline_metrics: vec![
                "mood".into(),
                "energy".into(),
                "pride".into(),
                "progress".into(),
            ],
        }
    }
}

impl Preferences {
    /// The civil journal date of `now` in the configured time zone.
    pub fn journal_date(&self, now: DateTime<Utc>) -> Result<String, Error> {
        let zone = self
            .time_zone
            .parse::<chrono_tz::Tz>()
            .map_err(|_| Error::Date)?;
        Ok(now.with_timezone(&zone).date_naive().to_string())
    }

    /// The rules every stored preference meets: a known time zone ([`Error::Date`]), and a
    /// supported theme and text size ([`Error::Document`]).
    ///
    /// Saving and restoring apply the same rules, so a restored journal never holds preferences
    /// that would break today's date or the interface.
    pub(crate) fn validate(&self) -> Result<(), Error> {
        self.journal_date(Utc::now())?;
        if !matches!(self.theme.as_str(), "system" | "light" | "dark")
            || !TEXT_SCALES.contains(&self.text_scale)
        {
            return Err(Error::Document);
        }
        if ![7, 14, 30].contains(&self.timeline_days)
            || self
                .timeline_metrics
                .iter()
                .any(|m| !matches!(m.as_str(), "mood" | "energy" | "pride" | "progress"))
        {
            return Err(Error::Document);
        }
        Ok(())
    }
}

impl Journal {
    pub fn preferences(&self) -> Result<Preferences, Error> {
        let stored: Option<String> = self
            .connection
            .query_row(
                "SELECT value FROM preferences WHERE key='display'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        match stored {
            Some(value) => Ok(serde_json::from_str(&value)?),
            None => Ok(Preferences::default()),
        }
    }

    /// Validates the time zone, theme and text size, then stores the preferences.
    pub fn set_preferences(&self, preferences: &Preferences) -> Result<(), Error> {
        preferences.validate()?;
        self.connection.execute(
            "INSERT INTO preferences(key,value) VALUES('display',?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [serde_json::to_string(preferences)?],
        )?;
        Ok(())
    }
}
