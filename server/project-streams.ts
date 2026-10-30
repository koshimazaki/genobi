// The open event streams of the project copies: who holds each one, so a
// session that loses access to a copy is cut off rather than kept informed.
import { AppError } from "./errors";
import type { CopyEvent } from "./projects";

export const STREAMS_PER_SESSION = 8;

interface Stream {
  sessionId: string;
  listener: (event: CopyEvent) => void;
  end: () => void;
}
type Admits = (sessionId: string) => boolean;

export class CopyStreams {
  private byCopy = new Map<string, Set<Stream>>();
  private perSession = new Map<string, number>();

  /** Open a stream on one copy; returns its unsubscribe. */
  open(
    key: string,
    sessionId: string,
    listener: Stream["listener"],
    close: () => void,
  ) {
    const count = this.perSession.get(sessionId) ?? 0;
    if (count >= STREAMS_PER_SESSION)
      throw new AppError(429, "Too many open project streams.", "stream_limit");
    this.perSession.set(sessionId, count + 1);
    const set = this.byCopy.get(key) ?? new Set();
    this.byCopy.set(key, set);
    let done = false;
    const unsubscribe = () => {
      if (done) return;
      done = true;
      set.delete(stream);
      this.perSession.set(sessionId, (this.perSession.get(sessionId) ?? 1) - 1);
    };
    const stream: Stream = {
      sessionId,
      listener,
      end: () => {
        unsubscribe();
        close();
      },
    };
    set.add(stream);
    return unsubscribe;
  }

  /** Close the streams of sessions the copy no longer admits. */
  revalidate(key: string, admits: Admits) {
    for (const stream of [...(this.byCopy.get(key) ?? [])])
      if (!admits(stream.sessionId)) stream.end();
  }

  /** Send to every stream the copy still admits, closing the others. */
  send(key: string, event: CopyEvent, admits: Admits) {
    this.revalidate(key, admits);
    for (const stream of [...(this.byCopy.get(key) ?? [])])
      stream.listener(event);
  }

  closeAll() {
    for (const set of this.byCopy.values())
      for (const stream of [...set]) stream.end();
  }
}
