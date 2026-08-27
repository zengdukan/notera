/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { CreateFolderModal } from '../CreateFolderModal';
import { MoveContentModal } from '../MoveContentModal';
import { TrashContentModal } from '../TrashContentModal';

describe('content operation modal bodies', () => {
  it('rejects a blank folder name and submits a trimmed name', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn();
    render(
      <AppProviders locale="en">
        <CreateFolderModal onCreate={onCreate} />
      </AppProviders>,
    );
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
    render(
      <AppProviders locale="en">
        <TrashContentModal
          name="Roadmap"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      </AppProviders>,
    );
    expect(screen.getByText(/Roadmap/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the selected destination for copy operations', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(
      <AppProviders locale="en">
        <MoveContentModal
          operation="copy"
          rootFolderId="root"
          folders={[{ id: 'target', name: 'Target', depth: 0 }]}
          disabledIds={new Set()}
          onSubmit={onSubmit}
          onCancel={jest.fn()}
        />
      </AppProviders>,
    );
    await user.click(screen.getByRole('radio', { name: 'Target' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onSubmit).toHaveBeenCalledWith('target');
  });
});
