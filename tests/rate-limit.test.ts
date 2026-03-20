import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Test rate limiting logic directly (unit test, no DB needed)
describe('Rate Limiting', () => {
  let limiter: RateLimiterMemory;

  beforeEach(() => {
    limiter = new RateLimiterMemory({
      points: 3,
      duration: 60,
      keyPrefix: 'test',
    });
  });

  it('allows requests under the limit', async () => {
    await expect(limiter.consume('test-ip')).resolves.toBeDefined();
    await expect(limiter.consume('test-ip')).resolves.toBeDefined();
    await expect(limiter.consume('test-ip')).resolves.toBeDefined();
  });

  it('blocks requests over the limit', async () => {
    await limiter.consume('test-ip');
    await limiter.consume('test-ip');
    await limiter.consume('test-ip');
    await expect(limiter.consume('test-ip')).rejects.toThrow();
  });

  it('isolates rate limits per IP', async () => {
    await limiter.consume('ip-1');
    await limiter.consume('ip-1');
    await limiter.consume('ip-1');

    // ip-2 should still be allowed
    await expect(limiter.consume('ip-2')).resolves.toBeDefined();
  });
});
