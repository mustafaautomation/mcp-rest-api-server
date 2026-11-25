import { describe, expect, it } from "vitest";
import { TokenBucket } from "../src/api/rate-limit.js";

describe("token bucket", () => {
  it("waits once the burst is spent", async () => {
    let now = 0;
    const waits: number[] = [];
    const bucket = new TokenBucket(
      10,
      2,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );
    await bucket.acquire();
    await bucket.acquire();
    await bucket.acquire();
    expect(waits).toEqual([100]);
  });
});
