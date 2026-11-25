const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket shared by every upstream call in the process.
 * Acquires are serialized so parallel tool calls can't overspend the burst.
 */
export class TokenBucket {
  private tokens: number;
  private updatedAt: number;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly rps: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    if (!(rps > 0) || !(burst > 0)) {
      throw new Error("rate limit rps and burst must be positive.");
    }
    this.tokens = burst;
    this.updatedAt = this.now();
  }

  acquire(): Promise<void> {
    const run = this.chain.then(() => this.take());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private refill(): void {
    const current = this.now();
    const elapsedSec = Math.max(0, current - this.updatedAt) / 1000;
    this.updatedAt = current;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.rps);
  }

  private async take(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.max(1, Math.ceil(((1 - this.tokens) / this.rps) * 1000));
    await this.sleep(waitMs);
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}
