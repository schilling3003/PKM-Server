import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { createClient } from 'redis';

export type RedisClient = ReturnType<typeof createClient>;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private readonly memory = new Map<string, number[]>();
  private readonly prefix: string;

  constructor(private readonly redisClient?: RedisClient, prefix = 'pkm:rl') {
    this.prefix = prefix;
  }

  async isAllowed(key: string, { maxRequests, windowMs }: RateLimitConfig): Promise<RateLimitResult> {
    if (this.redisClient) {
      return this.redisCheck(key, maxRequests, windowMs);
    }
    return this.memoryCheck(key, maxRequests, windowMs);
  }

  private memoryCheck(key: string, maxRequests: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = this.memory.get(key) ?? [];
    const valid = timestamps.filter((t) => t > cutoff);

    if (valid.length >= maxRequests) {
      const oldest = valid[0] ?? now - windowMs;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }

    valid.push(now);
    this.memory.set(key, valid);
    return { allowed: true };
  }

  private async redisCheck(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const member = `${now}:${randomUUID()}`;
    const fullKey = `${this.prefix}:${key}`;

    try {
      const result = (await this.redisClient!.eval(
        `local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local member = ARGV[4]
local windowStart = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)
if count >= maxRequests then
  return {0, count}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, math.ceil(windowMs / 1000))
return {1, count + 1}`,
        { keys: [fullKey], arguments: [String(windowMs), String(maxRequests), String(now), member] }
      )) as [number, number] | null;

      if (!result || result[0] !== 1) {
        return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
      }

      return { allowed: true };
    } catch (err) {
      // Fail open if Redis is unavailable so rate limiting does not become a hard outage.
      // The health endpoint still reports Redis state.
      console.warn('Rate limiter Redis error, allowing request', err);
      return { allowed: true };
    }
  }
}

export function createRateLimiter(redisClient?: RedisClient, prefix = 'pkm:rl'): RateLimiter {
  return new RateLimiter(redisClient, prefix);
}

function deny(reply: FastifyReply, config: RateLimitConfig, retryAfter?: number) {
  return reply
    .code(429)
    .header('Retry-After', String(retryAfter ?? Math.ceil(config.windowMs / 1000)))
    .send({ error: 'Too many requests' });
}

export function rateLimitByIp(limiter: RateLimiter, config: RateLimitConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = await limiter.isAllowed(`ip:${ip}`, config);
    if (!result.allowed) {
      return deny(reply, config, result.retryAfter);
    }
  };
}

export function rateLimitByAccount(
  limiter: RateLimiter,
  config: RateLimitConfig,
  keyGenerator: (req: FastifyRequest) => string
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const accountKey = keyGenerator(req);
    const result = await limiter.isAllowed(`acct:${accountKey}`, config);
    if (!result.allowed) {
      return deny(reply, config, result.retryAfter);
    }
  };
}
