import type { AgentStatusEntry, NotificationItem, ServerInfo } from '../types';

/** One prototype scenario: every case gets its own selectable screen. */
export interface PrototypeScenario {
  id: string;
  title: string;
  blurb: string;
  notifications: NotificationItem[];
  agentStatus: AgentStatusEntry[];
  serverInfo: ServerInfo;
  hasMore: boolean;
}

const MINUTE = 60_000;

/**
 * Far-future `updated` keeps a running fixture "loading" forever. The client
 * stale mirror flips any running entry older than 5 minutes to "stalled?"; a
 * scenario that wants that state overrides `updated` with an old timestamp.
 */
const FOREVER = new Date(8.64e15).toISOString();

function ago(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * MINUTE).toISOString();
}

function note(
  id: string,
  now: Date,
  minutesAgo: number,
  data: NotificationItem['data'],
  locked = false,
): NotificationItem {
  return { id, data, timestamp: ago(now, minutesAgo), ...(locked ? { locked: true } : {}) };
}

function status(
  agent: string,
  sessionId: string,
  state: AgentStatusEntry['state'],
  now: Date,
  overrides: Partial<AgentStatusEntry> = {},
): AgentStatusEntry {
  return {
    agent,
    session_id: sessionId,
    state,
    pwd: '/home/lamnt45/git/NotifyHub',
    host: 'kientt44',
    task: 'add a web prototype mode',
    since: ago(now, 12),
    updated: state === 'running' ? FOREVER : now.toISOString(),
    ...overrides,
  };
}

function envelope(kid: string): NotificationItem['data'] {
  return {
    e2e: 1,
    alg: 'A256GCM',
    kid,
    iv: 'cHJvdG90eXBlLWl2',
    ct: 'cHJvdG90eXBlLWNpcGhlcnRleHQ=',
  };
}

function server(overrides: Partial<ServerInfo> = {}): ServerInfo {
  return {
    connected: true,
    streaming: true,
    notificationsCount: 0,
    port: 443,
    host: 'nuc.tail0ec64c.ts.net',
    e2e: { enabled: true, alg: 'A256GCM', kid: '39163466' },
    ...overrides,
  };
}

const LONG_TASK =
  'wrap the task excerpt across several rows at narrow widths and make sure the assistant line stays visible';

const LONG_MESSAGE = [
  '[#tag:@USER] review the notification card layout',
  '[#tag:@ASSISTANT] I compared the waiting card with the completed card and adjusted the header pills so the machine tag stays in the corner.',
  'The body wraps by measured height instead of a fixed row count.',
  '[#truncated:+24 LINES][#truncated:+517 CHARS]',
].join('\n');

const TRUNCATED_MESSAGE = [
  '[#tag:@USER] [@opencode.done] summary',
  '[#tag:@ASSISTANT] first line survives',
  'second line survives',
  '[#truncated:+11 LINES]',
  '[#truncated:+32 CHARS]',
].join('\n');

