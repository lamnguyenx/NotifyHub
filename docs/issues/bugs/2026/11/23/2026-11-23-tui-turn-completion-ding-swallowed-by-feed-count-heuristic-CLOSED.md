# TUI turn-completion ding swallowed by the feed-count heuristic — CLOSED

**Date**: 2026-11-23
**Status**: ✅ FIXED (uncommitted at time of writing)
**Fix**: ding on the live SSE `notification` event with a synchronous id-set dedupe, instead of inferring "new arrival" from feed-array shape changes
**Where**: `src/notifyhub/tui/src/hooks/useNotifications.ts` (decision + dedupe), `src/notifyhub/tui/src/hooks/useAudio.ts` (asset path + debug trail), `src/notifyhub/tui/src/components/NotificationStream.tsx` (sound logic removed), `src/notifyhub/tui/src/__tests__/SoundTrigger.test.tsx` (new)

## Symptom

Reported on the Mac running `make tui` against the backend on `ssh wsk`
(`wsk.tail723755.ts.net:9080`, reached over Tailscale):

- `noti hello` (manual push) → notification card lands **with** the Submarine ding.
- An opencode/claude/codex turn completes → the notification card lands, the
  docked waiting card resolves, the card tops the feed — **silently**.

The reporter suspected the wsl/wsk backend ("no sound in the backend on ssh wsk"),
since manual pushes through the same backend were audible.

## Investigation trail

Every step below was verified against the live system, not just by reading code.

1. **Delivery was never the problem.** `lsof` showed the TUI process
   (`bun.exe` PID 30984, started 08:53) connected to `100.93.178.57:9080` —
   wsk's Tailscale address; its env had `NOTIFYHUB_CLI_HOST=wsk.tail723755.ts.net`.
   The wsk backend answered `/api/notifications/count` = 44 with e2e on
   (`kid=39163466`, same key as the Mac's `config.jsonl`).
2. **Both notification classes land in the same store.** Decrypting the newest
   store items with the shared key showed agent completions
   (`host_model=MS-7E70`, `data.session_id` set) and the manual `hello`
   (`host_model=Mac153`) arriving minutes apart, same backend, same envelope
   format. (The completions actually originate from a third machine, MS-7E70 —
   neither wsk=kientt44 nor jk=jackal.)
3. **The old rule.** `NotificationStream.tsx` decided the ding from array shape:

   ```ts
   // before
   if (prevCountRef.current > 0 && notifications.length > prevCountRef.current) {
     playSound()
   }
   ```

   `notifications` is reshaped by *five* unrelated code paths: SSE `init`
   (reconnect → wholesale replace), live `notification` (prepend, the only true
   arrival), `delete`/`clear` (shrink), and `loadMore` (append an older page at
   the bottom). A count delta cannot distinguish them.
4. **First causality test** (`SoundTrigger.test.tsx`, `useAudio` mocked, driving
   the real `AppView` through the exact state sequences `useNotifications`
   produces): completions that also resolve a waiting card *did* call `play()`.
   So the waiting-card resolve path was innocent — the heuristic itself was the
   suspect.
5. **Live instrumented repro.** Added an env-gated `soundDebug()` trail
   (`NOTIFYHUB_TUI_SOUND_DEBUG=1`, optional `NOTIFYHUB_TUI_SOUND_LOG=path`)
   across `useAudio` → `useNotifications` → `NotificationStream`, ran a TUI
   under `script` (pty) against wsk, and posted controlled events via curl:
   plain control ding ✓, sequence `POST /api/status/opencode/running` →
   completion notification with `session_id` → resolve+ding ✓. No audio engine
   errors. The whole chain works **when the old rule's precondition holds**.
6. **The false ding that cracked it.** The same log captured:

   ```
   stream: feed 31 → 46 (play)     ← lazy-load appended an older page (30→45+1)
   play: soundId=1 voice=2
   ```

   Scrolling to load history *rings the bell*. Proof that shape deltas are the
   wrong signal — and the mirror-image hole is the reported one.

## Root cause

Two holes in the count heuristic, opposite directions:

- **False negative (the report):** `prevCountRef.current > 0` mutes the first
  arrival into an empty feed. Completions land precisely when the feed tends to
  be empty — the reporter reads and deletes cards, and the wsk backend
  restarted at 09:18 that morning (in-memory store wiped) while the TUI had
  been running since 08:53, so `init` on reconnect re-based the feed near-empty.
  A manual `noti` typed while older cards still sit in the feed dings, which is
  exactly the observed asymmetry.
- **False positive (found during the hunt):** `loadMore` grows the array
  bottom-up; the count rule reads that growth as an arrival and dings.

Also relevant: the old code deduped *inside* the `setNotifications` updater,
where the play decision could never see it — dedupe and ding were in different
layers.

## Fix

Move the ding to **the event that means arrival** — the SSE `notification`
handler in `useNotifications.ts` — and dedupe with a synchronous ref so the
decision is possible in the same tick:

```ts
const feedIdsRef = useRef<Set<string>>(new Set())   // maintained on every feed change

const isNew = !feedIdsRef.current.has(decrypted.id)
if (isNew) feedIdsRef.current.add(decrypted.id)
if (isNew) setNotifications((prev) => [decrypted, ...prev])
if (isNew) playSound()                              // arrival ⇒ ding, whatever the feed looks like
```

`feedIdsRef` is updated beside every feed mutation: `init` (rebuild),
`delete`/`clear` (remove/reset), `loadMore` (add page), `handleDelete`
(remove). Consequences:

- arrival into an **empty** feed dings (the reported case),
- `init`/heartbeat/reconnect resync never dings,
- lazy-loaded history never dings,
- duplicate SSE delivery (server resend after a reconnect race) never dings and
  never double-prepends.

`NotificationStream.tsx` is back to purely presentational (all sound logic
removed); `useAudio.ts` now owns the asset path and additionally:

- exposes `soundDebug()` (no-op unless `NOTIFYHUB_TUI_SOUND_DEBUG` is set; logs
  to `NOTIFYHUB_TUI_SOUND_LOG` or stderr) — the diagnostic used to find this
  bug, kept for next time,
- attaches an `error` listener to the `Audio` engine (previously failures were
  `emit`-ed into the void; `.catch(() => {})` swallowed the rest),
- logs the returned `voice` id per play, so "decision made but inaudible"
  (device/route problems) is distinguishable from "decision never made".

## Trials and errors

- **Suspect: waiting-card resolve racing the feed update.** Disproved by the
  first causality test — resolve+prepend plays fine under the old rule when the
  feed is non-empty. (Still worth having ruled out: the resolve path is the one
  code difference between the two notification classes.)
- **Suspect: e2e locked rows / decrypt failures.** Disproved by decrypting the
  store — completions carry the same envelope shape and the TUI's key matches
  (`kid=39163466` on both sides).
- **Suspect: a second backend / wrong host.** Disproved by `lsof` + env of the
  running TUI; also explained why the manual `noti` works — Mac `.bashrc`
  exports `NOTIFYHUB_CLI_HOST=wsk.tail723755.ts.net`, the same instance.
- **Intermediate attempt: head-based heuristic.** "Ding iff the head id changed
  and the previous head is still present." Fixes the false positive (appends
  keep the head) and delete-silence, and passed all tests + a live v2 run — but
  still cannot make an empty feed ding (no previous head to anchor on), i.e.
  the reported symptom needed an empty-feed exception anyway. Abandoned for the
  event-based rule, which needs no exceptions at all.
