//! Reading queries reuse active saved aggregates. Search is a disposable in-memory FTS5 index.

use crate::model::parse_date;
use crate::{Entry, Error, Journal, Slot, document_text};
use chrono::{Days, NaiveDate};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Measure {
    pub observations: usize,
    pub recorded_days: usize,
    pub mean: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Observation {
    pub id: String,
    pub slot: Slot,
    pub mood: Option<i32>,
    pub energy: Option<i32>,
    pub pride: Option<i32>,
    pub progress: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayObservations {
    pub date: String,
    pub observations: Vec<Observation>,
}

#[derive(Debug, Clone, Serialize)]
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
    fn value(self, entry: &Entry) -> Option<i32> {
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

/// Inclusive date bounds of a request, compared as dates: as text, `+10000-01-02`, the Sunday
/// that ends the week of Monday 27 December 9999, would sort before `9999-12-27`.
#[derive(Clone, Copy)]
struct DateBounds {
    from: Option<NaiveDate>,
    to: Option<NaiveDate>,
}

impl DateBounds {
    fn contains(self, date: &str) -> bool {
        if self.from.is_none() && self.to.is_none() {
            return true;
        }
        parse_date(date).is_ok_and(|date| {
            self.from.is_none_or(|from| date >= from) && self.to.is_none_or(|to| date <= to)
        })
    }
}

impl SearchRequest {
    /// Checks the request and returns its date bounds.
    fn validate(&self) -> Result<DateBounds, Error> {
        let from = self.from.as_deref().map(parse_date).transpose()?;
        let to = self.to.as_deref().map(parse_date).transpose()?;
        if from.zip(to).is_some_and(|(from, to)| from > to) {
            return Err(Error::Date);
        }
        if self.minimum.is_some_and(|v| !(0..=10).contains(&v)) {
            return Err(Error::Score);
        }
        Ok(DateBounds { from, to })
    }

    fn matches(&self, entry: &Entry, dates: DateBounds) -> bool {
        dates.contains(&entry.date)
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
        self.reading_report_and_entries(request)
            .map(|(report, _)| report)
    }

    /// The reading report of `request` and the entries it counts, from one read of the journal.
    pub(crate) fn reading_report_and_entries(
        &self,
        request: &SearchRequest,
    ) -> Result<(ReadingReport, Vec<Entry>), Error> {
        let dates = request.validate()?;
        let (Some(start), Some(end)) = (dates.from, dates.to) else {
            return Err(Error::Date);
        };
        let count = end.signed_duration_since(start).num_days() + 1;
        if !(1..=36600).contains(&count) {
            return Err(Error::Date);
        }
        // Original search can find any owned win; insight filters, the search text included, may
        // only use included wins.
        let candidates = SearchRequest {
            has_win: None,
            ..request.clone()
        };
        let entries: Vec<_> = self
            .find(&candidates, true)?
            .into_iter()
            .filter(|entry| entry.include_in_insights)
            .filter(|entry| {
                request.has_win.is_none_or(|required| {
                    entry.wins.iter().any(|win| win.include_in_insights) == required
                })
            })
            .collect();
        let measure = |metric: ScoreMetric| {
            let scores: Vec<_> = entries
                .iter()
                .filter_map(|entry| metric.value(entry))
                .collect();
            Measure {
                observations: scores.len(),
                recorded_days: entries
                    .iter()
                    .filter(|entry| metric.value(entry).is_some())
                    .map(|entry| &entry.date)
                    .collect::<HashSet<_>>()
                    .len(),
                mean: if scores.is_empty() {
                    None
                } else {
                    Some(scores.iter().map(|v| f64::from(*v)).sum::<f64>() / scores.len() as f64)
                },
            }
        };
        // Grouped once, so a long range costs one pass over its days and one over its entries.
        let mut by_date: HashMap<&str, Vec<&Entry>> = HashMap::new();
        for entry in &entries {
            by_date.entry(entry.date.as_str()).or_default().push(entry);
        }
        let mut days = Vec::with_capacity(count as usize);
        for offset in 0..count {
            let date = start
                .checked_add_days(Days::new(offset as u64))
                .ok_or(Error::Date)?
                .to_string();
            // `list` orders Morning before Evening on a date, and the filters keep that order.
            let observations: Vec<_> = by_date
                .get(date.as_str())
                .into_iter()
                .flatten()
                .map(|e| Observation {
                    id: e.id.clone(),
                    slot: e.slot,
                    mood: e.mood,
                    energy: e.energy,
                    pride: e.pride,
                    progress: e.progress,
                })
                .collect();
            days.push(DayObservations { date, observations });
        }
        let wins: HashSet<_> = entries
            .iter()
            .flat_map(|e| &e.wins)
            .filter(|w| w.include_in_insights)
            .map(|w| &w.id)
            .collect();
        let report = ReadingReport {
            from: start.to_string(),
            to: end.to_string(),
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
        };
        Ok((report, entries))
    }

    /// Literal-token search over the whole saved entry (see `searchable_text`): Unicode case
    /// folding and Latin accent folding, no FTS operators, prefixes or stemming. Each
    /// space-separated part of the query must appear as consecutive words; a part with no indexed
    /// word, such as `?` or `🌿`, is ignored, and a query made only of such parts finds nothing.
    /// Each Han, kana, Hangul or Thai character is a word of its own (see
    /// `separate_unspaced_characters`), so `散歩` finds `公園を散歩した`.
    /// Every query indexes the current active records, so edits/trash cannot leave stale excerpts.
    pub fn search(&self, request: &SearchRequest) -> Result<Vec<Entry>, Error> {
        self.find(request, false)
    }

    /// `search`, reading only the wins included in insights when `insights` is set.
    fn find(&self, request: &SearchRequest, insights: bool) -> Result<Vec<Entry>, Error> {
        let dates = request.validate()?;
        let entries: Vec<_> = self
            .list()?
            .into_iter()
            .filter(|entry| request.matches(entry, dates))
            .collect();
        if request.text.trim().is_empty() {
            return Ok(entries);
        }
        let index = Connection::open_in_memory()?;
        index.execute_batch(&format!("PRAGMA temp_store=MEMORY; CREATE VIRTUAL TABLE source_text USING fts5(id UNINDEXED, text, tokenize='unicode61 remove_diacritics 2 tokenchars {THAI_MARKS}');"))?;
        {
            let mut insert = index.prepare("INSERT INTO source_text(id,text) VALUES(?1,?2)")?;
            for entry in &entries {
                insert.execute(params![
                    entry.id,
                    separate_unspaced_characters(&searchable_text(entry, insights))
                ])?;
            }
        }
        // Quotes make every user token a literal phrase; input never supplies MATCH operators or SQL.
        // An implicit AND (a space) drops a phrase the tokenizer leaves empty, such as "?" or "🌿",
        // whereas an explicit AND keeps it and then matches nothing. A query of empty phrases alone
        // still matches nothing. The spaces that separate Han, kana, Hangul and Thai characters are
        // added inside the quotes, so those characters still match only consecutive and in order.
        let query = request
            .text
            .split_whitespace()
            .map(|word| {
                let phrase = separate_unspaced_characters(word);
                format!("\"{}\"", phrase.replace('"', "\"\""))
            })
            .collect::<Vec<_>>()
            .join(" ");
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

/// The text that search reads (D-017): the title, the writing, the six reflection answers, action
/// and small-win text and the person's own emotion word, one per line. With `insights`, as for
/// insight reports, a win excluded from insights is left out, so its words cannot select its
/// entry there. `apps/desktop/src/api/reading-preview.ts` mirrors this.
fn searchable_text(entry: &Entry, insights: bool) -> String {
    let reflection = &entry.reflection;
    let answers = [
        &reflection.intention,
        &reflection.proud_of,
        &reflection.difficulty,
        &reflection.next_step,
        &reflection.helped,
        &reflection.learned,
    ];
    let actions = entry.actions.iter().map(|action| &action.text);
    let wins = entry
        .wins
        .iter()
        .filter(|win| !insights || win.include_in_insights)
        .map(|win| &win.text);
    let mut text = format!("{}\n{}", entry.title, document_text(&entry.document));
    for field in answers
        .into_iter()
        .chain(actions)
        .chain(wins)
        .chain([&entry.another_emotion])
    {
        text.push('\n');
        text.push_str(field);
    }
    text
}

/// Thai vowel and tone marks written above or below a letter. unicode61 treats these combining
/// marks as separators, which would drop them from Thai words; the index declares them token
/// characters, and `separate_unspaced_characters` keeps each one with the letter before it.
/// `apps/desktop/src/api/reading-preview.ts` mirrors this list.
const THAI_MARKS: &str = "\u{0E31}\u{0E34}\u{0E35}\u{0E36}\u{0E37}\u{0E38}\u{0E39}\u{0E3A}\
                          \u{0E47}\u{0E48}\u{0E49}\u{0E4A}\u{0E4B}\u{0E4C}\u{0E4D}\u{0E4E}";

/// Characters of the scripts written without spaces between words: Thai letters and Han, kana and
/// Hangul blocks. The ranges also hold punctuation, such as `・`, and Japanese combining sound
/// marks, which the tokenizer ignores anyway. `apps/desktop/src/api/reading-preview.ts` mirrors
/// these ranges.
fn is_unspaced(character: char) -> bool {
    matches!(character,
        // Thai letters and the vowels written beside them; digits keep their number words.
        '\u{0E01}'..='\u{0E30}' | '\u{0E32}'..='\u{0E33}' | '\u{0E40}'..='\u{0E46}'
        // Hangul Jamo, then the ideographic iteration and number marks such as 々, 〆 and 〇.
        | '\u{1100}'..='\u{11FF}'
        | '\u{3005}'..='\u{3007}' | '\u{3021}'..='\u{3029}' | '\u{3038}'..='\u{303B}'
        // Hiragana, Katakana with ー, Hangul compatibility jamo and Katakana extensions.
        | '\u{3041}'..='\u{30FF}' | '\u{3131}'..='\u{318E}' | '\u{31F0}'..='\u{31FF}'
        // CJK Unified Ideographs and Extension A.
        | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}'
        // Hangul Jamo Extended-A, Hangul syllables and Jamo Extended-B.
        | '\u{A960}'..='\u{A97F}' | '\u{AC00}'..='\u{D7FF}'
        // CJK Compatibility Ideographs, then halfwidth Katakana and Hangul.
        | '\u{F900}'..='\u{FAFF}' | '\u{FF66}'..='\u{FFDC}'
        // Historic kana, then the ideograph extensions in planes 2 and 3.
        | '\u{1AFF0}'..='\u{1B16F}' | '\u{20000}'..='\u{3FFFF}'
    )
}

/// Puts a space before each Han, kana, Hangul or Thai character and after it, past the Thai marks
/// that follow it, so that unicode61 makes each one a word of its own. These scripts do not
/// separate words with spaces, so a whole run would otherwise be one word, and a word inside it
/// could never be found. Search applies this to the indexed text and inside each quoted query
/// part alike: `散歩` becomes the phrase `"散 歩"`, which still needs both characters consecutive.
/// Hangul is split by syllable too, so `학교` finds `학교에`, and also `대학교`. Other text is
/// unchanged.
fn separate_unspaced_characters(text: &str) -> String {
    let mut separated = String::with_capacity(text.len());
    let mut after_unspaced = false;
    for character in text.chars() {
        if THAI_MARKS.contains(character) {
            separated.push(character);
            continue;
        }
        let unspaced = is_unspaced(character);
        if unspaced || after_unspaced {
            separated.push(' ');
        }
        separated.push(character);
        after_unspaced = unspaced;
    }
    separated
}
