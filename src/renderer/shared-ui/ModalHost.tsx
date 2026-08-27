import { type ReactNode, useEffect, useState } from 'react';
import ModalDialog, {
  ModalBody,
  ModalHeader,
  ModalTitle,
  ModalTransition,
} from '@atlaskit/modal-dialog';

export interface HostedModal {
  readonly kind: string;
  readonly title: string;
  readonly content: ReactNode;
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
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          shouldReturnFocus
        >
          <ModalHeader hasCloseButton>
            <ModalTitle>{modal.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>{modal.content}</ModalBody>
        </ModalDialog>
      )}
    </ModalTransition>
  );
}
