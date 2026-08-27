/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { AppProviders } from '../../app/AppProviders';
import { FolderPicker } from '../FolderPicker';

describe('FolderPicker', () => {
  it('includes root and disables a moved folder and all descendants', () => {
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
          onChange={jest.fn()}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('radio', { name: 'Root' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Folder' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Child' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Other' })).toBeEnabled();
  });
});
