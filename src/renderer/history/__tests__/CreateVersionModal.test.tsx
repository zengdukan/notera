/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { ModalHost } from '../../shared-ui/ModalHost';
import { CreateVersionModal } from '../CreateVersionModal';

configureFeatureFlags();

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

describe('CreateVersionModal', () => {
  it('allows editing the default name and keeps input after a failed create', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockRejectedValue(new Error('failed'));
    render(
      <AppProviders locale="en">
        <ModalHost
          modal={{
            kind: 'create-version',
            title: 'Create version',
            content: (
              <CreateVersionModal
                defaultName="2026-08-27 14:35:22"
                onCreate={onCreate}
              />
            ),
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    const input = screen.getByRole('textbox', { name: 'Version name' });
    expect(input).toHaveValue('2026-08-27 14:35:22');
    await user.clear(input);
    expect(
      screen.getByRole('button', { name: 'Create version' }),
    ).toBeDisabled();
    expect(
      within(
        screen.getByTestId('notera-modal-create-version--footer'),
      ).getByRole('button', { name: 'Create version' }),
    ).toBeVisible();
    await user.type(input, 'Milestone');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Milestone'));
    expect(input).toHaveValue('Milestone');
    expect(screen.getByText('Version was not created')).toBeVisible();
  });
});
