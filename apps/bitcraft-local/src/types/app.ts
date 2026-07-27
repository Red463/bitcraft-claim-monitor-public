import type { AnyRecord } from "../main-app-data";

export type ActivePanel =
  | "dashboard"
  | "leaderboard"
  | "members"
  | "skills"
  | "craft-monitor"
  | "planning"
  | "publiccrafts"
  | "inventory"
  | "construction"
  | "research"
  | "market"
  | "settlement-market"
  | "region"
  | "empires"
  | "map"
  | "activity"
  | "admin";

export type LoadState<T> = { data: T | null; error: string | null; loading: boolean; updatedAt?: string | null; cacheState?: string | null; stale?: boolean };

export type LocalHistoryState = {
  market: AnyRecord | null;
  activity: AnyRecord[];
  activityTotal: number;
  dashboard: AnyRecord | null;
  error: string | null;
  refreshToken: number;
};

export type NotificationActivityState = {
  events: AnyRecord[];
  total: number;
  error: string | null;
  refreshToken: number;
};
