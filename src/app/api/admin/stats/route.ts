// Admin stats endpoint. See lib/admin.ts for how admin access is decided.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { estimateCostUsd } from "@/resolve/orchestrator";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    userCount,
    profileFinalizedCount,
    sessionCount,
    sessionsThisWeek,
    messagesToday,
    errorsToday,
    tokenAggDay,
    tokenAggWeek,
    recentErrors,
    recentSessions,
  ] = await Promise.all([
    db.user.count(),
    db.profile.count({ where: { status: "FINALIZED" } }),
    db.session.count(),
    db.session.count({ where: { createdAt: { gte: weekAgo } } }),
    db.message.count({ where: { createdAt: { gte: dayAgo }, role: "USER" } }),
    db.errorLog.count({ where: { createdAt: { gte: dayAgo } } }),
    db.message.aggregate({
      where: { createdAt: { gte: dayAgo }, role: "ASSISTANT" },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
    }),
    db.message.aggregate({
      where: { createdAt: { gte: weekAgo }, role: "ASSISTANT" },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
    }),
    db.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        state: true,
        laneClassification: true,
        tierClassification: true,
        updatedAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);

  const dayUsage = {
    inputTokens: tokenAggDay._sum.inputTokens ?? 0,
    outputTokens: tokenAggDay._sum.outputTokens ?? 0,
    cacheReadTokens: tokenAggDay._sum.cacheReadTokens ?? 0,
    cacheWriteTokens: tokenAggDay._sum.cacheWriteTokens ?? 0,
  };
  const weekUsage = {
    inputTokens: tokenAggWeek._sum.inputTokens ?? 0,
    outputTokens: tokenAggWeek._sum.outputTokens ?? 0,
    cacheReadTokens: tokenAggWeek._sum.cacheReadTokens ?? 0,
    cacheWriteTokens: tokenAggWeek._sum.cacheWriteTokens ?? 0,
  };

  return NextResponse.json({
    users: userCount,
    profilesFinalized: profileFinalizedCount,
    sessionsTotal: sessionCount,
    sessionsThisWeek,
    messagesToday,
    errorsToday,
    estSpendTodayUsd: Math.round(estimateCostUsd(dayUsage) * 100) / 100,
    estSpendWeekUsd: Math.round(estimateCostUsd(weekUsage) * 100) / 100,
    recentErrors: recentErrors.map(
      (e: {
        context: string;
        message: string;
        createdAt: Date;
      }) => ({
        context: e.context,
        message: e.message.slice(0, 300),
        createdAt: e.createdAt,
      }),
    ),
    recentSessions: recentSessions.map(
      (s: {
        id: string;
        title: string | null;
        state: string;
        laneClassification: string | null;
        tierClassification: string | null;
        updatedAt: Date;
        user: { email: string };
      }) => ({
        id: s.id,
        title: s.title,
        state: s.state,
        lane: s.laneClassification,
        tier: s.tierClassification,
        updatedAt: s.updatedAt,
        userEmail: s.user.email,
      }),
    ),
  });
}
