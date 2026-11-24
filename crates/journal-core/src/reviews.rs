//! Authored weekly notes and private milestones are journal data; local summaries are disposable.

use crate::{Error, Journal, ReadingReport, SearchRequest, model::parse_date};
use chrono::{Datelike, Days};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Milestone {
    pub id: String,
    pub date: String,
    pub title: String,
    pub notes: String,
    pub revision: u32,
}

impl Milestone {
    pub fn new(date: &str, title: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            date: date.into(),
            title: title.into(),
            notes: String::new(),
            revision: 0,
        }
    }
    pub(crate) fn validate(&self) -> Result<(), Error> {
        parse_date(&self.date)?;
        if uuid::Uuid::parse_str(&self.id).is_err() || self.title.trim().is_empty() {
            return Err(Error::Document);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct StoredReview {
    pub week_start: String,
    pub notes: String,
    pub revision: u32,
    pub summary: Option<String>,
    pub fingerprint: Option<String>,
}

impl StoredReview {
    pub(crate) fn validate(&self) -> Result<(), Error> {
        if week_start(&self.week_start)? != self.week_start || self.revision == 0 {
            return Err(Error::Document);
        }
        if self.summary.is_some() != self.fingerprint.is_some() {
            return Err(Error::Document);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyReview {
    pub week_start: String,
    pub week_end: String,
    pub notes: String,
    pub revision: u32,
    pub summary: Option<String>,
    pub stale: bool,
    pub report: ReadingReport,
}

fn week_start(date: &str) -> Result<String, Error> {
    let date = parse_date(date)?;
    Ok(date
        .checked_sub_days(Days::new(u64::from(date.weekday().num_days_from_monday())))
        .ok_or(Error::Date)?
        .to_string())
}

impl Journal {
    fn stored_review(&self, start: &str) -> Result<StoredReview, Error> {
        let payload: Option<String> = self
            .connection
            .query_row(
                "SELECT payload FROM weekly_reviews WHERE week_start=?1",
                [start],
                |r| r.get(0),
            )
            .optional()?;
        match payload {
            Some(p) => Ok(serde_json::from_str(&p)?),
            None => Ok(StoredReview {
                week_start: start.into(),
                notes: String::new(),
                revision: 0,
                summary: None,
                fingerprint: None,
            }),
        }
    }

    fn week_request(&self, date: &str) -> Result<SearchRequest, Error> {
        let start = week_start(date)?;
        let end = parse_date(&start)?
            .checked_add_days(Days::new(6))
            .ok_or(Error::Date)?
            .to_string();
        Ok(SearchRequest {
            from: Some(start),
            to: Some(end),
            ..Default::default()
        })
    }

    fn week_fingerprint(&self, request: &SearchRequest) -> Result<String, Error> {
        let entries: Vec<_> = self
            .search(request)?
            .into_iter()
            .filter(|e| e.include_in_insights)
            .collect();
        Ok(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&entries)?)
        ))
    }

    pub fn weekly_review(&self, date: &str) -> Result<WeeklyReview, Error> {
        let request = self.week_request(date)?;
        let start = request.from.as_deref().ok_or(Error::Date)?;
        let stored = self.stored_review(start)?;
        let fingerprint = self.week_fingerprint(&request)?;
        let stale = stored
            .fingerprint
            .as_ref()
            .is_some_and(|old| old != &fingerprint);
        Ok(WeeklyReview {
            week_start: start.into(),
            week_end: request.to.clone().ok_or(Error::Date)?,
            notes: stored.notes,
            revision: stored.revision,
            summary: if stale { None } else { stored.summary },
            stale,
            report: self.reading_report(&request)?,
        })
    }

    /// Saves the authored notes of the week holding `date` when its notes revision is still
    /// `revision`, and advances that revision. The reply is built before the commit, so an error
    /// means nothing was written.
    pub fn save_weekly_notes(
        &self,
        date: &str,
        notes: &str,
        revision: u32,
    ) -> Result<WeeklyReview, Error> {
        let start = week_start(date)?;
        let transaction = self.connection.unchecked_transaction()?;
        let mut stored = self.stored_review(&start)?;
        if stored.revision != revision {
            return Err(Error::Conflict);
        }
        stored.notes = notes.into();
        stored.revision = stored.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute("INSERT INTO weekly_reviews(week_start,payload) VALUES(?1,?2) ON CONFLICT(week_start) DO UPDATE SET payload=excluded.payload",params![start,serde_json::to_string(&stored)?])?;
        let review = self.weekly_review(&start)?;
        transaction.commit()?;
        Ok(review)
    }

    /// Replaces the week's disposable local summary and its source fingerprint, which alone
    /// marks the summary stale. The authored notes and their revision are left to notes saves,
    /// so a save based on the revision read before this one still succeeds. A week without a
    /// stored review is created with empty notes at revision 1: stored revisions are positive.
    /// The reply is built before the commit, so an error means nothing was written.
    pub fn generate_weekly_summary(&self, date: &str) -> Result<WeeklyReview, Error> {
        let request = self.week_request(date)?;
        let start = request.from.as_deref().ok_or(Error::Date)?;
        let transaction = self.connection.unchecked_transaction()?;
        let mut stored = self.stored_review(start)?;
        stored.revision = stored.revision.max(1);
        let report = self.reading_report(&request)?;
        stored.summary = Some(format!(
            "{} recorded {} out of 7, with {} saved {}, {} approved small {} and {} reported {}. Saved drafts are included. Missing scores are left out; this is a description of recorded information, not a judgement of the week.",
            report.recorded_days,
            if report.recorded_days == 1 {
                "day"
            } else {
                "days"
            },
            report.entries,
            if report.entries == 1 {
                "entry"
            } else {
                "entries"
            },
            report.wins,
            if report.wins == 1 { "win" } else { "wins" },
            report.actions,
            if report.actions == 1 {
                "action"
            } else {
                "actions"
            },
        ));
        stored.fingerprint = Some(self.week_fingerprint(&request)?);
        transaction.execute("INSERT INTO weekly_reviews(week_start,payload) VALUES(?1,?2) ON CONFLICT(week_start) DO UPDATE SET payload=excluded.payload",params![start,serde_json::to_string(&stored)?])?;
        let review = self.weekly_review(start)?;
        transaction.commit()?;
        Ok(review)
    }

    pub fn clear_reading_summaries(&self) -> Result<(), Error> {
        self.connection.execute("UPDATE weekly_reviews SET payload=json_set(payload,'$.summary',NULL,'$.fingerprint',NULL)",[])?;
        Ok(())
    }

    pub fn milestones(&self) -> Result<Vec<Milestone>, Error> {
        let mut query = self.connection.prepare(
            "SELECT payload FROM timeline_milestones ORDER BY json_extract(payload,'$.date'),id",
        )?;
        query
            .query_map([], |r| r.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str(&row?)?))
            .collect()
    }

    pub fn save_milestone(&self, mut milestone: Milestone) -> Result<Milestone, Error> {
        milestone.validate()?;
        let transaction = self.connection.unchecked_transaction()?;
        let stored: Option<String> = transaction
            .query_row(
                "SELECT payload FROM timeline_milestones WHERE id=?1",
                [&milestone.id],
                |r| r.get(0),
            )
            .optional()?;
        let previous: Option<Milestone> = stored.map(|s| serde_json::from_str(&s)).transpose()?;
        if previous.map_or(0, |m| m.revision) != milestone.revision {
            return Err(Error::Conflict);
        }
        milestone.revision = milestone.revision.checked_add(1).ok_or(Error::Conflict)?;
        transaction.execute("INSERT INTO timeline_milestones(id,payload) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",params![milestone.id,serde_json::to_string(&milestone)?])?;
        transaction.commit()?;
        Ok(milestone)
    }

    pub fn delete_milestone(&self, id: &str, revision: u32) -> Result<(), Error> {
        if self.connection.execute(
            "DELETE FROM timeline_milestones WHERE id=?1 AND json_extract(payload,'$.revision')=?2",
            params![id, revision],
        )? != 1
        {
            return Err(Error::Conflict);
        }
        Ok(())
    }
}
