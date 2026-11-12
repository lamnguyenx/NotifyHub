# Host selection: from a config glob list to a `# notifyhub` marker in ~/.ssh/config

**Date**: 2026-11-12
**Status**: Implemented in the working tree; the config-list design was reverted.
**Parent**: [SSH rollout](2026-11-12-install-plugin-ssh.md)

## Module and changes

The picker's host universe needed limiting: 48 concrete aliases live in this machine's
`~/.ssh/config`, and the target set is `nuc pp wsk*`. Two designs were built this session;
only the second survives.

### Design 1 (built, tested, reverted): `install.ssh_hosts` in the NotifyHub config

- `NotifyHubInstallConfig` in `src/notifyhub/config.py` with `ssh_hosts: List[str]`
  (default `["*"]`, glob patterns, `!pattern` exclusions) and a comma-splitting validator
  for the `NOTIFYHUB_INSTALL_SSH_HOSTS` env var — the exact shape of
  `plugins.opencode.muted_agents`.
- `example_config.json` gained an `install` block; `config.md` was regenerated; three
  tests (`TestInstallSshHosts`) covered default, file list, and env string.
- The installer script read `~/.config/notifyhub/config.{json,jsonl}` with the OpenCode
  plugin's json5-ish parser (comment and trailing-comma strippers, jsonl line merging),
  env override, then `--dry-run`/`--all`/`-H` all resolved within the filtered set.
- The user then proposed marking hosts *in* `~/.ssh/config` instead — "then we no need
  further xdgg config" — and everything above was reverted (`config.py`,
  `example_config.json`, tests, the live `~/.config/notifyhub/config.jsonl` block, the TS
  config reader). Verify reverts by diff and by re-running the touched suites.

### Design 2 (shipped): a `# notifyhub` marker comment on `Host` lines

```
Host nuc  # notifyhub
Host pp ppe # notifyhub
Host wsk* # notifyhub
```

- `splitComment` now returns both halves of a line (quote-aware, OpenSSH's rule that `#`
  only starts a comment at line start or after whitespace); `HOST_MARKER = /\bnotifyhub\b/i`
  tests the comment side; `parseSshConfig` returns `{ hosts, marked }` where `marked` keeps
  wildcards intact for later expansion against concrete aliases.
- A marker claims every alias on its line; wildcard marked patterns expand to every
  concrete alias they match (`wsk*` covers `wsk` and `wske`); with no markers anywhere
  every host stays eligible — the notation is opt-in. The picker, `all`, and explicit
  `-H` names all resolve within that universe; `--ssh-hosts <list>` overrides for one run.
- Exclusion `!pattern` support was kept from design 1 inside `filterHostsByPatterns`
  (patterns starting with `!` subtract; an all-exclusion list still starts from `*`).
- The live `~/.ssh/config` now marks `pp ppe`, `nuc`, `wsk`, `wske` → universe is 5 of 48;
  `ppe` arrives because it shares `pp`'s line. `ssh -G nuc` still parses (OpenSSH ignores
  the comment), so nothing else changed for plain ssh usage.

## Trials, errors, and lessons learnt

1. **Marker attribution off-by-one.** The first implementation passed the comment flag to
   `flush()` when a *new* `Host` line arrived — so each block got the *next* line's marker
   and the dry run reported `[ppe, 132, hieu, wske…]` (aliases of the lines *after* the
   marked ones). The marker belongs to the block it starts: capture it on the `Host` line,
   use it at the block's closing `flush()`. Stateful line-oriented parsers need their
   state transitions tested against adjacent lines, not single samples.
2. **Template literals cannot contain raw backticks** — the help text quoting
   `` `Host nuc  # notifyhub` `` broke `tsc` with syntax errors pointing at the offending
   column; single-quoted examples fixed it. A dropped closing paren in the same edit round
   produced the follow-on error; typecheck after *each* small edit, not each batch.
3. **Reverting by hand reintroduced a typo** (`NotifyHubE2eConfig` → `NotifyHubE2eConfig`
   mis-cased as `E2eConfig`) — caught by the immediate diff review. After any revert,
   re-run the module's tests and grep the diff for identifiers you "restored".
4. `sed` on `Host nuc` matched two places in the ssh config (pattern aliases repeat);
   edits needed surrounding `HostName`/`User` context to be unique. Edit bounded blocks,
   not bare identifiers, in hand-maintained config.
5. Design 1's validator/env/tests followed `muted_agents` so closely that the revert was
   mechanical — copying an existing pattern end-to-end (including its tests) makes both
   building and un-building cheap. That is the property that saved the pivot.
6. A marker inside the file it annotates beats a parallel list: no drift, no new config
   keys, and `grep '# notifyhub' ~/.ssh/config` is the whole source of truth.

## Validation

- Glob/marker matrix: marked multi-alias line, wildcard expansion next to unmarked
  `pi4`/`vast-1`, `Match` blocks flushing correctly, git-remote aliases skipped,
  quoted aliases, case-insensitive marker, no-marker fallback (all hosts), empty config
  error, `--ssh-hosts '*'` escape hatch, unknown-host error listing only eligible hosts,
  `SSH_CONFIG=<tmpfile>` for fixture runs.
- Live dry run: `hosts marked '# notifyhub' [pp, ppe, nuc, wsk, wske] → 5 of 48`.
- `pytest tests/notifyhub/test_config.py`: 52 passed; 3 failures are pre-existing at HEAD.
- `ssh -G nuc` parses the commented config.
