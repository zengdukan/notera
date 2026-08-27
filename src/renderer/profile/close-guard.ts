export type CloseFailureChoice = 'retry' | 'discard' | 'stay';

export async function handleCloseRequest(input: {
  readonly requestId: string;
  readonly isDirty: () => boolean;
  readonly flush: () => Promise<void>;
  readonly chooseAfterFailure: () => Promise<CloseFailureChoice>;
  readonly complete: (value: {
    readonly requestId: string;
    readonly action: 'proceed' | 'cancel';
  }) => Promise<unknown> | unknown;
}): Promise<void> {
  if (!input.isDirty()) {
    await input.complete({ requestId: input.requestId, action: 'proceed' });
    return;
  }

  for (;;) {
    try {
      await input.flush();
      await input.complete({ requestId: input.requestId, action: 'proceed' });
      return;
    } catch {
      const choice = await input.chooseAfterFailure();
      if (choice === 'retry') continue;
      await input.complete({
        requestId: input.requestId,
        action: choice === 'discard' ? 'proceed' : 'cancel',
      });
      return;
    }
  }
}
