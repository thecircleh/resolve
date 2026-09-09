// Per-user rate limiting.
//
// Serverless-safe: limits are computed from the Message table rather than
// an in-memory counter, so they work correctly across Vercel's distributed
// function instances without needing Redis.
//
// Two limits, both configurable by env var:
//   RATE_LIMIT_PER_MINUTE (default 6)  — protects against runaway loops
//   RATE_LIMIT_PER_DAY    (default 200) — caps daily API spend per user

import { db } from "./db";

const PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE || "6", 10);
const PER_DAY = parseInt(process.env.RATE_LIMIT_PER_DAY || "200", 10);

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const now = Date.now();
  const oneMinuteAgo = new Date(now - 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [minuteCount, dayCount] = await Promise.all([
    db.message.count({
      where: {
        role: "USER",
        createdAt: { gte: oneMinuteAgo },
        session: { userId },
      },
    }),
    db.message.count({
      where: {
        role: "USER",
        createdAt: { gte: oneDayAgo },
        session: { userId },
      },
    }),
  ]);

  if (minuteCount >= PER_MINUTE) {
    return {
      allowed: false,
      reason:
        "You're sending messages faster than the system can process them. Wait a moment and try again.",
    };
  }

  if (dayCount >= PER_DAY) {
    return {
      allowed: false,
      reason:
        "You've reached the daily message limit for the beta. It resets in 24 hours. If you need more capacity, contact the program administrator.",
    };
  }

  return { allowed: true };
}
