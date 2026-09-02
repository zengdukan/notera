/** @jest-environment jsdom */

import { createExportReadiness } from '../readiness';

function deferred<T>() {
  let resolveDeferred!: (value: T | PromiseLike<T>) => void;
  let rejectDeferred!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve;
    rejectDeferred = reject;
  });
  return {
    promise,
    reject: rejectDeferred,
    resolve: resolveDeferred,
  };
}

describe('export render readiness', () => {
  it('waits for fonts, image decoding, and Mermaid terminal state', async () => {
    const root = document.createElement('main');
    root.innerHTML =
      '<img alt="attachment"><span data-export-lossy="true">invalid math</span>';
    const image = root.querySelector('img')!;
    const fonts = deferred<void>();
    const decoded = deferred<void>();
    Object.defineProperty(image, 'decode', { value: () => decoded.promise });
    const readiness = createExportReadiness();
    const settleMermaid = readiness.registerMermaid();
    let resolved = false;

    const result = readiness
      .waitForStable(root, fonts.promise)
      .then((value: number) => {
        resolved = true;
        return value;
      });
    await Promise.resolve();
    expect(resolved).toBe(false);

    fonts.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    decoded.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    root.insertAdjacentHTML(
      'beforeend',
      '<pre data-export-lossy="true">invalid Mermaid</pre>',
    );
    settleMermaid();
    await expect(result).resolves.toBe(2);
  });

  it('treats an undecodable image as a stable lossy node', async () => {
    const root = document.createElement('main');
    root.innerHTML = '<img alt="missing attachment">';
    const image = root.querySelector('img')!;
    Object.defineProperty(image, 'decode', {
      value: () => Promise.reject(new Error('decode failed')),
    });

    await expect(
      createExportReadiness().waitForStable(root, Promise.resolve()),
    ).resolves.toBe(1);
  });

  it('waits for lazy renderer placeholders before inspecting content', async () => {
    const root = document.createElement('main');
    root.innerHTML =
      '<input type="hidden" data-lazy-begin="task"><p>&nbsp;</p>';
    const decoded = deferred<void>();
    let resolved = false;
    const result = createExportReadiness()
      .waitForStable(root, Promise.resolve())
      .then((value) => {
        resolved = true;
        return value;
      });
    await Promise.resolve();
    expect(resolved).toBe(false);

    root.innerHTML =
      '<img alt="loaded task media"><span data-export-lossy="true">task</span>';
    const image = root.querySelector('img')!;
    Object.defineProperty(image, 'decode', { value: () => decoded.promise });
    await Promise.resolve();
    expect(resolved).toBe(false);

    decoded.resolve();
    await expect(result).resolves.toBe(1);
  });

  it('waits for expected ADF text when a lazy placeholder has not mounted yet', async () => {
    const root = document.createElement('main');
    const readiness = createExportReadiness({
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { localId: 'task-1', state: 'TODO' },
              content: [{ type: 'text', text: '梳理经济问题' }],
            },
          ],
        },
      ],
    });
    let resolved = false;
    const result = readiness
      .waitForStable(root, Promise.resolve())
      .then((value) => {
        resolved = true;
        return value;
      });

    await Promise.resolve();
    expect(resolved).toBe(false);

    root.innerHTML =
      '<div class="ak-renderer-document"><div>梳理经济问题</div></div>';
    await expect(result).resolves.toBe(0);
  });
});
