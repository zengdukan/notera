import { NoteWriteCoordinator } from '../note-write-coordinator';

describe('NoteWriteCoordinator', () => {
  it('serializes writes for one note while allowing other notes to proceed', async () => {
    const coordinator = new NoteWriteCoordinator();
    let release!: () => void;
    const first = coordinator.run('note-a', () => new Promise<string>((resolve) => {
      release = () => resolve('first');
    }));
    const secondOperation = jest.fn(async () => 'second');
    const second = coordinator.run('note-a', secondOperation);
    const otherOperation = jest.fn(async () => 'other');
    await expect(coordinator.run('note-b', otherOperation)).resolves.toBe('other');

    expect(otherOperation).toHaveBeenCalledTimes(1);
    expect(secondOperation).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });
});
