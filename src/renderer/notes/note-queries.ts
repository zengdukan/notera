export class LatestNoteRequest<Value> {
  private token = 0;

  private readonly request: (noteId: string) => Promise<Value>;

  private readonly apply: (noteId: string, value: Value) => void;

  constructor(
    request: (noteId: string) => Promise<Value>,
    apply: (noteId: string, value: Value) => void,
  ) {
    this.request = request;
    this.apply = apply;
  }

  async load(noteId: string): Promise<void> {
    this.token += 1;
    const { token } = this;
    const value = await this.request(noteId);
    if (token === this.token) this.apply(noteId, value);
  }

  cancel(): void {
    this.token += 1;
  }
}
