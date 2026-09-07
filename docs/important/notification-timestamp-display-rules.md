# Message Timestamp Display Rules

## Rules

1. **0–59 seconds** → `"now"` (no sub-second granularity).
2. **60s–59m 59s** → `"{N}m ago"` (e.g. `"1m ago"`, `"59m ago"`). Flips from `"now"` to `"1m ago"` at exactly 60s — no rounding up early.
3. **1h–23h 59m** → `"{N}h ago"` (e.g. `"1h ago"`, `"23h ago"`). Flips at exactly 60m.
4. **Previous calendar day** → `"Yesterday"` (determined by `toDateString()` comparison, not a 24-hour window — e.g. 11:30pm → 12:30am is `"Yesterday"`).
5. **≥ 2 calendar days ago** → absolute date in `MM/DD/YY` format (e.g. `"12/27/25"`).

## Key behaviors

- **Relative until yesterday** — then jumps to absolute date. No "2 days ago" or "1 week ago" — it's either `"Yesterday"` or the date.
- **Calendar-day boundary**, not a rolling 24h window — a message from 11pm shows `"1h ago"` at 12:30am if still the same calendar day; but one from 11pm shows `"Yesterday"` after midnight even if only 90 minutes old.
- **Exactly 60s** → `"1m ago"` (not `"now"`). Boundary belongs to the next bucket.

## Summary table

| Elapsed | Display |
|---|---|
| < 60s | `now` |
| 60s – 59m | `{N}m ago` |
| 1h – 23h | `{N}h ago` |
| Previous calendar day | `Yesterday` |
| ≥ 2 days | `MM/DD/YY` |
