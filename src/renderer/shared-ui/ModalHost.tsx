import { type ReactNode, useEffect, useState } from 'react';
import ModalDialog, {
  ModalBody,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';

import './ModalHost.css';

export interface HostedModal {
  readonly kind: string;
  readonly title: string;
  readonly content: ReactNode;
  readonly width?: number | 'small' | 'medium' | 'large' | 'x-large';
}

export function ModalHost({
  modal,
  onClose,
}: {
  readonly modal: HostedModal | null;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState(modal !== null);

  useEffect(() => setOpen(modal !== null), [modal]);

  if (modal === null) return null;
  return (
    <ModalTransition>
      {open && (
        <ModalDialog
          width={modal.width}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          shouldReturnFocus
        >
          <ModalHeader hasCloseButton>
            <ModalTitle>{modal.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div
              className={`notera-modal-content notera-modal-content--${modal.kind}`}
              data-notera-modal={modal.kind}
              data-testid={`notera-modal-content-${modal.kind}`}
            >
              {modal.content}
            </div>
          </ModalBody>
        </ModalDialog>
      )}
    </ModalTransition>
  );
}