/** Build every scenario against one reference time, so “2m ago” stays stable. */
export function buildScenarios(now: Date): PrototypeScenario[] {
  const overviewWaiting = [
    status('opencode', 'ses_proto_running', 'running', now, {
      task: 'add make frontend-prototype with mock data',
      since: ago(now, 12),
    }),
    status('claude', 'ses_proto_blocked', 'blocked', now, {
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
      task: 'why does the parser drop the last chunk?',
      since: ago(now, 3),
    }),
    status('codex', 'ses_proto_stalled', 'running', now, {
      pwd: '/home/lamnt45/git/xdgg-private',
      host: 'nuc',
      task: 'run the flaky suite again',
      since: ago(now, 45),
      // Silent past the 5-minute window: the card shows "stalled? ◼".
      updated: ago(now, 10),
    }),
  ];

  const overviewNotifications = [
    note('overview-1', now, 1, {
      message:
        '[#tag:@USER] add make frontend-prototype\n[#tag:@ASSISTANT] done — the harness imports the real AppView and mocks only the data boundary.',
      pwd: '/home/lamnt45/git/NotifyHub',
      host_model: 'kientt44',
      session_id: 'ses_proto_running',
    }),
    note('overview-2', now, 4, {
      message: '[#tag:opencode.done] turn finished\nScenarios cover waiting cards, locked rows, popups and pagination.',
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
      host_model: 'Mac153',
    }),
    note('overview-3', now, 9, {
      message: LONG_MESSAGE,
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
    }),
    note('overview-4', now, 16, {
      message: 'No pwd — the pwd row is omitted.',
      host_model: 'nuc',
    }),
    note('overview-5', now, 24, {
      message: '',
      pwd: '/home/lamnt45/git/empty-message',
    }),
    note('overview-6', now, 33, envelope('39163466'), true),
    note('overview-7', now, 47, {
      message: 'Long pwd is truncated at 80 characters.',
      pwd: '/home/lamnt45/git/hanoi-testing-platform/_submodules/test-suites/test-suite.congvu.viettel.ai/very/deep/nested/path/that/keeps/going',
      host_model: 'kientt44',
    }),
    note('overview-8', now, 58, {
      message: '[#tag:@USER] [#tag:@ASSISTANT] [#tag:codex.error]',
      pwd: '/home/lamnt45/git/xdgg-private',
    }),
  ];

  const waiting = [
    status('opencode', 'ses_wait_running', 'running', now, {
      task: 'add make frontend-prototype with mock data',
      since: ago(now, 12),
    }),
    status('claude', 'ses_wait_blocked', 'blocked', now, {
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
      task: 'why does the parser drop the last chunk?',
      since: ago(now, 3),
    }),
    status('codex', 'ses_wait_stale', 'running', now, {
      task: 'run the flaky suite again',
      host: 'nuc',
      since: ago(now, 45),
      // Silent past the 5-minute window: the card mirrors staleness client-side.
      updated: ago(now, 10),
    }),
  ];

  const waitingEdges = [
    status('opencode', 'ses_edge_no_task', 'running', now, {
      task: null,
      since: ago(now, 2),
    }),
    status('claude', 'ses_edge_no_host', 'running', now, {
      host: null,
      task: LONG_TASK,
      since: ago(now, 6),
    }),
    status('cursor', 'ses_edge_unknown', 'running', now, {
      pwd: '/home/lamnt45/git/cursor-demo',
      // Long enough to exercise the 24-character host truncation.
      host: 'a-very-long-machine-name-01',
      task: 'unknown agent glyph falls back to a filled circle',
      since: ago(now, 9),
    }),
  ];

  const feed = [
    note('feed-1', now, 1, {
      message: '[#tag:@USER] plain card with a host pill\n[#tag:@ASSISTANT] second line',
      pwd: '/home/lamnt45/git/NotifyHub',
      host_model: 'kientt44',
    }),
    note('feed-2', now, 3, {
      message: 'No host_model: the timestamp stays on the title row.',
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
    }),
    note('feed-3', now, 7, {
      message: TRUNCATED_MESSAGE,
      pwd: '/home/lamnt45/git/NotifyHub',
      host_model: 'Mac153',
    }),
    note('feed-4', now, 12, {
      message: LONG_MESSAGE,
      pwd: '/home/lamnt45/git/hanoi-testing-platform',
    }),
    note('feed-5', now, 19, {
      message: 'Long pwd path:',
      pwd: '/home/lamnt45/git/hanoi-testing-platform/_submodules/test-suites/test-suite.congvu.viettel.ai/very/deep/nested/path/that/keeps/going',
      host_model: 'nuc',
    }),
    note('feed-6', now, 27, {
      message: '',
      pwd: '/home/lamnt45/git/empty-message',
    }),
    note('feed-7', now, 36, {
      message: 'No pwd row.',
      host_model: 'kientt44',
    }),
    note('feed-8', now, 44, {
      message: '[#tag:@USER] [#tag:@ASSISTANT] [#tag:codex.error]',
      pwd: '/home/lamnt45/git/xdgg-private',
    }),
  ];

  const e2e = [
    note('e2e-1', now, 2, envelope('39163466'), true),
    note('e2e-2', now, 8, envelope('deadbeef'), true),
    note('e2e-3', now, 14, envelope('?'), true),
    note('e2e-4', now, 21, {
      message: 'This row is plaintext even though the server reports e2e state.',
      pwd: '/home/lamnt45/git/NotifyHub',
      host_model: 'kientt44',
    }),
  ];

  const manyNotifications = Array.from({ length: 30 }, (_, i) => {
    const data: Record<string, unknown> = {
      message:
        i % 4 === 0
          ? `[#tag:@USER] prompt ${i}\n[#tag:@ASSISTANT] reply ${i}`
          : `notification ${i} — ${'lorem ipsum '.repeat((i % 3) + 1)}`,
    };
    if (i % 5 !== 0) data.pwd = '/home/lamnt45/git/NotifyHub';
    if (i % 3 === 0) data.host_model = 'kientt44';
    return note(`many-${i}`, now, i * 2 + 1, data);
  });

  return [
    {
      id: 'overview',
      title: 'overview',
      blurb: 'loading, blocked and stalled cards above a mixed feed',
      notifications: overviewNotifications,
      agentStatus: overviewWaiting,
      serverInfo: server({ notificationsCount: overviewNotifications.length }),
      hasMore: false,
    },
    {
      id: 'waiting',
      title: 'waiting states',
      blurb: 'running, blocked and stalled cards',
      notifications: [
        note('waiting-1', now, 1, {
          message: 'The feed below the waiting cards still scrolls.',
          pwd: '/home/lamnt45/git/NotifyHub',
          host_model: 'kientt44',
        }),
      ],
      agentStatus: waiting,
      serverInfo: server({ notificationsCount: 1 }),
      hasMore: false,
    },
    {
      id: 'waiting-edges',
      title: 'waiting edge cases',
      blurb: 'missing task, missing host, unknown agent',
      notifications: [
        note('edges-1', now, 2, {
          message: 'Edge cases share one screen; resize to 360px to see wrapping.',
          pwd: '/home/lamnt45/git/NotifyHub',
        }),
      ],
      agentStatus: waitingEdges,
      serverInfo: server({ notificationsCount: 1 }),
      hasMore: false,
    },
    {
      id: 'feed',
      title: 'notification cards',
      blurb: 'tags, truncation, empty bodies, long pwd',
      notifications: feed,
      agentStatus: [],
      serverInfo: server({ notificationsCount: feed.length }),
      hasMore: false,
    },
    {
      id: 'e2e',
      title: 'e2e / locked rows',
      blurb: 'undecryptable envelopes and the e2e status popup',
      notifications: e2e,
      agentStatus: [],
      serverInfo: server({ notificationsCount: e2e.length }),
      hasMore: false,
    },
    {
      id: 'empty',
      title: 'empty / offline',
      blurb: 'no notifications, disconnected server',
      notifications: [],
      agentStatus: [],
      serverInfo: server({
        connected: false,
        streaming: false,
        notificationsCount: 0,
        e2e: undefined,
      }),
      hasMore: false,
    },
    {
      id: 'many',
      title: 'many / pagination',
      blurb: '30 cards; scroll down or press l to see the loading state',
      notifications: manyNotifications,
      agentStatus: [],
      serverInfo: server({ notificationsCount: 36 }),
      hasMore: true,
    },
  ];
}
