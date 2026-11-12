# Installer script: picker, tar-over-ssh transport, remote installation

**Date**: 2026-11-12
**Status**: Implemented in the working tree.
**Parent**: [SSH rollout](2026-11-12-install-plugin-ssh.md)

## Module and changes

`local/install-plugin-ssh.ts` (run by the `make install-plugin-ssh` target, bun) is the
remote counterpart of `make install-plugin`, modeled on `vscode-hacker-meta`'s
`scripts/install-ssh.ts` (read over `ssh nuc`, `/home/lamnt45/git/vscode-hacker-meta`):

- Interactive multi-selects driven from raw stdin (space toggles, `a` all, `j`/`k`/arrows
  move, `g`/`G` jump, enter confirms, `q`/Ctrl-C cancels): integrations first —
  `opencode`/`claude`/`codex`, all preselected — then hosts with `user@hostname:port`
  hints, none preselected. Raw mode and the cursor are restored on cancel and on SIGINT/
  SIGTERM.
- Staging (`stageTargets`) copies the selected targets' sources into a throwaway
  `opencode/…, claude/…, codex/…` tree, renaming `cli.py` → `notifyhub-push.py`, so one
  plain `tar -czf - .` ships everything regardless of repo layout.
- One ssh connection per host (`ClearAllForwardings=yes` so `LocalForward`/`RemoteForward`
  rules neither bind ports nor print collisions, `BatchMode`, `ConnectTimeout=15`,
  `StrictHostKeyChecking=accept-new`), the staged tar piped into the remote script's stdin.
- Pool of hosts (default 4 jobs, `-j N`), 120 s per-host timeout, per-host colored
  `[alias]` line tags, and a final per-host ✔/✖ summary with timings; a failing host does
  not stop the others and the run exits non-zero.
- The remote script (POSIX sh) extracts to a `mktemp -d`, `__archived__/`-moves any file
  it replaces (bach_lite's convention, remote re-implemented in ~5 lines), copies the
  OpenCode pair into `~/.config/opencode/plugin/`, the Claude/Codex hook scripts and their
  installers into the persistent `~/.config/notifyhub/plugin/{claude,codex}/`, `chmod +x`es
  the Claude hook script, then runs each `install.py` *from the persistent dir* so merged
  settings reference absolute paths that outlive the ssh session. It warns (not fails)
  when `python3 -c 'import notifyhub'` fails, since `notifyhub-push.py` needs the package
  on the host.
- Post-success hint prints this machine's LAN address for the hosts' `NOTIFYHUB_CLI_HOST`,
  which remote hooks need to push back here.

The Claude/Codex hook scripts deliberately do not land in the ssh temp dir: settings
entries would then point at a deleted path. `install-plugin`'s "copy" flavor (not the
symlink one) is what this replicates.

## Trials, errors, and lessons learnt

1. **Extraction of the generator's script for sandbox tests.** `sed -n "/String.raw\`…/"`
   cannot match a pattern containing a backtick without breaking shell quoting — switched
   to `awk` ranges anchored on `/String\.raw\`/` and the closing `` /`;$/ ``.
2. **The first sandbox run hung and timed out.** The test used
   `tar -czf - . -C "$stage"`; with the operand before `-C`, `.` resolved in the *current*
   directory and the stream archived the whole repository into a `sh` that would never
   finish reading it. GNU/bsdtar operand-after-options only: `tar -czf - -C "$stage" .`.
   The product code had this right from the start (spawn `cwd: staging`).
3. **macOS bsdtar over ssh.** The remote GNU tar printed a `LIBARCHIVE.xattr.com.apple.provenance`
   warning per file — fixed by probing `tar --no-xattrs -cf /dev/null .` once and adding the
   flag when accepted (bsdtar does not list it in `--help`; a probe is the honest check).
   Extraction then still yielded `._` AppleDouble files — bsdtar embeds them regardless of
   xattr flags; `COPYFILE_DISABLE=1` in the child env suppresses them (harmless for GNU tar).
4. **Testing a raw-mode TUI without a TTY.** `printf '\rq' | script -q /dev/null …` hung:
   a pipe is not a pty and the raw-mode reader never sees keypresses as terminates. An
   `expect` script (`spawn` = real pty) drove the real picker: enter accepted the
   preselected targets, `q` cancelled the host prompt, nothing installed.
5. **Idempotency.** Running the remote script twice left the Claude (5) and Codex (6) hook
   entry counts unchanged — the installers strip-and-merge in place, and Codex's replace-in-
   place variant deliberately preserves entry position (`trust` keys include position).
6. **Never test on the live host state.** `nuc` holds the plugin as symlinks into its own
   clone. Both the sandbox run (re-homed `HOME`) and the real-transport test
   (`HOME=/tmp/nh-ssh-test` injected before `set -eu`, `rm -rf` afterwards) kept the live
   install untouched; the run summary still warns that a real install archives symlinks.
7. `bun` runs the script without a tsconfig; typechecking borrowed the TUI folder's
   toolchain: `cd src/notifyhub/tui && bunx tsc --noEmit --strict … ../../../local/install-plugin-ssh.ts`.

## Validation

- Sandbox `HOME` install ×2: files placed, previous files archived once per run, hook
  entries stable across runs, `settings.json`/`hooks.json` commands pointing at the
  persistent dir.
- Real transport to `nuc` (re-homed): exit 0, exactly the expected eight files, warnings
  gone with `--no-xattrs` + `COPYFILE_DISABLE=1`, temp dir removed.
- `expect`-driven picker: confirm + cancel paths, terminal state restored.
- `tsc --strict` clean.
