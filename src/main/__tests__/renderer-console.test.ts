import { rendererConsoleDetails } from '../renderer-console';

describe('renderer console diagnostics', () => {
  it('keeps the renderer source location and extracts the error stack', () => {
    expect(
      rendererConsoleDetails(
        '[Notera] renderer unhandled rejection type=Error message=failed' +
          '\n[Notera] stack=Error: failed\n    at editor.ts:10:2',
        89861,
        'renderer.dev.js',
      ),
    ).toEqual({
      message:
        '[Notera] renderer unhandled rejection type=Error message=failed',
      line: 89861,
      sourceId: 'renderer.dev.js',
      stack: 'Error: failed\n    at editor.ts:10:2',
    });
  });

  it('retains ordinary console messages without inventing a stack', () => {
    expect(rendererConsoleDetails('hello', 12, 'renderer.js')).toEqual({
      message: 'hello',
      line: 12,
      sourceId: 'renderer.js',
    });
  });
});
