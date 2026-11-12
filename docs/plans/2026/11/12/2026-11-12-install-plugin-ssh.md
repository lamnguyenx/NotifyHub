# SSH rollout of the coding-agent integrations

**Date**: 2026-11-12
**Status**: Implemented in the working tree; rollout to remote hosts is an operator step.

## Scope and module records

The session added `make install-plugin-ssh`: pick integrations and SSH hosts interactively,
then stream the aggregate `make install-plugin` set to every selected host over one
tar-over-ssh connection each. Host selection was first designed as a NotifyHub config list,
then rewritten (and the config plumbing reverted) to a `# notifyhub` marker comment in
`~/.ssh/config`, where the hosts already live.

| Module | Session record |
|---|---|
| Repository / Makefile | This document |
| Installer script and transport | [Script](2026-11-12-install-plugin-ssh-script.md) |
| Host selection: config list → ssh marker | [Host selection](2026-11-12-install-plugin-ssh-host-selection.md) |
| Config mapping regeneration | [Config markdown](2026-11-12-install-plugin-ssh-config-md.md) |

This repository has no affected submodules: `_submodules/mactoast` was not touched, and the
`.gitmodules` `__submodules__/confstack` path is not initialized in this checkout.

## Result

- `local/install-plugin-ssh.ts` (bun) offers a multi-select of `opencode`/`claude`/`codex`
  (preselected) and of hosts read from `~/.ssh/config`, then installs on each host in
  parallel (four by default) with per-host colored tags, timeouts, and an end summary.
- Per host the remote side archives replaced files `__archived__/`-style (bach_lite's
  convention), copies the OpenCode pair into `~/.config/opencode/plugin/`, places the
  Claude/Codex hook scripts in the persistent `~/.config/notifyhub/plugin/`, and runs that
  host's own `install.py` so settings entries reference paths that outlive the ssh run.
- Only `Host` lines marked `# notifyhub` are offered (`Host wsk* # notifyhub` wildcards
  expand to every matching concrete alias). With no markers at all, every host stays
  eligible. The local `~/.ssh/config` now marks `pp ppe`, `nuc`, `wsk`, `wske`.
- Promptless use: `ARGS="-t opencode -H nuc,pp"`, `--all`, `--dry-run`, `-j N`,
  and `--ssh-hosts "*"` to escape the marker limit for one run.
- `make config-md`, broken before this session, was repaired in passing.

## Trials, errors, and lessons learnt

1. The reference implementation mattered more than the spec. Reading
   `vscode-hacker-meta`'s `scripts/install-ssh.ts` on `nuc` (`ssh nuc`, path in its
   Makefile comment) settled picker UX, ssh flags, and the one-script-per-host tar protocol
   before any code was written here.
2. The first host-limiting design (config `install.ssh_hosts` globs) was fully implemented,
   tested, then reverted when the user proposed marking `~/.ssh/config` itself. Config that
   duplicates information a file already holds — host *aliases in* the ssh config — is
   placement worth questioning before building. The revert cost more than the rewrite.
3. Half the session's bugs were test-harness bugs, not product bugs: a wrong `tar` operand
   order hung the first sandbox run archiving the whole repository; `sed` could not extract
   a template literal delimited by backticks; `script -q /dev/null` cannot drive a raw-mode
   TTY. Budget for the harness, and suspect it first when a verified-correct component
   misbehaves.
4. A multi-file feature touches more than its files: `.PHONY`, README, the operator guide,
   and (via the drive-by `config-md` fix) a generated artifact. Each became its own record
   here; the earlier single-record habit under-documented distribution copies.
5. Live machines are not sandboxes. `nuc` carries the plugin as *symlinks* into its own
   clone; all transport tests ran against a re-homed `HOME` (`/tmp/nh-ssh-test`) and were
   cleaned up, and the summary still warns that a real run archives those symlinks.

## Validation and remaining rollout

- `tsc --strict` (the TUI's toolchain) over the installer script: passed.
- Remote installer executed twice against a sandbox `HOME`: opencode/claude/codex files in
  place, Claude 5 and Codex 6 hook entries unchanged by the re-run (installers replace in
  place), previous files archived with timestamps.
- Full transport over real `ssh` to `nuc` into `/tmp/nh-ssh-test`: exit 0, expected eight
  files, directory removed afterwards.
- Dry-run matrix: marker filtering (`[pp, ppe, nuc, wsk, wske] → 5 of 48`), wildcard
  expansion, `Match` blocks, git-remote skipping, empty config, `--ssh-hosts` override,
  no-marker fallback, unknown-host/unknown-target errors.
- `python -m pytest tests/notifyhub/test_config.py -q`: 52 passed, 3 failed — the failures
  pre-date this session (`notifications_max_count` default drift at HEAD, verified with
  `git stash` before concluding).
- `ssh -G nuc` still parses the marked config.

No real host has received the rollout; run `make install-plugin-ssh` when wanted. Remote
hosts push back through `NOTIFYHUB_CLI_HOST`, which must point at this machine on each
target, and expect `notifyhub-push.py` to need the `notifyhub` package (plus its imports)
installed there. Claude hook scripts need the executable bit; the remote installer sets it.
