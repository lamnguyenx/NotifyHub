import { Modal } from '@mantine/core';

import type { ServerInfo } from '../types';

interface StatusPopupProps {
  opened: boolean;
  onClose: () => void;
  serverInfo: ServerInfo;
  notificationsCount: number;
  lockedCount: number;
}

export function StatusPopup({
  opened,
  onClose,
  serverInfo,
  notificationsCount,
  lockedCount,
}: StatusPopupProps) {
  const { connected, streaming, host, port, e2e } = serverInfo;
  const address = port ? `${host}:${port}` : host;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Status"
      centered
      classNames={{
        content: 'nh-modal-content',
        header: 'nh-modal-header',
        title: 'nh-modal-title',
        body: 'nh-modal-body',
        close: 'nh-modal-close',
      }}
    >
      <dl className="nh-status-grid">
        <dt>Connection</dt>
        <dd className={connected ? 'nh-ok' : 'nh-off'}>
          {connected ? '\u25cf Connected' : '\u25cb Disconnected'}
        </dd>

        <dt>Live stream</dt>
        <dd className={streaming ? 'nh-ok' : 'nh-off'}>
          {streaming ? 'streaming' : 'reconnecting…'}
        </dd>

        <dt>Server</dt>
        <dd>{address}</dd>

        <dt>Notifications</dt>
        <dd>{notificationsCount}</dd>

        <dt>E2E</dt>
        <dd>{e2e?.enabled ? `enabled (kid ${e2e.kid ?? '?'})` : 'disabled'}</dd>

        <dt>Locked rows</dt>
        <dd>{lockedCount}</dd>
      </dl>

      {e2e?.enabled ? (
        <p className="nh-modal-hint">
          The web UI does not decrypt e2e payloads. Locked cards are shown by design — use the TUI
          to read them.
        </p>
      ) : null}
    </Modal>
  );
}

export default StatusPopup;
