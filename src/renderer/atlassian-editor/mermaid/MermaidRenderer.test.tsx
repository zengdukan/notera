/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';

const mockRenderMermaid = jest.fn();

jest.mock('./mermaid', () => ({ renderMermaid: mockRenderMermaid }));

import { MermaidRenderer } from './MermaidRenderer';

describe('MermaidRenderer', () => {
  beforeEach(() => {
    mockRenderMermaid.mockReset();
  });

  it('renders generated SVG', async () => {
    mockRenderMermaid.mockResolvedValue({
      error: null,
      svg: '<svg><text>Diagram</text></svg>',
    });
    render(<MermaidRenderer source="flowchart LR\nA --> B" />);

    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: 'Mermaid diagram' }).innerHTML,
      ).toContain('<svg');
    });
  });

  it('keeps invalid stored source visible and recoverable', async () => {
    mockRenderMermaid.mockResolvedValue({
      error: 'Invalid Mermaid syntax',
      svg: null,
    });
    render(<MermaidRenderer source="bad source" />);

    await waitFor(() => {
      expect(
        screen.getByRole('group', { name: 'Invalid Mermaid diagram' })
          .textContent,
      ).toContain('Invalid Mermaid syntax');
    });
    expect(screen.getByText('bad source')).toBeTruthy();
  });
});
