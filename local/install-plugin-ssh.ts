#!/usr/bin/env bun
/**
 * `make install-plugin-ssh`: pick SSH hosts from ~/.ssh/config, then stream the
 * plugin files and agent hook installs to every selected host.
 *
 * What lands on a host (the remote counterpart of `make install-plugin`):
 *
 *   opencode  notifyhub-plugin.ts + cli.py (renamed notifyhub-push.py)
 *             -> ~/.config/opencode/plugin/
 *   claude    notifyhub-claude.py + install.py -> ~/.config/notifyhub/plugin/claude/
 *             then `python3 install.py` merges hooks into ~/.claude/settings.json
 *   codex     notifyhub-codex.py + install.py -> ~/.config/notifyhub/plugin/codex/
 *             then `python3 install.py` merges hooks into ~/.codex/hooks.json
 *
 * The claude/codex hook scripts go to a persistent dir (never the ssh temp
 * dir): the merged settings entries reference them by absolute path, and they
 * all spawn notifyhub-push.py (the shared push CLI) from its OpenCode plugin
 * location, so the opencode target is what feeds them.
 *
 * Interactive by default (targets preselected, host picker starts empty).
 * Pass --targets / --hosts (or --all) to run without prompts:
 *
 *   make install-plugin-ssh
 *   make install-plugin-ssh ARGS="-H nuc,pp"
 *   make install-plugin-ssh ARGS="-t opencode -H all"
 *   make install-plugin-ssh ARGS="--all --dry-run"
 *
 * Hosts come from `~/.ssh/config` (`Host` aliases; wildcard-only patterns and
 * git remotes are skipped). A `Host` line whose comment mentions notifyhub —
 * `Host nuc  # notifyhub` — marks it (and, for a wildcard like `Host wsk*
 * # notifyhub`, every concrete alias it matches) as an install target; only
 * marked hosts are offered. With no markers every host stays eligible. Each
 * host gets one tar stream over SSH. SSH runs
 * with `ClearAllForwardings=yes` so a host's `LocalForward` / `RemoteForward`
 * rules neither bind ports nor print collision warnings. A failing host does
 * not stop the others; the run exits non-zero and prints a summary at the end.
 *
 * The remote side pushes back to the NotifyHub server running here, so it may
 * need NOTIFYHUB_CLI_HOST pointing at this machine (hinted after the summary).
 *
 * Counterpart of vscode-hacker-meta's scripts/install-ssh.ts.
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, networkInterfaces, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------- style

const useColor =
  process.env.FORCE_COLOR !== undefined
    ? process.env.FORCE_COLOR !== '0'
    : Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

function paint(code: string, text: string): string {
  return useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
}

const bold = (text: string): string => paint('1', text);
const dim = (text: string): string => paint('2', text);
const red = (text: string): string => paint('31', text);
const green = (text: string): string => paint('32', text);
const yellow = (text: string): string => paint('33', text);
const magenta = (text: string): string => paint('35', text);
const cyan = (text: string): string => paint('36', text);
const blue = (text: string): string => paint('34', text);

// --------------------------------------------------------------------- core

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SSH_CONFIG = process.env.SSH_CONFIG ?? join(homedir(), '.ssh', 'config');
const INSTALL_TIMEOUT_MS = 120_000;

let tarCreateArgsCache: string[] | undefined;

type Agent = 'opencode' | 'claude' | 'codex';

interface Options {
  targets?: string[];
  hosts?: string[];
  sshHosts?: string[];
  all: boolean;
  dryRun: boolean;
  jobs: number;
  help: boolean;
}

interface SourceFile {
  /** Repo-relative source path. */
  file: string;
  /** Name in the tar (defaults to the basename). */
  rename?: string;
}

