/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import App from '../renderer/App';

jest.mock('../renderer/app/AppShell', () => ({
  AppShell: () => <div>Notera product shell</div>,
}));

describe('App', () => {
  it('mounts the Notera product shell', () => {
    Object.defineProperty(window, 'notera', { configurable: true, value: {} });
    render(<App />);

    expect(screen.getByText('Notera product shell')).toBeInTheDocument();
  });
});
