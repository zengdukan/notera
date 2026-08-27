export class NoteWriteCoordinator {
  private readonly tails = new Map<string, Promise<void>>();

  run<Result>(
    noteId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = this.tails.get(noteId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(noteId, tail);
    void tail.finally(() => {
      if (this.tails.get(noteId) === tail) this.tails.delete(noteId);
    });
    return result;
  }
}
