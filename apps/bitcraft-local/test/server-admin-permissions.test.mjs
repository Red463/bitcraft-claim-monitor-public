import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ROLE_LABELS,
  adminHasPermission,
  adminPermissionFor,
  adminPermissions,
  normalizeAdminRole,
} from "../src/server/adminPermissions.mjs";

test("admin role helpers preserve public labels and safe role fallback", () => {
  assert.deepEqual(ADMIN_ROLE_LABELS, {
    owner: "Owner",
    admin: "Administrator",
    viewer: "Viewer",
  });
  assert.equal(normalizeAdminRole(" OWNER "), "owner");
  assert.equal(normalizeAdminRole("discord-manager"), "viewer");
  assert.equal(normalizeAdminRole("unknown"), "viewer");
  assert.equal(normalizeAdminRole(null), "viewer");
});

test("admin permission helpers keep owner wildcard and public-operations roles scoped", () => {
  assert.deepEqual(adminPermissions("viewer"), ["status.view", "server.monitor.view", "settings.view", "data.view", "analytics.view", "audit.view"]);
  assert.equal(adminHasPermission({ role: "owner" }, "settings.manage"), true);
  assert.equal(adminHasPermission({ role: "admin" }, "data.export"), true);
  assert.equal(adminHasPermission({ role: "admin" }, "settings.manage"), true);
  assert.equal(adminHasPermission({ role: "admin" }, "users.manage"), false);
  assert.equal(adminHasPermission({ role: "viewer" }, "data.manage"), false);
  assert.equal(adminHasPermission({ role: "viewer" }, "server.monitor.view"), true);
  assert.equal(adminHasPermission(null, "status.view"), true);
});

test("adminPermissionFor maps admin routes to the existing least-privilege permissions", () => {
  assert.equal(adminPermissionFor("GET", "/api/local/admin/me"), "status.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/claims"), "status.view");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/claims/refresh"), "settings.manage");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plans"), "status.view");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/craft-plans/example/archive"), "settings.manage");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/craft-plan-reports/1/resolve"), "settings.manage");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/settings"), "settings.manage");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/settings"), "settings.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/catalog-refresh"), "settings.view");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/craft-plan/catalog-refresh"), "settings.manage");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/audit"), "audit.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/progress-audit"), "audit.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/craft-plan/progress-audit/export"), "data.export");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/jobs/run"), "data.manage");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/jobs"), "status.view");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/users"), "users.manage");
  assert.equal(adminPermissionFor("DELETE", "/api/local/admin/analytics"), "analytics.manage");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/analytics"), "analytics.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/tables"), "data.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/export"), "data.export");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/backups"), "data.manage");
  assert.equal(adminPermissionFor("POST", "/api/local/admin/maintenance/prune"), "status.view");
  assert.equal(adminPermissionFor("GET", "/api/local/admin/unknown"), "status.view");
});

test("server monitoring is read-only operational access for every administrator role", () => {
  assert.equal(adminPermissionFor("GET", "/api/local/admin/server-health"), "server.monitor.view");
  assert.equal(adminHasPermission({ role: "owner" }, "server.monitor.view"), true);
  assert.equal(adminHasPermission({ role: "admin" }, "server.monitor.view"), true);
  assert.equal(adminHasPermission({ role: "viewer" }, "server.monitor.view"), true);
});
