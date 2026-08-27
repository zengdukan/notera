import { ExportOperationStore } from '../export-operation';

const first = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';

describe('ExportOperationStore', () => {
  it('accepts only matching progress and one terminal status, then clears on lock', () => {
    const store = new ExportOperationStore();
    store.track(first);
    store.applyProgress({
      operationId: other,
      kind: 'NOTE_EXPORT',
      phase: 'WRITING',
      progress: 0.5,
    });
    expect(store.getSnapshot()).toMatchObject({
      operationId: first,
      phase: 'PREPARING',
    });
    store.applyProgress({
      operationId: first,
      kind: 'NOTE_EXPORT',
      phase: 'WRITING',
      progress: 0.5,
    });
    expect(store.getSnapshot()).toMatchObject({
      phase: 'WRITING',
      progress: 0.5,
    });
    store.applyCompleted({
      operationId: first,
      kind: 'NOTE_EXPORT',
      state: 'CANCELLED',
    });
    store.applyProgress({
      operationId: first,
      kind: 'NOTE_EXPORT',
      phase: 'FINALIZING',
      progress: 1,
    });
    expect(store.getSnapshot()).toMatchObject({ state: 'CANCELLED' });
    store.clear();
    expect(store.getSnapshot()).toBeUndefined();
  });
});
