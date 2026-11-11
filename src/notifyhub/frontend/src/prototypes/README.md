# Web prototype harness

`prototype.html` + `src/prototype.tsx` mount the real `AppView` and cards with
fake scenarios. No backend, SSE or e2e key is involved. Rules:
[`docs/_meta/how-to-prototype.md`](../../../../docs/_meta/how-to-prototype.md).

```bash
make frontend-prototype
# open http://localhost:9070/prototype.html
```

## Keys

| Key | Action |
| --- | --- |
| `1`–`7` | Jump to a scenario |
| `n` / `p` | Next / previous scenario |
| `t` | Freeze / unfreeze relative time |
| `r` | Restart the harness (scenario 1, live clock, no deletions/popups) |
| `s` | Status popup (app key) |
| `h` / `?` | Help popup (app key) |
| `l` | Load older (app key, scenario 7) |
| `Esc` | Close popups |

## Scenarios

| Key | Scenario | Covers |
| --- | --- | --- |
| `1` | overview | forever-loading, blocked and stalled cards above a mixed feed |
| `2` | waiting states | running, blocked and stalled cards |
| `3` | waiting edge cases | missing task, missing host, unknown agent |
| `4` | notification cards | tags, truncation, empty bodies, long pwd |
| `5` | e2e / locked rows | undecryptable envelopes and the e2e status popup |
| `6` | empty / offline | empty feed and disconnected status popup |
| `7` | many / pagination | 30 cards, `l` loading state, `hasMore` footer |

## Write-back

The harness imports `../AppView` and the app's components directly. There is no
seam and no copied component. When the design changes, change the app file; the
prototype follows.
