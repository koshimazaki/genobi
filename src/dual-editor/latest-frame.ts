/** Serial decoding with one replaceable pending request; stale results never publish. */
export class LatestFrame<T, R> {
  private wanted: { value: T } | null = null;
  private running = false;
  constructor(
    private decode: (value: T) => Promise<R>,
    private publish: (value: T, result: R) => void,
    private fail: (value: T, error: unknown) => void,
  ) {}
  clear() {
    this.wanted = null;
  }
  async request(value: T) {
    this.wanted = { value };
    if (this.running) return;
    this.running = true;
    try {
      while (this.wanted) {
        const request: { value: T } = this.wanted;
        try {
          const result = await this.decode(request.value);
          if (this.wanted === request) this.publish(request.value, result);
        } catch (error) {
          if (this.wanted === request) this.fail(request.value, error);
        }
        if (this.wanted === request) this.wanted = null;
      }
    } finally {
      this.running = false;
    }
  }
}
