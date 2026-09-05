/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '../../app/AppProviders';
import { FolderPicker } from '../FolderPicker';

describe('FolderPicker', () => {
  it('renders an expandable folder tree and keeps selection rules intact', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <AppProviders locale="en">
        <FolderPicker
          rootFolderId="root"
          folders={[
            { id: 'folder', name: 'Folder', depth: 0 },
            { id: 'child', name: 'Child', depth: 1 },
            { id: 'other', name: 'Other', depth: 0 },
          ]}
          disabledIds={new Set(['folder', 'child'])}
          value="root"
          onChange={onChange}
        />
      </AppProviders>,
    );

    const root = screen.getByRole('button', { name: '/' });
    const folder = screen.getByRole('button', { name: 'Folder' });
    const child = screen.getByRole('button', { name: 'Child' });
    const other = screen.getByRole('button', { name: 'Other' });

    expect(root).toHaveAttribute('aria-expanded', 'true');
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    expect(folder).toBeEnabled();
    expect(child).toBeDisabled();

    await user.click(folder);
    expect(folder).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Child', hidden: true }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(other);
    expect(onChange).toHaveBeenCalledWith('other');
  });

  it('limits the tree height and scrolls overflowing folders', () => {
    render(
      <AppProviders locale="en">
        <FolderPicker
          rootFolderId="root"
          folders={[{ id: 'folder', name: 'Folder', depth: 0 }]}
          disabledIds={new Set()}
          value="root"
          onChange={jest.fn()}
        />
      </AppProviders>,
    );

    const scrollContainer = screen.getByTestId('folder-picker-scroll');
    expect(window.getComputedStyle(scrollContainer).maxHeight).toBe('320px');
    expect(window.getComputedStyle(scrollContainer).overflowY).toBe('auto');
  });
});
