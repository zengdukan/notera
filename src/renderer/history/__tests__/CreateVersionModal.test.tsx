/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { configureFeatureFlags } from '../../atlassian-editor/feature-flags';
import { CreateVersionModal } from '../CreateVersionModal';

configureFeatureFlags();

describe('CreateVersionModal', () => {
  it('allows editing the default name and keeps input after a failed create', async () => {
    const user = userEvent.setup();
    const onCreate = jest.fn().mockRejectedValue(new Error('failed'));
    render(
      <CreateVersionModal
        defaultName="2026-08-27 14:35:22"
        onCreate={onCreate}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Version name' });
    expect(input).toHaveValue('2026-08-27 14:35:22');
    await user.clear(input);
    expect(
      screen.getByRole('button', { name: 'Create version' }),
    ).toBeDisabled();
    await user.type(input, 'Milestone');
    await user.click(screen.getByRole('button', { name: 'Create version' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Milestone'));
    expect(input).toHaveValue('Milestone');
    expect(screen.getByText('Version was not created')).toBeVisible();
  });
});
