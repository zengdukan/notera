export interface ExportReadiness {
  registerMermaid(): () => void;
  waitForStable(
    root: ParentNode,
    fontsReady: Promise<unknown>,
  ): Promise<number>;
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

export function createExportReadiness(): ExportReadiness {
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