- **First event-based draft** set a `let isNew = false` flag *inside* the
  `setNotifications` updater and read it after — updater runs during render,
  not synchronously, so the flag is unreliable by construction. Replaced with
  `feedIdsRef`.

## Tests

`src/notifyhub/tui/src/__tests__/SoundTrigger.test.tsx` (new, 6 cases) mounts
`useNotifications` with mocked SSE + audio and pins:

1. live arrival into an empty feed dings (the reported case),
2. `init` history page is silent,
3. a completion that resolves its waiting card dings exactly once **and** drops
   the docked card,
4. duplicate SSE delivery of the same id is silent and does not double-prepend,
5. `delete`/`clear` events are silent,
6. an arrival after local deletions emptied the feed still dings.

Full suite: 168 pass / 0 fail; `tsc --noEmit` clean.

## Live verification

Twice against the production wsk backend with an instrumented TUI under a pty,
posting controlled events over HTTP (final run):

```
sse: agent_status opencode ses_sounddbg_v3 → running
sse: notification id=…2fd35019
notify: id=…2fd35019 locked=false sid=ses_sounddbg_v3 new resolve-waiting
play: soundId=1 voice=1
sse: notification id=…8894017a
notify: id=…8894017a locked=false sid=- new
play: soundId=1 voice=1
```

(Completion resolves + dings; plain control dings; `init` and history loads
silent. Test cards deleted and synthetic sessions idled afterwards.)

## Operator notes

- Restart long-lived TUIs to pick this up — the process from 08:53 was running
  pre-fix code, which also made live symptom-checks misleading.
- Debugging the sound path next time:
  `NOTIFYHUB_TUI_SOUND_DEBUG=1 NOTIFYHUB_TUI_SOUND_LOG=/tmp/sound.log make tui`
  shows every SSE event, the new/duplicate decision, and the audio voice or
  engine error.
- The backend was never at fault; no server-side change.
