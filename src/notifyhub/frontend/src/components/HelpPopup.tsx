import { Modal } from '@mantine/core';

interface HelpPopupProps {
  opened: boolean;
  onClose: () => void;
}

export function HelpPopup({ opened, onClose }: HelpPopupProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Keys"
      centered
      classNames={{
        content: 'nh-modal-content',
        header: 'nh-modal-header',
        title: 'nh-modal-title',
        body: 'nh-modal-body',
        close: 'nh-modal-close',
      }}
    >
      <dl className="nh-help-grid">
        <dt>l</dt>
        <dd>Load older notifications</dd>
        <dt>s</dt>
        <dd>Toggle status</dd>
        <dt>h / ?</dt>
        <dd>Toggle this help</dd>
        <dt>Esc</dt>
        <dd>Close the popup</dd>
      </dl>
      <p className="nh-modal-hint">Hover a card and click × to delete it.</p>
    </Modal>
  );
}

export default HelpPopup;