/** The files each target ships, in install-plugin order. */
const SOURCES: Record<Agent, ReadonlyArray<SourceFile>> = {
  opencode: [
    { file: 'src/notifyhub/plugins/opencode/notifyhub-plugin.ts' },
    { file: 'src/notifyhub/cli/cli.py', rename: 'notifyhub-push.py' },
  ],
  claude: [
    { file: 'src/notifyhub/plugins/claude/notifyhub-claude.py' },
    { file: 'src/notifyhub/plugins/claude/install.py' },
  ],
  codex: [
    { file: 'src/notifyhub/plugins/codex/notifyhub-codex.py' },
    { file: 'src/notifyhub/plugins/codex/install.py' },
  ],
};

const AGENTS = Object.keys(SOURCES) as Agent[];

/** One-line destination description for pickers and the dry-run plan. */
const DESTINATIONS: Record<Agent, string> = {
  opencode: '~/.config/opencode/plugin/',
  claude: '~/.config/notifyhub/plugin/claude/ + ~/.claude/settings.json hooks',
  codex: '~/.config/notifyhub/plugin/codex/ + ~/.codex/hooks.json hooks',
};

interface SshHost {
  alias: string;
  hostname?: string;
  user?: string;
  port?: string;
}

interface HostResult {
  host: SshHost;
  ok: boolean;
  code: number;
  ms: number;
  error?: string;
}

// ---------------------------------------------------------------- args / help

const HELP = `Usage: make install-plugin-ssh [ARGS="..."]

Pick coding-agent targets and SSH hosts interactively, install on each.

Options:
  -t, --targets <list>    comma-separated agents (opencode, claude, codex) or "all"
  -H, --hosts <list>      comma-separated ~/.ssh/config aliases, or "all"
      --ssh-hosts <list>  override the '# notifyhub' marker limit, e.g. "*" or "nuc,pi*"
  -a, --all               every target + every host (within the limit), no prompts
      --dry-run           print the plan and exit
  -j, --jobs <n>          install on n hosts in parallel (default 4)
  -h, --help              show this help

The host universe is the '# notifyhub' marked Host lines in ~/.ssh/config
(e.g. 'Host nuc  # notifyhub'; wildcards like 'Host wsk* # notifyhub' match
every concrete alias), so the picker and "all" only ever offer those hosts.
No markers → every host. --ssh-hosts overrides for a one-off run.

Examples:
  make install-plugin-ssh
  make install-plugin-ssh ARGS="-H nuc,pp"
  make install-plugin-ssh ARGS="-t opencode,claude -H all"
  make install-plugin-ssh ARGS="--all --dry-run"
  make install-plugin-ssh ARGS='--ssh-hosts "*" -H pi4'`;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function parseArgs(argv: string[]): Options {
  const options: Options = { all: false, dryRun: false, jobs: 4, help: false };

  const take = (index: number, inline: string | undefined, flag: string): [string, number] => {
    if (inline !== undefined) return [inline, index];
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('-')) {
      throw new Error(`${flag} needs a value`);
    }
    return [next, index + 1];
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const equals = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const flag = equals > 0 ? arg.slice(0, equals) : arg;
    const inline = equals > 0 ? arg.slice(equals + 1) : undefined;

    switch (flag) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-a':
      case '--all':
        options.all = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-t':
      case '--targets': {
        const [value, next] = take(index, inline, flag);
        options.targets = [...(options.targets ?? []), ...splitList(value)];
        index = next;
        break;
      }
      case '-H':
      case '--hosts': {
        const [value, next] = take(index, inline, flag);
        options.hosts = [...(options.hosts ?? []), ...splitList(value)];
        index = next;
        break;
      }
      case '--ssh-hosts': {
        const [value, next] = take(index, inline, flag);
        options.sshHosts = [...(options.sshHosts ?? []), ...splitList(value)];
        index = next;
        break;
      }
      case '-j':
      case '--jobs': {
        const [value, next] = take(index, inline, flag);
        const jobs = Number.parseInt(value, 10);
        if (!Number.isFinite(jobs) || jobs < 1) throw new Error(`--jobs needs a positive integer (got ${value})`);
        options.jobs = jobs;
        index = next;
        break;
      }
      default:
        throw new Error(`unknown option: ${arg} (try --help)`);
    }
  }
  return options;
}

