/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

import { AppProviders } from '../../app/AppProviders';
import { ModalHost } from '../ModalHost';

jest.mock('react-scrolllock', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
  TouchScrollable: ({ children }: { children: ReactNode }) => children,
}));

describe('ModalHost', () => {
  it('hosts a feature-specific dialog at an exact design width', () => {
    render(
      <AppProviders locale="en">
        <ModalHost
          modal={{
            kind: 'search',
            title: 'Search',
            width: 720,
            content: <p>Search content</p>,
          }}
          onClose={jest.fn()}
        />
      </AppProviders>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Search' });
    expect(dialog).toContainElement(
      screen.getByTestId('notera-modal-content-search'),
    );
    expect(screen.getByText('Search content')).toBeVisible();
  });
});
