/**
 * A read-write lock for one key slot: any number of runs choosing a key at
 * once, or one key change alone. Waiters are served in arrival order, so a
 * key change waiting on runs holds back the runs that arrive after it.
 */
export class SlotLock {
  private readers = 0;
  private writer = false;
  private queue: { write: boolean; grant: () => void }[] = [];

  /** Shared: a run choosing its key and recording its job. */
  shared<T>(work: () => Promise<T>) {
    return this.run(false, work);
  }
  /** Exclusive: a key saved or removed. */
  exclusive<T>(work: () => Promise<T>) {
    return this.run(true, work);
  }

  private async run<T>(write: boolean, work: () => Promise<T>) {
    if (this.queue.length === 0 && this.free(write)) this.take(write);
    else await new Promise<void>((grant) => this.queue.push({ write, grant }));
    try {
      return await work();
    } finally {
      if (write) this.writer = false;
      else this.readers--;
      this.drain();
    }
  }
  private free(write: boolean) {
    return write ? !this.writer && this.readers === 0 : !this.writer;
  }
  private take(write: boolean) {
    if (write) this.writer = true;
    else this.readers++;
  }
  private drain() {
    while (this.queue.length > 0 && this.free(this.queue[0].write)) {
      const next = this.queue.shift()!;
      this.take(next.write);
      next.grant();
    }
  }
}
