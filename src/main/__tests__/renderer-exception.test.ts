import { rendererExceptionDetails } from '../renderer-exception';

describe('renderer exception diagnostics', () => {
  it('converts Runtime.exceptionThrown stack frames into a loggable stack', () => {
    expect(
      rendererExceptionDetails({
        exceptionDetails: {
          text: 'Uncaught (in promise) Error: Clipboard api is not supported',
          exception: {
            description: 'Error: Clipboard api is not supported',
          },
          stackTrace: {
            callFrames: [
              {
                functionName: '',
                url: 'renderer.dev.js',
                lineNumber: 89876,
                columnNumber: 16,
              },
              {
                functionName: 'tryCatch',
                url: 'renderer.dev.js',
                lineNumber: 696008,
                columnNumber: 15,
              },
            ],
          },
        },
      }),
    ).toEqual({
      message: 'Uncaught (in promise) Error: Clipboard api is not supported',
      stack:
        'Uncaught (in promise) Error: Clipboard api is not supported\n' +
        '    at <anonymous> (renderer.dev.js:89877:17)\n' +
        '    at tryCatch (renderer.dev.js:696009:16)',
      line: 89877,
      sourceId: 'renderer.dev.js',
    });
  });

  it('ignores malformed debugger payloads', () => {
    expect(rendererExceptionDetails({})).toBeUndefined();
  });
});
