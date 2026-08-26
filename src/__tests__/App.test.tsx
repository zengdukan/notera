/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import App from '../renderer/App';

jest.mock('../renderer/atlassian-editor/editor', () => ({
  Editor: () => <div>Full Atlaskit editor demo</div>,
}));

describe('App', () => {
  it('mounts the Atlaskit editor example as the renderer home page', () => {
    render(<App />);

    expect(screen.getByText('Full Atlaskit editor demo')).toBeInTheDocument();
  });
});
