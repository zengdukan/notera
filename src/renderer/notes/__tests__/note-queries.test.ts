import { LatestNoteRequest } from '../note-queries';

describe('LatestNoteRequest', () => {
  it('ignores a late response for a previously selected note', async () => {
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const load = jest.fn((noteId: string) =>
      noteId === 'first' ? first : Promise.resolve('second-value'),
    );
    const apply = jest.fn();
    const requests = new LatestNoteRequest(load, apply);

    const firstRequest = requests.load('first');
    await requests.load('second');
    resolveFirst('first-value');
    await firstRequest;

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('second', 'second-value');
  });

  it('cancels the active selection token when the workspace is cleared', async () => {
    let resolvePending!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolvePending = resolve;
    });
    const apply = jest.fn();
    const requests = new LatestNoteRequest(() => pending, apply);

    const request = requests.load('note');
    requests.cancel();
    resolvePending('value');
    await request;

    expect(apply).not.toHaveBeenCalled();
  });
});
