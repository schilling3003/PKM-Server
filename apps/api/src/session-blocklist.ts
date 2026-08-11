import type { RedisClient } from './rate-limit.js';

export interface SessionBlocklist {
  block(token: string, ttlSeconds: number): Promise<void>;
  isBlocked(token: string): Promise<boolean>;
}

class RedisSessionBlocklist implements SessionBlocklist {
  constructor(private readonly redis: RedisClient) {}

  async block(token: string, ttlSeconds: number): Promise<void> {
    await this.redis.setEx(`pkm:session:blocklist:${token}`, ttlSeconds, '1');
  }

  async isBlocked(token: string): Promise<boolean> {
    const value = await this.redis.get(`pkm:session:blocklist:${token}`);
    return value === '1';
  }
}

class MemorySessionBlocklist implements SessionBlocklist {
  private readonly entries = new Map<string, number>();

  async block(token: string, ttlSeconds: number): Promise<void> {
    this.entries.set(token, Date.now() + ttlSeconds * 1000);
  }

  async isBlocked(token: string): Promise<boolean> {
    const expiry = this.entries.get(token);
    if (!expiry) return false;
    if (expiry <= Date.now()) {
      this.entries.delete(token);
      return false;
    }
    return true;
  }
}

export function createSessionBlocklist(redisClient?: RedisClient): SessionBlocklist {
  if (redisClient) {
    return new RedisSessionBlocklist(redisClient);
  }
  return new MemorySessionBlocklist();
}
