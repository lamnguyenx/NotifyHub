import type { AgentState, AgentStatusEntry, EncryptedEnvelope } from '../types';

/** Palette shared with the TUI (and the old web avatar colours). */
export const AVATAR_COLORS = [
  '#7B1FA2', '#77919D', '#00ACC1', '#EC417A', '#C1175C',
  '#5D6AC0', '#0388D2', '#1E88E5', '#00BCD4', '#26A69A',
  '#43A047', '#68A039', '#EF6C00', '#F6511E', '#FF5252',
];

export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getHostModelColor(hostModel: string): string {
  let hash = 2166136261;
  for (let i = 0; i < hostModel.length; i++) {
    hash ^= hostModel.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function getTitle(pwd: string | undefined | null): string {
  if (!pwd) return 'notifyhub';
  const parts = pwd.split('/').filter(Boolean);
  return parts.pop() || 'notifyhub';
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

export interface TagSegment {
  type: 'text' | 'tag' | 'truncated';
  text: string;
}

/** Human label for a truncation marker: "+24 LINES" -> "+24 lines". */
function truncatedLabel(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Parse `[#tag:...]` and `[#truncated:...]` markers. Adjacent truncation
 * markers collapse into one bracketed note that owns its surrounding
 * whitespace, exactly like the TUI card renderer.
 */
export function parseMessage(msg: string): TagSegment[] {
  const regex = /\[#(?:tag|truncated):(.*?)\]/g;
  const raw: TagSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(msg)) !== null) {
    if (match.index > lastIndex) {
      raw.push({ type: 'text', text: msg.slice(lastIndex, match.index) });
    }
    const kind = match[0].startsWith('[#tag:') ? 'tag' : 'truncated';
    raw.push({ type: kind, text: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < msg.length) {
    raw.push({ type: 'text', text: msg.slice(lastIndex) });
  }

  const out: TagSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i];
    if (seg.type === 'truncated') {
      const labels = [truncatedLabel(seg.text)];
      while (raw[i + 1]?.type === 'truncated') {
        i++;
        labels.push(truncatedLabel(raw[i].text));
      }
      const prev = out[out.length - 1];
      const lead = prev && !/\s$/.test(prev.text) ? ' ' : '';
      out.push({ type: 'truncated', text: `${lead}[${labels.join(', ')}] ` });
    } else if (seg.type === 'text') {
      const prev = out[out.length - 1];
      out.push({
        type: 'text',
        text: prev?.type === 'truncated' ? seg.text.replace(/^ /, '') : seg.text,
      });
    } else {
      out.push(seg);
    }
  }

  return out;
}

export function isEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.e2e === 1 && typeof v.ct === 'string';
}

export const STALE_AFTER_MS = 5 * 60 * 1000;

/** Client-side staleness mirror: a running entry silent past the window. */
export function effectiveAgentState(entry: AgentStatusEntry, now: Date): AgentState {
  if (entry.state !== 'running') return entry.state;
  const updated = Date.parse(entry.updated);
  if (Number.isFinite(updated) && now.getTime() - updated > STALE_AFTER_MS) return 'stale';
  return entry.state;
}

export const AGENT_GLYPH: Record<string, string> = {
  opencode: '\u25c7',
  claude: '\u2733',
  codex: '\u25d0',
};

/** One-cell host/house marker; avoids double-width emoji. */
export const HOST_GLYPH = '\u2302';

export const LOADING_WORDS = [
  'loading',
  'pondering',
  'noodling',
  'tinkering',
  'wrangling',
  'untangling',
  'conjuring',
  'hatching',
  'brewing',
  'scheming',
  'ruminating',
  'percolating',
  'rubber-ducking',
  'yak-shaving',
  'git-blaming',
  'bisecting',
  'grepping',
  'lint-whispering',
  'refactoring',
  'debugging',
  'vibing',
  'herding tokens',
  'asking the duck',
  'grepping the void',
  'chasing nulls',
  'consulting the void',
];

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Pick one gerund per turn. The seed is the session + current task excerpt,
 * so the word stays put while the agent works and changes when a new prompt
 * starts — the Claude Code behaviour, not a fast carousel.
 */
export function loadingWordFor(seed: string): string {
  return LOADING_WORDS[hashSeed(seed) % LOADING_WORDS.length];
}
