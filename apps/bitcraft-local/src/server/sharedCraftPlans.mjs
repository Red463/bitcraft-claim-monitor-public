import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ACTIVE_PLANS = 25;
const MAX_CREATIONS_PER_HOUR = 3;

export class CraftPlanForbiddenError extends Error {
  constructor(message = "The plan edit key is invalid") {
    super(message);
    this.name = "CraftPlanForbiddenError";
    this.statusCode = 403;
  }
}

export class CraftPlanConflictError extends Error {
  constructor(message = "The plan has changed since it was loaded") {
    super(message);
    this.name = "CraftPlanConflictError";
    this.statusCode = 409;
  }
}

export class CraftPlanLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "CraftPlanLimitError";
    this.statusCode = 429;
  }
}

export class CraftPlanValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CraftPlanValidationError";
    this.statusCode = 400;
  }
}

function token(prefix) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function tokenHash(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function validClaimId(value) {
  const claimId = String(value ?? "").trim();
  if (!/^\d+$/.test(claimId)) throw new TypeError("A numeric claim ID is required");
  return claimId;
}

function boundedText(value, maximum, label, { required = false } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new TypeError(`${label} is required`);
  if (result.length > maximum) throw new TypeError(`${label} must be ${maximum} characters or fewer`);
  return result;
}

function publicPlan(row) {
  if (!row) return null;
  let config = {};
  try { config = JSON.parse(row.config_json); } catch {}
  return {
    planId: String(row.plan_id),
    claimId: String(row.claim_id),
    title: String(row.title),
    description: row.description == null ? null : String(row.description),
    config,
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
  };
}

export function createSharedCraftPlanRepository({
  db,
  now = () => new Date().toISOString(),
  randomToken = (purpose) => token(purpose),
}) {
  function raw(planId) {
    return db.prepare("SELECT * FROM craft_plans WHERE plan_id = ?").get(String(planId ?? "").trim());
  }

  function requirePlan(planId) {
    const row = raw(planId);
    if (!row) {
      const error = new Error("Plan not found");
      error.statusCode = 404;
      throw error;
    }
    return row;
  }

  function authorize(row, { editKey = "", admin = false } = {}) {
    if (admin) return;
    const supplied = Buffer.from(tokenHash(editKey), "hex");
    const expected = Buffer.from(String(row.edit_key_hash), "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new CraftPlanForbiddenError();
  }

  function list(claimId, { includeArchived = false } = {}) {
    const id = validClaimId(claimId);
    return db.prepare(`
      SELECT * FROM craft_plans
      WHERE claim_id = ? AND (? = 1 OR archived_at IS NULL)
      ORDER BY updated_at DESC, title COLLATE NOCASE ASC, plan_id ASC
    `).all(id, includeArchived ? 1 : 0).map(publicPlan);
  }

  function get(planId) {
    return publicPlan(raw(planId));
  }

  function adminList({ claimId = "", includeArchived = true } = {}) {
    const id = String(claimId ?? "").trim();
    const where = [
      id ? "claim_id = ?" : "1 = 1",
      includeArchived ? "1 = 1" : "archived_at IS NULL",
    ].join(" AND ");
    return db.prepare(`
      SELECT * FROM craft_plans WHERE ${where}
      ORDER BY updated_at DESC, plan_id ASC
    `).all(...(id ? [validClaimId(id)] : [])).map(publicPlan);
  }

  function reports({ status = "open", limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 100));
    const normalizedStatus = String(status ?? "").trim();
    return db.prepare(`
      SELECT id, plan_id, claim_id, reason, details, status, created_at, resolved_at, resolved_by
      FROM craft_plan_reports
      WHERE (? = '' OR status = ?)
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(normalizedStatus, normalizedStatus, safeLimit).map((row) => ({
      reportId: Number(row.id),
      planId: String(row.plan_id),
      claimId: String(row.claim_id),
      reason: String(row.reason),
      details: row.details == null ? null : String(row.details),
      status: String(row.status),
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
      resolvedBy: row.resolved_by == null ? null : Number(row.resolved_by),
    }));
  }

  function create({ claimId, title, description = "", config = {}, creatorKey = "" }) {
    const id = validClaimId(claimId);
    const safeTitle = boundedText(title, MAX_TITLE_LENGTH, "Title", { required: true });
    const safeDescription = boundedText(description, MAX_DESCRIPTION_LENGTH, "Description") || null;
    const safeCreatorKey = boundedText(creatorKey, 200, "Creator key", { required: true });
    const current = now();
    const cutoff = new Date(Date.parse(current) - 60 * 60 * 1000).toISOString();
    const recent = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM craft_plans WHERE creator_key = ? AND created_at >= ?
    `).get(safeCreatorKey, cutoff)?.count ?? 0);
    if (recent >= MAX_CREATIONS_PER_HOUR) throw new CraftPlanLimitError("A creator may create at most three plans per hour");
    const active = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM craft_plans WHERE claim_id = ? AND archived_at IS NULL
    `).get(id)?.count ?? 0);
    if (active >= MAX_ACTIVE_PLANS) throw new CraftPlanLimitError("A settlement may have at most 25 active plans");

    const planId = randomToken("plan");
    const editKey = randomToken("edit");
    db.prepare(`
      INSERT INTO craft_plans (
        plan_id, claim_id, title, description, config_json, revision,
        edit_key_hash, creator_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(planId, id, safeTitle, safeDescription, JSON.stringify(config ?? {}), tokenHash(editKey), safeCreatorKey, current, current);
    return { plan: get(planId), editKey };
  }

  function update(planId, input, authority = {}) {
    const row = requirePlan(planId);
    authorize(row, authority);
    const expectedRevision = Number(input?.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(row.revision)) throw new CraftPlanConflictError();
    const safeTitle = boundedText(input?.title ?? row.title, MAX_TITLE_LENGTH, "Title", { required: true });
    const safeDescription = boundedText(input?.description ?? row.description ?? "", MAX_DESCRIPTION_LENGTH, "Description") || null;
    const current = now();
    const result = db.prepare(`
      UPDATE craft_plans
      SET title = ?, description = ?, config_json = ?, revision = revision + 1, updated_at = ?
      WHERE plan_id = ? AND revision = ?
    `).run(safeTitle, safeDescription, JSON.stringify(input?.config ?? JSON.parse(row.config_json)), current, row.plan_id, expectedRevision);
    if (!result.changes) throw new CraftPlanConflictError();
    return get(row.plan_id);
  }

  function rotateKey(planId, authority = {}) {
    const row = requirePlan(planId);
    authorize(row, authority);
    const editKey = randomToken("edit");
    const current = now();
    db.prepare(`
      UPDATE craft_plans
      SET edit_key_hash = ?, revision = revision + 1, updated_at = ?
      WHERE plan_id = ?
    `).run(tokenHash(editKey), current, row.plan_id);
    return { plan: get(row.plan_id), editKey };
  }

  function archive(planId, authority = {}) {
    const row = requirePlan(planId);
    authorize(row, authority);
    const current = now();
    db.prepare(`
      UPDATE craft_plans SET archived_at = ?, revision = revision + 1, updated_at = ? WHERE plan_id = ?
    `).run(current, current, row.plan_id);
    return get(row.plan_id);
  }

  function hardDelete(planId, { admin = false } = {}) {
    if (!admin) throw new CraftPlanForbiddenError("Administrator authority is required");
    return db.prepare("DELETE FROM craft_plans WHERE plan_id = ?").run(String(planId ?? "").trim()).changes > 0;
  }

  function report(planId, { reporterKey, reason, details = "" }) {
    const row = requirePlan(planId);
    const safeReporter = boundedText(reporterKey, 200, "Reporter key", { required: true });
    const safeReason = boundedText(reason, 80, "Reason", { required: true });
    const safeDetails = boundedText(details, 500, "Details") || null;
    const createdAt = now();
    const recent = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM craft_plan_reports
      WHERE reporter_key = ? AND created_at >= ?
    `).get(safeReporter, new Date(Date.parse(createdAt) - 60 * 60 * 1000).toISOString())?.count ?? 0);
    if (recent >= 5) throw new CraftPlanLimitError("Too many plan reports; try again later");
    const result = db.prepare(`
      INSERT INTO craft_plan_reports (plan_id, claim_id, reporter_key, reason, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.plan_id, row.claim_id, safeReporter, safeReason, safeDetails, createdAt);
    return { reportId: Number(result.lastInsertRowid), createdAt };
  }

  function resolveReport(reportId, { adminId, status = "resolved" } = {}) {
    const id = Number(reportId);
    const resolver = Number(adminId);
    const normalizedStatus = status === "dismissed" ? "dismissed" : "resolved";
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(resolver) || resolver <= 0) {
      throw new CraftPlanValidationError("A valid report and administrator are required");
    }
    const resolvedAt = now();
    const result = db.prepare(`
      UPDATE craft_plan_reports
      SET status = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ? AND status = 'open'
    `).run(normalizedStatus, resolvedAt, resolver, id);
    if (!result.changes) throw new CraftPlanValidationError("Open plan report not found");
    return { reportId: id, status: normalizedStatus, resolvedAt, resolvedBy: resolver };
  }

  return { adminList, archive, create, get, hardDelete, list, report, reports, resolveReport, rotateKey, update };
}
