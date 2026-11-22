use crate::{Error, Journal};
use chrono::{DateTime, Utc};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub time_zone: String,
    pub theme: String,
    pub gentle: bool,
    pub show_durations: bool,
    pub show_toolbar: bool,
    pub show_scores: bool,
    pub sidebar_open: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self { time_zone: "Europe/Paris".into(), theme: "system".into(), gentle: false, show_durations: true, show_toolbar: true, show_scores: true, sidebar_open: true }
    }
}

impl Preferences {
    pub fn journal_date(&self, now: DateTime<Utc>) -> Result<String, Error> {
        let zone = self.time_zone.parse::<chrono_tz::Tz>().map_err(|_| Error::Date)?;
        Ok(now.with_timezone(&zone).date_naive().to_string())
    }
}

impl Journal {
    pub fn preferences(&self) -> Result<Preferences, Error> {
        let data: Option<String> = self.connection.query_row("SELECT value FROM preferences WHERE key='display'", [], |r| r.get(0)).optional()?;
        data.map(|v| serde_json::from_str(&v).map_err(Error::from)).unwrap_or_else(|| Ok(Preferences::default()))
    }

    pub fn set_preferences(&self, preferences: &Preferences) -> Result<(), Error> {
        preferences.journal_date(Utc::now())?;
        if !matches!(preferences.theme.as_str(), "system" | "light" | "dark") { return Err(Error::Document); }
        self.connection.execute("INSERT INTO preferences(key,value) VALUES('display',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(preferences)?])?;
        Ok(())
    }
}
