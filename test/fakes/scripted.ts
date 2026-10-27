/**
 * Shared machinery for the port fakes (TASK-012): a scripted method that records
 * calls, can answer immediately or hold calls pending, and observes aborts.
 */

export interface RecordedCall<A extends unknown[], R> {
  readonly args: A;
  readonly signal: AbortSignal | undefined;
  /** True once the signal passed to this call has aborted. */
  readonly aborted: boolean;
  /** True once the call's promise has been settled. */
  readonly settled: boolean;
  /** Settle a held call. Ignored if already settled. */
  resolve(result: R): void;
  /** Reject a held call (simulates a port that violates its no-throw contract). */
  reject(reason: unknown): void;
}

type Responder<A extends unknown[], R> = R | ((...args: A) => R);

export class ScriptedMethod<A extends unknown[], R> {
  private responder: Responder<A, R>;
  private failure: { reason: unknown } | undefined;
  private holding = false;
  private readonly all: Array<RecordedCall<A, R>> = [];

  /**
   * @param defaultResponse value (or function of the args) returned for calls
   * @param abortResult if given, a held call settles with this when its signal aborts
   */
  constructor(
    defaultResponse: Responder<A, R>,
    private readonly abortResult?: () => R,
  ) {
    this.responder = defaultResponse;
  }

  /** Every call made so far, in order. */
  get calls(): ReadonlyArray<RecordedCall<A, R>> {
    return this.all;
  }

  get callCount(): number {
    return this.all.length;
  }

  /** Calls whose promise has not settled yet. */
  get pending(): ReadonlyArray<RecordedCall<A, R>> {
    return this.all.filter((c) => !c.settled);
  }

  /** Change what un-held calls return. */
  respondWith(response: Responder<A, R>): void {
    this.responder = response;
    this.failure = undefined;
  }

  /** Make subsequent calls reject their promise. */
  failWith(reason: unknown): void {
    this.failure = { reason };
  }

  /** Make subsequent calls stay pending until resolved by the test. */
  hold(): void {
    this.holding = true;
  }

  /** Stop holding; already-held calls stay pending. */
  release(): void {
    this.holding = false;
  }

  /** Resolve the oldest pending call. Throws if none is pending. */
  resolveNext(result: R): void {
    const next = this.pending[0];
    if (next === undefined) throw new Error('No pending call to resolve');
    next.resolve(result);
  }

  reset(): void {
    this.all.length = 0;
    this.holding = false;
    this.failure = undefined;
  }

  invoke(args: A, signal?: AbortSignal): Promise<R> {
    let settleResolve!: (value: R) => void;
    let settleReject!: (reason: unknown) => void;
    const promise = new Promise<R>((resolve, reject) => {
      settleResolve = resolve;
      settleReject = reject;
    });
    let settled = false;
    const call: RecordedCall<A, R> = {
      args,
      signal,
      get aborted() {
        return signal?.aborted === true;
      },
      get settled() {
        return settled;
      },
      resolve: (result) => {
        if (settled) return;
        settled = true;
        settleResolve(result);
      },
      reject: (reason) => {
        if (settled) return;
        settled = true;
        settleReject(reason);
      },
    };
    this.all.push(call);

    if (signal !== undefined && this.abortResult !== undefined) {
      const abortResult = this.abortResult;
      if (signal.aborted) {
        call.resolve(abortResult());
        return promise;
      }
      signal.addEventListener('abort', () => call.resolve(abortResult()), { once: true });
    }

    if (this.holding) return promise;
    if (this.failure !== undefined) {
      call.reject(this.failure.reason);
      return promise;
    }
    const response = this.responder;
    call.resolve(typeof response === 'function' ? (response as (...a: A) => R)(...args) : response);
    return promise;
  }
}
