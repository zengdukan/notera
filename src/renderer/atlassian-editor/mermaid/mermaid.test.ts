const mockMermaid = {
  initialize: jest.fn(),
  parse: jest.fn(),
  render: jest.fn(),
};

jest.mock('mermaid', () => ({ __esModule: true, default: mockMermaid }));

import { renderMermaid } from './mermaid';

describe('Mermaid rendering', () => {
  beforeEach(() => {
    mockMermaid.initialize.mockClear();
    mockMermaid.parse.mockReset();
    mockMermaid.render.mockReset();
  });

  it('initializes securely once and renders valid SVG', async () => {
    mockMermaid.parse.mockResolvedValue(true);
    mockMermaid.render.mockResolvedValue({ svg: '<svg>diagram</svg>' });

    await expect(
      renderMermaid('first', 'flowchart LR\nA --> B'),
    ).resolves.toEqual({ error: null, svg: '<svg>diagram</svg>' });
    await expect(
      renderMermaid('second', 'flowchart LR\nB --> C'),
    ).resolves.toEqual({ error: null, svg: '<svg>diagram</svg>' });

    expect(mockMermaid.initialize).toHaveBeenCalledTimes(1);
    expect(mockMermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        startOnLoad: false,
        theme: 'base',
        themeVariables: expect.objectContaining({
          pie1: '#357DE8',
          pie2: '#82B536',
          pie3: '#BF63F3',
          pieOpacity: '1',
        }),
      }),
    );
  });

  it('returns useful errors for empty, invalid, and failed renders', async () => {
    await expect(renderMermaid('empty', '  ')).resolves.toEqual({
      error: 'Enter a Mermaid diagram definition',
      svg: null,
    });

    mockMermaid.parse.mockResolvedValueOnce(false);
    await expect(renderMermaid('invalid', 'not a diagram')).resolves.toEqual({
      error: 'Invalid Mermaid syntax',
      svg: null,
    });

    mockMermaid.parse.mockResolvedValueOnce(true);
    mockMermaid.render.mockRejectedValueOnce(
      new Error('Parse error on line 2'),
    );
    await expect(renderMermaid('failed', 'flowchart LR')).resolves.toEqual({
      error: 'Parse error on line 2',
      svg: null,
    });
  });
});
