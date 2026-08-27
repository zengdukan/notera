export class LatestNoteRequest<Value> {
  private token = 0;

  constructor(
    private readonly request: (noteId: string) => Promise<Value>,
    private readonly apply: (noteId: string, value: Value) => void,
  ) {}

  async load(noteId: string): Promise<void> {
    const token = ++this.token;
    const value = await this.request(noteId);
    if (token === this.token) this.apply(noteId, value);
  }

  cancel(): void {
    this.token += 1;
  }
}
