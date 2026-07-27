const DAY_MS = 24 * 60 * 60 * 1000;

function boundedDays(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

export function publicRetentionCutoffs({
  now = new Date(),
  historyRetentionDays = 90,
  tradeRetentionDays = 365,
} = {}) {
  const timestamp = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError("A valid retention timestamp is required");
  const historyDays = boundedDays(historyRetentionDays, 90, 7, 730);
  const tradeDays = boundedDays(tradeRetentionDays, 365, 30, 1460);
  return {
    historyRetentionDays: historyDays,
    tradeRetentionDays: tradeDays,
    historyCutoff: new Date(timestamp.getTime() - historyDays * DAY_MS).toISOString(),
    tradeCutoff: new Date(timestamp.getTime() - tradeDays * DAY_MS).toISOString(),
  };
}

export function runPublicRetention(db, options = {}) {
  const cutoffs = publicRetentionCutoffs(options);
  const statements = [
    ["activityEvents", "DELETE FROM activity_events WHERE occurred_at < ?", cutoffs.historyCutoff],
    ["marketEvents", "DELETE FROM market_events WHERE occurred_at < ?", cutoffs.historyCutoff],
    ["marketSnapshots", "DELETE FROM global_market_price_snapshots WHERE captured_at < ?", cutoffs.historyCutoff],
    ["marketTrades", "DELETE FROM market_trades WHERE occurred_at < ?", cutoffs.tradeCutoff],
  ];
  const deleted = {};
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [key, sql, cutoff] of statements) {
      deleted[key] = Number(db.prepare(sql).run(cutoff).changes ?? 0);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original retention failure.
    }
    throw error;
  }
  return { ...cutoffs, deleted };
}
