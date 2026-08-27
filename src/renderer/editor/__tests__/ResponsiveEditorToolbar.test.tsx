/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppProviders } from '../../app/AppProviders';
import { ResponsiveEditorToolbar } from '../ResponsiveEditorToolbar';

describe('ResponsiveEditorToolbar', () => {
  it('renders the compact Fullpage preset without duplicate actions', async () => {
    const user = userEvent.setup();
    const execute = jest.fn();
    render(
      <AppProviders locale="en">
        <ResponsiveEditorToolbar width={410} execute={execute} />
      </AppProviders>,
    );

    expect(
      screen.getByRole('toolbar', { name: 'Editor formatting' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Bold' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More formatting' }));
    const bold = within(screen.getByRole('menu')).getByRole('button', {
      name: 'Bold',
    });
    expect(bold).toBeVisible();
    expect(screen.getAllByText('Bold')).toHaveLength(1);
    await user.click(bold);
    expect(execute).toHaveBeenCalledWith('bold');
  });

  it('keeps wide actions out of Insert and preserves visible order', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders locale="en">
        <ResponsiveEditorToolbar width={1200} execute={jest.fn()} />
      </AppProviders>,
    );
    const labels = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Undo',
        'Redo',
        'Bold',
        'Table',
        'Media',
        'Emoji',
        'Insert',
      ]),
    );
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    const menu = within(screen.getByRole('menu'));
    expect(
      menu.queryByRole('button', { name: 'Table' }),
    ).not.toBeInTheDocument();
    expect(menu.getByRole('button', { name: 'Math formula' })).toBeVisible();
    expect(screen.queryByText(/Mention|Rovo|Pin/i)).not.toBeInTheDocument();
  });
});