function chooseTargets(wanted: string[]): Agent[] {
  if (wanted.length === 0) throw new Error('--targets is empty');
  if (wanted.includes('all')) return AGENTS;

  const picked: Agent[] = [];
  for (const raw of wanted) {
    const needle = raw.toLowerCase();
    const matches = AGENTS.filter((agent) => agent === needle);
    if (matches.length === 0) {
      throw new Error(`unknown target: ${raw}\nknown: ${AGENTS.join(', ')}`);
    }
    for (const agent of matches) {
      if (!picked.includes(agent)) picked.push(agent);
    }
  }
  return picked;
}

// ------------------------------------------------------------------ discovery

/**
 * The missing pieces each selected target needs from the repo (checked before
 * any prompt so a stale checkout fails fast).
 */
function checkSources(targets: Agent[]): void {
  const missing: string[] = [];
  for (const agent of targets) {
    for (const source of SOURCES[agent] ?? []) {
      if (!existsSync(join(ROOT, source.file))) missing.push(source.file);
    }
  }
  if (missing.length > 0) {
    throw new Error(`missing source files (git pull?):\n  ${missing.join('\n  ')}`);
  }
}

const GIT_HOSTS = new Set(['github.com', 'ssh.github.com', 'gitlab.com', 'bitbucket.org']);

/**
 * Split a trailing `# comment` off (respecting double quotes). OpenSSH ignores
 * everything from an unquoted `#`, so the host parser only wants the body —
 * but the marker check wants the comment side.
 */
function splitComment(line: string): [string, string] {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === '#' && !quoted && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return [line.slice(0, index), line.slice(index + 1)];
    }
  }
  return [line, ''];
}

/**
 * The "close-friend" notation: a `Host` line whose comment mentions notifyhub,
 *
 *   Host nuc  # notifyhub
 *   Host wsk* # notifyhub
 *
 * marks every alias on that line (and, for a wildcard pattern, every concrete
 * alias it matches) as an install target.
 */
const HOST_MARKER = /\bnotifyhub\b/i;

interface ParsedSshConfig {
  /** Concrete `Host` aliases usable as install targets. */
  hosts: SshHost[];
  /** The raw patterns of every marked `Host` line (aliases and wildcards). */
  marked: string[];
}

/**
 * The concrete `Host` aliases in an OpenSSH config. Patterns with wildcards or
 * negations are skipped as entries, as are the common git remotes; aliases
 * repeated in a later `Host` line are kept with the first definition's
 * properties. Marked lines are collected separately (wildcards intact) so the
 * caller can expand them against the concrete aliases.
 */
function parseSshConfig(path: string): ParsedSshConfig {
  if (!existsSync(path)) throw new Error(`no SSH config at ${path}`);

  const hosts: SshHost[] = [];
  const marked: string[] = [];
  let patterns: string[] = [];
  let markedBlock = false;
  let props: Omit<SshHost, 'alias'> = {};

  const flush = (): void => {
    for (const pattern of patterns) {
      if (markedBlock && pattern !== '' && !marked.includes(pattern)) marked.push(pattern);
      if (pattern === '' || /[*?!]/.test(pattern) || GIT_HOSTS.has(pattern)) continue;
      if (hosts.some((host) => host.alias === pattern)) continue;
      hosts.push({ alias: pattern, ...props });
    }
    patterns = [];
    markedBlock = false;
    props = {};
  };

  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const [body, comment] = splitComment(raw);
    const line = body.trim();
    if (line === '') continue;

    const match = /^(\S+)\s+(.*)$/.exec(line);
    if (match === null) continue;
    const key = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();

    if (key === 'host') {
      flush();
      patterns = value.split(/\s+/);
      // The marker belongs to this block: remember it until the block closes.
      markedBlock = HOST_MARKER.test(comment);
    } else if (key === 'match') {
      flush();
    } else if (patterns.length > 0) {
      if (key === 'hostname') props.hostname = value;
      else if (key === 'user') props.user = value;
      else if (key === 'port') props.port = value;
    }
  }

  flush();
  return { hosts, marked };
}

