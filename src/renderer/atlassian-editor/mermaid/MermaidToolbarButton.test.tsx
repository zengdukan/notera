/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { configureFeatureFlags } from '../feature-flags';
import { MermaidToolbarButton } from './MermaidToolbarButton';

configureFeatureFlags();

describe('MermaidToolbarButton', () => {
  it('exposes a labelled Atlaskit toolbar action', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<MermaidToolbarButton onClick={onClick} />);

    const button = screen.getByRole('button', {
      name: 'Insert Mermaid diagram',
    });
    expect(button.textContent).toContain('Mermaid');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled before the editor is ready', () => {
    render(<MermaidToolbarButton isDisabled onClick={() => undefined} />);
    expect(
      screen
        .getByRole('button', { name: 'Insert Mermaid diagram' })
        .hasAttribute('disabled'),
    ).toBe(true);
  });
});
/** @jest-environment jsdom */
