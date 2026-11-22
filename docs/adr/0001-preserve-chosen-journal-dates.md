---
status: accepted
date: 2026-11-22
---

# Preserve chosen journal dates across time-zone changes

The user confirmed that writing defaults to the current civil date, with explicit correction for late-night writing, and that historical dates remain stable when the time zone changes. Journal date and Morning/Evening slot therefore describe the person's chosen context rather than a date repeatedly inferred from a technical timestamp.

Recomputing every historical date from UTC would change the meaning of past entries during travel. New-entry defaults and time-based calculations use the configured time zone; existing journal dates change only through an explicit edit that respects slot uniqueness.