function chooseHosts(all: SshHost[], wanted: string[]): SshHost[] {
  if (wanted.length === 0) throw new Error('--hosts is empty');
  if (wanted.includes('all')) return all;

  const picked: SshHost[] = [];
  for (const raw of wanted) {
    const host = all.find((candidate) => candidate.alias === raw);
    if (host === undefined) {
      throw new Error(`unknown host: ${raw}\nknown: ${all.map((candidate) => candidate.alias).join(', ')}`);
    }
    if (!picked.includes(host)) picked.push(host);
  }
  return picked;
}

// ------------------------------------------------------------ host limit

/**
 * The universe of selectable hosts: `--ssh-hosts` when given, otherwise every
 * pattern marked `# notifyhub` in the ssh config, otherwise every host.
 */
function hostPatterns(override: string[] | undefined, marked: string[]): string[] {
  if (override !== undefined) return override.length > 0 ? override : ['*'];
  return marked.length > 0 ? marked : ['*'];
}


/** `nuc`, `wsk*`, `pi?` → anchored regex. Only these wildcards are honored. */
function globToRegExp(glob: string): RegExp {
  let source = '';
  for (const ch of glob) {
    if (ch === '*') source += '.*';
    else if (ch === '?') source += '.';
    else source += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

/**
 * Keep hosts matching any pattern, minus any `!pattern` exclusion. Exclusions
 * imply the patterns are meant to narrow "all", so a list of only exclusions
 * still starts from `*`. Bare `*` keeps everything (the no-marker default).
 */
function filterHostsByPatterns(hosts: SshHost[], patterns: string[]): SshHost[] {
  if (patterns.length === 0 || (patterns.length === 1 && patterns[0] === '*')) return hosts;

  const positive = patterns.filter((pattern) => !pattern.startsWith('!')).map(globToRegExp);
  const negative = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => globToRegExp(pattern.slice(1)));
  const includes = positive.length > 0 ? positive : [globToRegExp('*')];

  return hosts.filter(
    (host) => includes.some((re) => re.test(host.alias)) && !negative.some((re) => re.test(host.alias)),
  );
}

// ------------------------------------------------------------------- terminal

interface Choice {
  value: string;
  label: string;
  hint?: string;
  selected?: boolean;
}

function tokenizeKeys(chunk: string): string[] {
  return chunk.match(/\u001b\[[0-9;]*[A-Za-z]|\u001bO[A-Za-z]|[\s\S]/g) ?? [];
}

function visibleLength(text: string): number {
  return text.replace(/\u001b\[[0-9;]*m/g, '').length;
}

function fitPlain(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

/**
 * A checkbox list driven from raw stdin: space toggles, `a` toggles all,
 * `j`/`k` or the arrows move, enter confirms, `q`/Ctrl-C cancels.
 * Returns the selected values, or null when cancelled.
 */
async function multiSelect(question: string, choices: Choice[]): Promise<string[] | null> {
  const stdin = process.stdin;
  const out = process.stdout;
  const selected = new Set(choices.filter((choice) => choice.selected).map((choice) => choice.value));
  const width = Math.max(40, Math.min((out.columns || 100) - 2, 140));
  let cursor = 0;
  let drawn = 0;
  let notice = '';

  const renderChoice = (choice: Choice, index: number): string => {
    const active = index === cursor;
    const pointer = active ? cyan('❯') : ' ';
    const box = selected.has(choice.value) ? green('◉') : dim('◯');
    const room = width - 4;
    const labelText = fitPlain(choice.label, room);
    const hintText =
      choice.hint === undefined
        ? ''
        : fitPlain(`  ${choice.hint}`, Math.max(0, room - visibleLength(labelText)));
    const painted = active ? bold(labelText) : labelText;
    return `${pointer} ${box} ${painted}${dim(hintText)}`;
  };

  const render = (): void => {
    if (drawn > 0) out.write(`\u001b[${drawn}A`);
    out.write('\u001b[0J');
    const footer =
      notice !== ''
        ? red(notice)
        : dim(`${selected.size} selected · space toggle · a all · enter confirm · q quit`);
    const lines = [`${cyan('?')} ${bold(question)}`, ...choices.map(renderChoice), footer];
    out.write(`${lines.join('\n')}\n`);
    drawn = lines.length;
  };

  return new Promise((resolvePromise) => {
    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      out.write('\u001b[?25h');
    };

    const finish = (value: string[] | null): void => {
      cleanup();
      if (drawn > 0) out.write(`\u001b[${drawn}A`);
      out.write('\u001b[0J');
      drawn = 0;
      if (value === null) {
        out.write(`${red('✖')} ${question} ${dim('cancelled')}\n`);
      } else {
        const summary = value
          .map((selectedValue) => choices.find((choice) => choice.value === selectedValue)?.label ?? selectedValue)
          .join(', ');
        const room = Math.max(20, width - question.length - 4);
        out.write(`${green('✔')} ${question} ${dim(fitPlain(summary, room))}\n`);
      }
      resolvePromise(value);
    };

    const onData = (data: Buffer | string): void => {
      for (const sequence of tokenizeKeys(data.toString())) {
        if (sequence === '\u0003' || sequence === 'q') {
          finish(null);
          return;
        }
        switch (sequence) {
          case ' ':
            if (selected.has(choices[cursor]?.value ?? '')) selected.delete(choices[cursor]?.value ?? '');
            else selected.add(choices[cursor]?.value ?? '');
            notice = '';
            break;
          case 'a': {
            const allSelected = selected.size === choices.length;
            selected.clear();
            if (!allSelected) for (const choice of choices) selected.add(choice.value);
            notice = '';
            break;
          }
          case 'j':
          case '\u001b[B':
          case '\u001bOB':
            cursor = Math.min(choices.length - 1, cursor + 1);
            break;
          case 'k':
          case '\u001b[A':
          case '\u001bOA':
            cursor = Math.max(0, cursor - 1);
            break;
          case 'g':
            cursor = 0;
            break;
          case 'G':
            cursor = choices.length - 1;
            break;
          case '\r':
          case '\n':
            if (selected.size === 0) {
              notice = 'select at least one item (space)';
            } else {
              finish(choices.filter((choice) => selected.has(choice.value)).map((choice) => choice.value));
              return;
            }
            break;
          default:
            break;
        }
      }
      render();
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    out.write('\u001b[?25l');
    render();
  });
}

// ----------------------------------------------------------------- installing

/**
 * One POSIX-sh script per host. Its stdin is a gzipped tar of the selected
 * targets' files (staged as opencode/…, claude/…, codex/…); it archives any
 * previous install bach_lite-style, copies into the persistent destinations,
 * and runs the claude/codex installers from the persistent dir so the hook
 * entries written into settings reference paths that outlive this ssh run.
 */
function remoteInstallScript(targets: Agent[]): string {
  // String.raw keeps quoting intact for embedding in the ssh command line.
  return String.raw`set -eu
TARGETS="${targets.join(' ')}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
tar -xzf - -C "$tmp" || { echo "could not extract plugin stream" >&2; exit 4; }

has() { case " $TARGETS " in *" $1 "*) ;; *) return 1 ;; esac; }

timeslug() { date '+%Y.%m.%d__%Hh%Mm%Ss' 2>/dev/null || date '+%Y.%m.%dT%H%M%S'; }

# Mirror of local bach_lite.sh archive: move an existing install aside instead
# of clobbering it, so a bad push can be rolled back by hand.
archive() {
  src=$1
  [ -e "$src" ] || return 0
  dst="$(dirname "$src")/__archived__/$(timeslug)---$(basename "$src")"
  mkdir -p "$(dirname "$dst")"
  mv "$src" "$dst" && echo "archived $(basename "$src")"
}

status=0

if has opencode; then
  dest="$HOME/.config/opencode/plugin"
  mkdir -p "$dest"
  for f in notifyhub-plugin.ts notifyhub-push.py; do
    if [ ! -f "$tmp/opencode/$f" ]; then echo "missing $f in stream" >&2; status=1; continue; fi
    archive "$dest/$f"
    cp "$tmp/opencode/$f" "$dest/$f"
    echo "copied $f -> $dest"
  done
fi

if has claude; then
  dest="$HOME/.config/notifyhub/plugin/claude"
  mkdir -p "$dest"
  for f in notifyhub-claude.py install.py; do
    if [ ! -f "$tmp/claude/$f" ]; then echo "missing $f in stream" >&2; status=1; continue; fi
    archive "$dest/$f"
    cp "$tmp/claude/$f" "$dest/$f"
  done
  # Claude Code runs the hook script directly (the settings entry is the bare
  # path), so the executable bit matters; install.py warns when it is missing.
  chmod +x "$dest/notifyhub-claude.py" 2>/dev/null || true
  echo "copied hook script -> $dest"
  if command -v python3 >/dev/null 2>&1; then
    python3 "$dest/install.py" || status=1
  else
    echo "python3 not found: cannot merge Claude Code hooks" >&2
    status=1
  fi
fi

if has codex; then
  dest="$HOME/.config/notifyhub/plugin/codex"
  mkdir -p "$dest"
  for f in notifyhub-codex.py install.py; do
    if [ ! -f "$tmp/codex/$f" ]; then echo "missing $f in stream" >&2; status=1; continue; fi
    archive "$dest/$f"
    cp "$tmp/codex/$f" "$dest/$f"
  done
  echo "copied hook script -> $dest"
  if command -v python3 >/dev/null 2>&1; then
    python3 "$dest/install.py" || status=1
  else
    echo "python3 not found: cannot merge Codex hooks" >&2
    status=1
  fi
fi

# notifyhub-push.py imports the notifyhub package (plus pydantic/requests/tap/
# confstack). Warn instead of failing: hooks install fine either way, the push
# path is what breaks until the package exists on this host.
if command -v python3 >/dev/null 2>&1; then
  if ! python3 -c 'import notifyhub' >/dev/null 2>&1; then
    echo "note: python3 cannot import notifyhub; notifyhub-push.py will fail until the package is installed here" >&2
  fi
fi

exit $status`;
}

/**
 * Stage the selected targets' files into a tar-shaped tree (opencode/…,
 * claude/…, codex/…), so one plain `tar -czf - .` ships everything regardless
 * of source layout (e.g. cli.py installing as notifyhub-push.py).
 */
function stageTargets(targets: Agent[]): string {
  const staging = mkdtempSync(join(tmpdir(), 'notifyhub-plugin-'));
  for (const agent of targets) {
    const dir = join(staging, agent);
    mkdirSync(dir, { recursive: true });
    for (const source of SOURCES[agent] ?? []) {
      copyFileSync(join(ROOT, source.file), join(dir, source.rename ?? basename(source.file)));
    }
  }
  return staging;
}

function streamLines(stream: Readable, onLine: (line: string) => void): void {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      onLine(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  });
  stream.on('end', () => {
    if (buffer !== '') onLine(buffer);
  });
}

/**
 * tar create args, preferring `--no-xattrs` when supported: macOS bsdtar would
 * otherwise attach `LIBARCHIVE.xattr.*` headers that every GNU tar on the
 * remote side complains about. Probed once by running it (bsdtar does not
 * list the flag in --help).
 */
function tarCreateArgs(): string[] {
  if (tarCreateArgsCache === undefined) {
    const probe = spawnSync('tar', ['--no-xattrs', '-cf', '/dev/null', '.'], {
      cwd: tmpdir(),
      stdio: 'ignore',
    });
    tarCreateArgsCache = probe.status === 0 ? ['--no-xattrs', '-czf', '-', '.'] : ['-czf', '-', '.'];
  }
  return tarCreateArgsCache;
}

function installOnHost(
  host: SshHost,
  targets: Agent[],
  staging: string,
  tag: (alias: string) => string,
): Promise<HostResult> {
  const script = remoteInstallScript(targets);

  return new Promise((resolvePromise) => {
    const started = Date.now();
    const ssh = spawn(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=15',
        '-o',
        'ClearAllForwardings=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        host.alias,
        script,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    // COPYFILE_DISABLE keeps macOS bsdtar from embedding `._` AppleDouble
    // metadata entries (the remote script ignores them, but a clean stream is
    // easier to read when debugging). Ignored by GNU tar.
    const tar = spawn('tar', tarCreateArgs(), {
      cwd: staging,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });

    let error: string | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ssh.kill('SIGTERM');
    }, INSTALL_TIMEOUT_MS);

    tar.stdout.pipe(ssh.stdin);
    tar.on('error', (cause) => {
      error = cause.message;
    });
    tar.stderr.on('data', (chunk: Buffer) => {
      error = chunk.toString().trim();
    });
    ssh.on('error', (cause) => {
      error = cause.message;
    });
    streamLines(ssh.stdout, (line) => console.log(`${tag(host.alias)} ${line}`));
    streamLines(ssh.stderr, (line) => console.log(`${tag(host.alias)} ${dim(line)}`));

    ssh.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) error = `timed out after ${INSTALL_TIMEOUT_MS / 1000}s`;
      resolvePromise({
        host,
        ok: code === 0 && !timedOut,
        code: code ?? 1,
        ms: Date.now() - started,
        error,
      });
    });
  });
}

