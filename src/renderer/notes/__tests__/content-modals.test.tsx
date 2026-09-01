/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { ModalHost } from '../../shared-ui/ModalHost';
import { CreateFolderModal } from '../CreateFolderModal';
import { MoveContentModal } from '../MoveContentModal';
import { RenameContentModal } from '../RenameContentModal';
import { TrashContentModal } from '../TrashContentModal';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

function renderContentModal(content: ReactNode) {
  render(
    <AppProviders locale="en">
      <ModalHost
        modal={{
          kind: 'content-operation',
          title: 'Content operation',
          content,
        }}
        onClose={jest.fn()}
      />
    </AppProviders>,
  );
}

describe('content operation modal bodies', () => {
  it('rejects a blank folder name and submits a trimmed name', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    renderContentModal(<CreateFolderModal onCreate={onCreate} />);
    expect(
      within(
        screen.getByTestId('notera-modal-content-operation--footer'),
      ).getByRole('button', { name: 'Create folder' }),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/Folder name/), '   ');
    await user.click(screen.getByRole('button', { name: 'Create folder' }));
    expect(onCreate).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(/Folder name/));
    await user.type(screen.getByLabelText(/Folder name/), ' Projects ');
    await user.click(screen.getByRole('button', { name: 'Create folder' }));
    expect(onCreate).toHaveBeenCalledWith('Projects');
  });

  it('requires explicit confirmation before moving content to trash', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    renderContentModal(
      <TrashContentModal
        name="Roadmap"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );
    expect(screen.getByText(/Roadmap/)).toBeVisible();
    expect(
      within(
        screen.getByTestId('notera-modal-content-operation--footer'),
      ).getByRole('button', { name: 'Move to trash' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the selected destination for copy operations', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    renderContentModal(
      <MoveContentModal
        operation="copy"
        rootFolderId="root"
        folders={[{ id: 'target', name: 'Target', depth: 0 }]}
        disabledIds={new Set()}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );
    expect(
      within(
        screen.getByTestId('notera-modal-content-operation--footer'),
      ).getByRole('button', { name: 'Copy' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Target' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onSubmit).toHaveBeenCalledWith('target');
  });

  it('submits rename from the modal footer', async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    renderContentModal(
      <RenameContentModal initialName="Draft" onRename={onRename} />,
    );

    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(input);
    await user.type(input, 'Final');
    await user.click(
      within(
        screen.getByTestId('notera-modal-content-operation--footer'),
      ).getByRole('button', { name: 'Rename' }),
    );

    expect(onRename).toHaveBeenCalledWith('Final');
  });
});
