export interface ExportReadiness {
  registerMermaid(): () => void;
  waitForStable(
    root: ParentNode,
    fontsReady: Promise<unknown>,
  ): Promise<number>;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function textNodesOf(document: unknown): readonly string[] {
  const values: string[] = [];
  const stack: unknown[] = [document];
  // Keep traversal iterative because validated ADF may be deeply nested.
  // eslint-disable-next-line no-restricted-syntax
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === 'object' && value !== null) {
      const node = value as Record<string, unknown>;
      if (node.type === 'text' && typeof node.text === 'string') {
        const text = normalizeText(node.text);
        if (text.length > 0) values.push(text);
      }
      if (Array.isArray(node.content)) {
        for (let index = node.content.length - 1; index >= 0; index -= 1) {
          stack.push(node.content[index]);
        }
      }
    }
  }
  return values;
}

function containsTextInOrder(value: string, expected: readonly string[]) {
  const text = normalizeText(value);
  let offset = 0;
  return expected.every((part) => {
    const index = text.indexOf(part, offset);
    if (index < 0) return false;
    offset = index + part.length;
    return true;
  });
}

function waitForExpectedText(
  root: ParentNode,
  expected: readonly string[],
): Promise<void> {
  if (expected.length === 0) return Promise.resolve();

  const isReady = () => {
    const renderer = root.querySelector('.ak-renderer-document');
    return containsTextInOrder(renderer?.textContent ?? '', expected);
  };
  if (isReady()) return Promise.resolve();

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!isReady()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root as Node, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    if (isReady()) {
      observer.disconnect();
      resolve();
    }
  });
}

function waitForLazyContent(root: ParentNode): Promise<void> {
  if (root.querySelector('input[data-lazy-begin]') === null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (root.querySelector('input[data-lazy-begin]') !== null) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root as Node, { childList: true, subtree: true });
    if (root.querySelector('input[data-lazy-begin]') === null) {
      observer.disconnect();
      resolve();
    }
  });
}

export function createExportReadiness(document?: unknown): ExportReadiness {
  const expectedText = textNodesOf(document);
  let pendingMermaid = 0;
  const waiters = new Set<() => void>();

  const waitForMermaid = (): Promise<void> => {
    if (pendingMermaid === 0) return Promise.resolve();
    return new Promise((resolve) => waiters.add(resolve));
  };

  return Object.freeze({
    registerMermaid() {
      pendingMermaid += 1;
      let pending = true;
      return () => {
        if (!pending) return;
        pending = false;
        pendingMermaid -= 1;
        if (pendingMermaid === 0) {
          waiters.forEach((resolve) => resolve());
          waiters.clear();
        }
      };
    },

    async waitForStable(root: ParentNode, fontsReady: Promise<unknown>) {
      await waitForExpectedText(root, expectedText);
      await waitForLazyContent(root);
      await fontsReady;
      let imageFailures = 0;
      const images = Array.from(root.querySelectorAll('img'));
      await Promise.all(
        images.map(async (image) => {
          try {
            await image.decode();
          } catch {
            imageFailures += 1;
          }
        }),
      );
      await waitForMermaid();
      return (
        root.querySelectorAll('[data-export-lossy="true"]').length +
        imageFailures
      );
    },
  });
}