const HOST_COLORS = [cyan, magenta, yellow, green, blue];

function hostTagger(hosts: SshHost[]): (alias: string) => string {
  const width = Math.max(...hosts.map((host) => host.alias.length));
  const colors = new Map(hosts.map((host, index) => [host.alias, HOST_COLORS[index % HOST_COLORS.length] ?? cyan]));
  return (alias: string) => (colors.get(alias) ?? cyan)(`[${alias.padEnd(width)}]`);
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index] as T);
    }
  });

  await Promise.all(runners);
  return results;
}

/** Best-effort LAN address for the post-install NOTIFYHUB_CLI_HOST hint. */
function lanAddress(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return undefined;
}

// ----------------------------------------------------------------------- main

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return 0;
  }

  const parsed = parseSshConfig(SSH_CONFIG);
  if (parsed.hosts.length === 0) throw new Error(`no usable Host entries in ${SSH_CONFIG}`);

  // The `# notifyhub` markers define the selectable universe: the picker,
  // "all", and explicit -H names all resolve within it. No markers → every
  // host stays eligible (the marker is opt-in).
  const patterns = hostPatterns(options.sshHosts, parsed.marked);
  const allHosts = filterHostsByPatterns(parsed.hosts, patterns);
  if (allHosts.length === 0) {
    throw new Error(
      `[${patterns.join(', ')}] matched no host in ${SSH_CONFIG}` +
        `\nsee every host with: make install-plugin-ssh ARGS='--ssh-hosts "*" --dry-run'`,
    );
  }
  if (allHosts.length < parsed.hosts.length) {
    console.log(
      dim(`hosts marked '# notifyhub' [${patterns.join(', ')}] → ${allHosts.length} of ${parsed.hosts.length}`),
    );
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let targets: Agent[];
  let hosts: SshHost[];

  if (options.all) {
    targets = AGENTS;
    hosts = allHosts;
  } else {
    if (options.targets !== undefined) {
      targets = chooseTargets(options.targets);
    } else if (interactive) {
      const picked = await multiSelect(
        'Integrations to install',
        AGENTS.map((agent) => ({
          value: agent,
          label: agent,
          hint: DESTINATIONS[agent],
          selected: true,
        })),
      );
      if (picked === null) return 130;
      targets = AGENTS.filter((agent) => picked.includes(agent));
    } else {
      throw new Error('no TTY for prompts: pass --targets (or --all)');
    }

    if (options.hosts !== undefined) {
      hosts = chooseHosts(allHosts, options.hosts);
    } else if (interactive) {
      const picked = await multiSelect(
        'SSH hosts to install on',
        allHosts.map((host) => ({
          value: host.alias,
          label: host.alias,
          hint: `${host.user === undefined ? '' : `${host.user}@`}${host.hostname ?? host.alias}${
            host.port === undefined ? '' : `:${host.port}`
          }`,
          selected: false,
        })),
      );
      if (picked === null) return 130;
      hosts = allHosts.filter((host) => picked.includes(host.alias));
    } else {
      throw new Error('no TTY for prompts: pass --hosts (or --all)');
    }
  }

  if (targets.length === 0) throw new Error('no integrations selected');
  if (hosts.length === 0) throw new Error('no hosts selected');
  checkSources(targets);

  if (options.dryRun) {
    console.log(`${bold('plan')} ${dim(`${targets.length} integration(s) → ${hosts.length} host(s)`)}`);
    for (const agent of targets) {
      console.log(`  ${cyan(agent.padEnd(10))} ${dim(DESTINATIONS[agent])}`);
      for (const source of SOURCES[agent] ?? []) {
        console.log(`    ${dim(source.file)}${source.rename === undefined ? '' : bold(` as ${source.rename}`)}`);
      }
    }
    console.log(`  ${bold('hosts')} ${hosts.map((host) => host.alias).join(', ')}`);
    if (allHosts.length < parsed.hosts.length) {
      console.log(dim(`  (within '# notifyhub' markers [${patterns.join(', ')}])`));
    }
    console.log(dim('\ndry run: nothing installed'));
    return 0;
  }

  const staging = stageTargets(targets);
  console.log(
    `\n${bold('install')} ${targets.join(', ')} on ${hosts.length} host(s) ${dim(`· ${options.jobs} job(s)`)}`,
  );

  const tag = hostTagger(hosts);
  let results: HostResult[];
  try {
    results = await pool(hosts, options.jobs, (host) => installOnHost(host, targets, staging, tag));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  console.log(`\n${bold('summary')}`);
  for (const result of results) {
    const took = dim(`${(result.ms / 1000).toFixed(1)}s`);
    if (result.ok) {
      console.log(`  ${green('✔')} ${result.host.alias.padEnd(12)} ${took}  ${targets.join(', ')}`);
    } else {
      console.log(`  ${red('✖')} ${result.host.alias.padEnd(12)} ${took}  exit ${result.code}`);
      if (result.error !== undefined) console.log(dim(`    ${result.error}`));
    }
  }

  const failedHosts = results.filter((result) => !result.ok);
  if (failedHosts.length > 0) {
    console.error(red(`\n${failedHosts.length} host(s) failed`));
    return 1;
  }

  const address = lanAddress();
  console.log(
    dim(
      `\nRemote hooks push to NotifyHub via NOTIFYHUB_CLI_HOST (default 127.0.0.1:9080). Point it at this machine on the hosts above, e.g. in ~/.config/notifyhub/config.json:${address === undefined ? '' : `\n  {"cli": {"host": "${address}", "port": 9080}}`}`,
    ),
  );
  console.log(dim('Restart remote Claude/OpenCode sessions and re-trust Codex hooks via /hooks.'));
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });

/** Never leave the terminal in raw mode / with a hidden cursor on a signal. */
function restoreTerminal(): void {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    // The terminal may already be gone.
  }
  process.stdout.write('\u001b[?25h');
}

process.once('SIGINT', () => {
  restoreTerminal();
  process.exit(130);
});
process.once('SIGTERM', () => {
  restoreTerminal();
  process.exit(130);
});
