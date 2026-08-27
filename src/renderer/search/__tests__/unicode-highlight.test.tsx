/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';

import { HighlightedText } from '../unicode-highlight';

describe('Unicode search highlighting', () => {
  it('uses code-point ranges for surrogate pairs and combining marks', () => {
    const { container } = render(
      <HighlightedText
        text={'A😀e\u0301Z'}
        ranges={[
          { start: 1, end: 2 },
          { start: 2, end: 4 },
        ]}
      />,
    );

    expect(screen.getByText('😀', { selector: 'mark' })).toBeVisible();
    expect(screen.getByText('é', { selector: 'mark' })).toBeVisible();
    expect(container.textContent).toBe('A😀éZ');
    expect(container.querySelectorAll('mark')).toHaveLength(2);
  });

  it('renders disjoint ranges as React text nodes without HTML injection', () => {
    const { container } = render(
      <HighlightedText
        text={'<img src=x> alpha beta'}
        ranges={[
          { start: 12, end: 17 },
          { start: 18, end: 22 },
        ]}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('<img src=x> alpha beta');
  });
});
