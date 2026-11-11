import { describe, expect, it } from 'bun:test';

import type { AgentStatusEntry } from '../types';
import {
  effectiveAgentState,
  getTitle,
  isEnvelope,
  loadingWordFor,
  parseMessage,
  truncate,
} from './cardUtils';

describe('cardUtils', () => {
  it('derives the project title from the pwd tail', () => {
    expect(getTitle('/home/lamnt45/git/NotifyHub')).toBe('NotifyHub');
    expect(getTitle('/home/lamnt45/git/NotifyHub/')).toBe('NotifyHub');
    expect(getTitle(null)).toBe('notifyhub');
    expect(getTitle('')).toBe('notifyhub');
  });

  it('truncates with an ellipsis', () => {
    expect(truncate('abcdef', 5)).toBe('abcd\u2026');
    expect(truncate('abc', 5)).toBe('abc');
  });

  it('parses tags into accent segments', () => {
    const segments = parseMessage('[#tag:@USER] hello [#tag:@ASSISTANT] world');
    expect(segments).toEqual([
      { type: 'tag', text: '@USER' },
      { type: 'text', text: ' hello ' },
      { type: 'tag', text: '@ASSISTANT' },
      { type: 'text', text: ' world' },
    ]);
  });

  it('collapses adjacent truncation markers into one note', () => {
    const segments = parseMessage('body [#truncated:+24 LINES][#truncated:+517 CHARS] tail');
    expect(segments).toEqual([
      { type: 'text', text: 'body ' },
      { type: 'truncated', text: '[+24 lines, +517 chars] ' },
      { type: 'text', text: 'tail' },
    ]);
  });

  it('keeps separated truncation markers separate', () => {
    const segments = parseMessage('body [#truncated:+24 LINES] [#truncated:+517 CHARS]');
    expect(segments).toEqual([
      { type: 'text', text: 'body ' },
      { type: 'truncated', text: '[+24 lines] ' },
      { type: 'text', text: '' },
      { type: 'truncated', text: ' [+517 chars] ' },
    ]);
  });

  it('detects e2e envelopes', () => {
    expect(isEnvelope({ e2e: 1, alg: 'A256GCM', kid: 'x', iv: 'a', ct: 'b' })).toBe(true);
    expect(isEnvelope({ message: 'plain' })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });

  it('mirrors staleness for running entries older than 5 minutes', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    const base: AgentStatusEntry = {
      agent: 'opencode',
      session_id: 'ses_1',
      state: 'running',
      pwd: '/home/lamnt45/git/NotifyHub',
      host: 'kientt44',
      task: 'test',
      since: '2026-11-11T11:00:00Z',
      updated: '2026-11-11T11:58:00Z',
    };
    expect(effectiveAgentState(base, now)).toBe('running');
    expect(effectiveAgentState({ ...base, updated: '2026-11-11T11:50:00Z' }, now)).toBe('stale');
    expect(effectiveAgentState({ ...base, state: 'blocked' }, now)).toBe('blocked');
  });

  it('keeps the loading word stable per turn', () => {
    const first = loadingWordFor('ses_1:add a waiting card');
    expect(loadingWordFor('ses_1:add a waiting card')).toBe(first);
    expect(first.length).toBeGreaterThan(0);
  });
});
