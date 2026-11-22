//! Metadata-only diagnostics.
//!
//! A failure is recorded as the operation that failed and its stable error code. Both are
//! `&'static str`, so journal text, scores, backup paths and passphrases, which only exist at
//! run time, cannot reach this output.

/// Writes one line naming a failed operation and its error code to standard error.
pub fn record(operation: &'static str, code: &'static str) {
    eprintln!("{}", line(operation, code));
}

fn line(operation: &'static str, code: &'static str) -> String {
    format!("through-the-days: {operation} failed ({code})")
}

#[cfg(test)]
mod tests {
    use super::line;
    use crate::error::CommandError;

    #[test]
    fn a_diagnostic_line_holds_only_the_operation_and_the_error_code() {
        let error = CommandError::from(journal_core::Error::Restore);
        let recorded = line("restore backup", error.code);
        assert_eq!(
            recorded,
            "through-the-days: restore backup failed (restore)"
        );
        // The English message stays with the person; diagnostics keep metadata only.
        assert!(!recorded.contains(&error.message));
    }
}
