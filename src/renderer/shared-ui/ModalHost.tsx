import { type ReactNode, useEffect, useState } from 'react';
import ModalDialog, {
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';

export interface HostedModal {
  readonly kind: string;
  readonly title: string;
  /** Complete ADS modal sections, including ModalBody and optional ModalFooter. */
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
          testId={`notera-modal-${modal.kind}`}
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
          {modal.content}
        </ModalDialog>
      )}
    </ModalTransition>
  );
}
