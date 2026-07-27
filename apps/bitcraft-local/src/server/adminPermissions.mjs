export const ADMIN_ROLE_LABELS = {
  owner: "Owner",
  admin: "Administrator",
  viewer: "Viewer",
};

const ADMIN_ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: [
    "status.view",
    "server.monitor.view",
    "settings.view",
    "settings.manage",
    "data.view",
    "data.export",
    "data.manage",
    "analytics.view",
    "analytics.manage",
    "audit.view",
  ],
  viewer: ["status.view", "server.monitor.view", "settings.view", "data.view", "analytics.view", "audit.view"],
};

export function normalizeAdminRole(value) {
  const role = String(value ?? "viewer").trim().toLowerCase();
  return Object.hasOwn(ADMIN_ROLE_LABELS, role) ? role : "viewer";
}

export function adminPermissions(role) {
  return ADMIN_ROLE_PERMISSIONS[normalizeAdminRole(role)] ?? ADMIN_ROLE_PERMISSIONS.viewer;
}

export function adminHasPermission(user, permission) {
  const permissions = adminPermissions(user?.role);
  return permissions.includes("*") || permissions.includes(permission);
}

export function adminPermissionFor(method, pathname) {
  if (pathname === "/api/local/admin/me") return "status.view";
  if (pathname === "/api/local/admin/status") return "status.view";
  if (pathname === "/api/local/admin/claims" || pathname === "/api/local/admin/craft-plans" || pathname === "/api/local/admin/craft-plan-reports") {
    return method === "GET" ? "status.view" : "settings.manage";
  }
  if (pathname.startsWith("/api/local/admin/craft-plan-reports/")) return "settings.manage";
  if (pathname.startsWith("/api/local/admin/claims/") || pathname.startsWith("/api/local/admin/craft-plans/")) return "settings.manage";
  if (pathname === "/api/local/admin/server-health") return "server.monitor.view";
  if (pathname === "/api/local/admin/settings") return method === "GET" ? "settings.view" : "settings.manage";
  if (pathname === "/api/local/admin/popups") return method === "GET" ? "settings.view" : "settings.manage";
  if (pathname === "/api/local/admin/craft-plan/catalog-refresh") return method === "GET" ? "settings.view" : "settings.manage";
  if (pathname === "/api/local/admin/craft-plan/audit") return "audit.view";
  if (pathname === "/api/local/admin/craft-plan/progress-audit") return "audit.view";
  if (pathname === "/api/local/admin/craft-plan/progress-audit/export") return "data.export";
  if (pathname === "/api/local/admin/craft-plan") return method === "GET" ? "settings.view" : "settings.manage";
  if (pathname === "/api/local/admin/poll" || pathname === "/api/local/admin/collect-now" || pathname === "/api/local/admin/diagnostics") return "data.manage";
  if (pathname.startsWith("/api/local/admin/jobs")) return method === "GET" ? "status.view" : "data.manage";
  if (pathname === "/api/local/admin/branding") return "settings.manage";
  if (pathname === "/api/local/admin/users" || pathname === "/api/local/admin/user/status" || pathname === "/api/local/admin/user/role") return "users.manage";
  if (pathname === "/api/local/admin/sessions/clear") return "users.manage";
  if (pathname === "/api/local/admin/audit") return "audit.view";
  if (pathname === "/api/local/admin/analytics") return method === "DELETE" ? "analytics.manage" : "analytics.view";
  if (pathname === "/api/local/admin/visitor-security") return "analytics.view";
  if (pathname === "/api/local/admin/tables" || pathname === "/api/local/admin/table") return "data.view";
  if (pathname === "/api/local/admin/export") return "data.export";
  if (pathname === "/api/local/admin/backups" || pathname === "/api/local/admin/backup") return "data.manage";
  return "status.view";
}
