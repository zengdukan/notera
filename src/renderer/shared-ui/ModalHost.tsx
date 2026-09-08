import { type ReactNode, useEffect, useState } from 'react';
import { useColorMode, useSetColorMode } from '@atlaskit/app-provider';
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

function PortalColorModeSync({
  colorMode,
}: {
  readonly colorMode: 'light' | 'dark';
}) {
  const setPortalColorMode = useSetColorMode();

  useEffect(
    () => setPortalColorMode(colorMode),
    [colorMode, setPortalColorMode],
  );
  return null;
}

export function ModalHost({
  modal,
  onClose,
}: {
  readonly modal: HostedModal | null;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState(modal !== null);
  const colorMode = useColorMode();

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
          <PortalColorModeSync colorMode={colorMode} />
          <ModalHeader hasCloseButton>
            <ModalTitle>{modal.title}</ModalTitle>
          </ModalHeader>
          {modal.content}
        </ModalDialog>
      )}
    </ModalTransition>
  );
}
