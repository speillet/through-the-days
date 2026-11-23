//! Reading queries reuse active saved aggregates. Search is a disposable in-memory FTS5 index.

use crate::model::parse_date;
use crate::{Entry, Error, Journal, Slot, document_text};
use chrono::Days;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Measure {
    pub observations: usize,
    pub mean: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub id: String,
    pub slot: Slot,
    pub mood: Option<i32>,
    pub energy: Option<i32>,
    pub pride: Option<i32>,
    pub progress: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayObservations {
    pub date: String,
    pub observations: Vec<Observation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingReport {
    pub from: String,
    pub to: String,
    pub calendar_days: usize,
    pub recorded_days: usize,
    pub entries: usize,
    pub wins: usize,
    pub actions: usize,
    pub mood: Measure,
    pub energy: Measure,
    pub pride: Measure,
    pub progress: Measure,
    pub days: Vec<DayObservations>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScoreMetric {
    Mood,
    Energy,
    Pride,
    Progress,
}

impl ScoreMetric {
    pub fn value(self, entry: &Entry) -> Option<i32> {
        match self {
            Self::Mood => entry.mood,
            Self::Energy => entry.energy,
            Self::Pride => entry.pride,
            Self::Progress => entry.progress,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchRequest {
    pub text: String,
    pub from: Option<String>,
    pub to: Option<String>,
    pub slot: Option<Slot>,
    pub emotion: Option<String>,
    pub complete: Option<bool>,
    pub has_win: Option<bool>,
    pub metric: Option<ScoreMetric>,
    pub minimum: Option<i32>,
}

impl SearchRequest {
    pub(crate) fn validate(&self) -> Result<(), Error> {
        if let Some(from) = &self.from {
            parse_date(from)?;
        }
        if let Some(to) = &self.to {
            parse_date(to)?;
        }
        if self
            .from
            .as_ref()
            .zip(self.to.as_ref())
            .is_some_and(|(a, b)| a > b)
        {
            return Err(Error::Date);
        }
        if self.minimum.is_some_and(|v| !(0..=10).contains(&v)) {
            return Err(Error::Score);
        }
        Ok(())
    }

    fn matches(&self, entry: &Entry) -> bool {
        self.from.as_ref().is_none_or(|from| &entry.date >= from)
            && self.to.as_ref().is_none_or(|to| &entry.date <= to)
            && self.slot.is_none_or(|slot| entry.slot == slot)
            && self
                .complete
                .is_none_or(|complete| entry.complete == complete)
            && self
                .emotion
                .as_ref()
                .is_none_or(|emotion| &entry.emotion == emotion)
            && self
                .has_win
                .is_none_or(|wins| !entry.wins.is_empty() == wins)
            && self
                .metric
                .zip(self.minimum)
                .is_none_or(|(metric, minimum)| {
                    metric.value(entry).is_some_and(|score| score >= minimum)
                })
    }
}

impl Journal {
    pub fn reading_report(&self, request: &SearchRequest) -> Result<ReadingReport, Error> {
        request.validate()?;
        let from = request.from.as_deref().ok_or(Error::Date)?;
        let to = request.to.as_deref().ok_or(Error::Date)?;
        let start = parse_date(from)?;
        let end = parse_date(to)?;
        let count = end.signed_duration_since(start).num_days() + 1;
        if !(1..=36600).contains(&count) {
            return Err(Error::Date);
        }
        let entries: Vec<_> = self
            .search(request)?
            .into_iter()
            .filter(|entry| entry.include_in_insights)
            .collect();
        let measure = |metric: ScoreMetric| {
            let scores: Vec<_> = entries
                .iter()
                .filter_map(|entry| metric.value(entry))
                .collect();
            Measure {
                observations: scores.len(),
                mean: if scores.is_empty() {
                    None
                } else {
                    Some(scores.iter().map(|v| f64::from(*v)).sum::<f64>() / scores.len() as f64)
                },
            }
        };
        let mut days = Vec::with_capacity(count as usize);
        for offset in 0..count {
            let date = start
                .checked_add_days(Days::new(offset as u64))
                .ok_or(Error::Date)?
                .to_string();
            let mut observations: Vec<_> = entries
                .iter()
                .filter(|e| e.date == date)
                .map(|e| Observation {
                    id: e.id.clone(),
                    slot: e.slot,
                    mood: e.mood,
                    energy: e.energy,
                    pride: e.pride,
                    progress: e.progress,
                })
                .collect();
            observations.sort_by_key(|o| if o.slot == Slot::Morning { 0 } else { 1 });
            days.push(DayObservations { date, observations });
        }
        let wins: HashSet<_> = entries
            .iter()
            .flat_map(|e| &e.wins)
            .filter(|w| w.include_in_insights)
            .map(|w| &w.id)
            .collect();
        Ok(ReadingReport {
            from: from.into(),
            to: to.into(),
            calendar_days: count as usize,
            recorded_days: days.iter().filter(|d| !d.observations.is_empty()).count(),
            entries: entries.len(),
            wins: wins.len(),
            actions: entries.iter().map(|e| e.actions.len()).sum(),
            mood: measure(ScoreMetric::Mood),
            energy: measure(ScoreMetric::Energy),
            pride: measure(ScoreMetric::Pride),
            progress: measure(ScoreMetric::Progress),
            days,
        })
    }

    /// Literal-token search: Unicode case folding and accent folding, no FTS operators or stemming.
    /// Every query indexes the current active records, so edits/trash cannot leave stale excerpts.
    pub fn search(&self, request: &SearchRequest) -> Result<Vec<Entry>, Error> {
        request.validate()?;
        let entries: Vec<_> = self
            .list()?
            .into_iter()
            .filter(|entry| request.matches(entry))
            .collect();
        if request.text.trim().is_empty() {
            return Ok(entries);
        }
        let index = Connection::open_in_memory()?;
        index.execute_batch("PRAGMA temp_store=MEMORY; CREATE VIRTUAL TABLE source_text USING fts5(id UNINDEXED, text, tokenize='unicode61 remove_diacritics 2');")?;
        {
            let mut insert = index.prepare("INSERT INTO source_text(id,text) VALUES(?1,?2)")?;
            for entry in &entries {
                insert.execute(params![
                    entry.id,
                    format!("{}\n{}", entry.title, document_text(&entry.document))
                ])?;
            }
        }
        // Quotes make every user token literal; input never supplies MATCH operators or SQL.
        let query = request
            .text
            .split_whitespace()
            .map(|word| format!("\"{}\"", word.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        let mut select = index.prepare("SELECT id FROM source_text WHERE source_text MATCH ?1")?;
        let matches: HashSet<String> = select
            .query_map([query], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        Ok(entries
            .into_iter()
            .filter(|entry| matches.contains(&entry.id))
            .collect())
    }
}
