import { createExportBindings } from '../export-handlers';

const noteId = '10000000-0000-4000-8000-000000000001';

describe('export IPC binding', () => {
  it('uses the fixed contract and session gate', async () => {
    const coordinator = {
      start: jest.fn(async () => ({
        status: 'started' as const,
        operationId: '20000000-0000-4000-8000-000000000002',
      })),
      close: jest.fn(),
    };
    const gateRun = jest.fn();
    const gate = {
      async run<Result>(operation: () => Promise<Result> | Result) {
        gateRun();
        return operation();
      },
    };
    const [binding] = createExportBindings({ coordinator, gate });

    expect(binding.key).toBe('export.startNote');
    await expect(binding.invoke({ noteId, format: 'PDF' })).resolves.toEqual({
      status: 'started',
      operationId: '20000000-0000-4000-8000-000000000002',
    });
    expect(gateRun).toHaveBeenCalledTimes(1);
    expect(coordinator.start).toHaveBeenCalledWith({ noteId, format: 'PDF' });
  });
});
