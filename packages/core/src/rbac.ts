/**
 * Role-based access control. Roles and their permissions are defined in code (reviewed
 * through Git); the database stores only which roles each staff user holds.
 */

export const PERMISSIONS = [
  "catalog.read",
  "catalog.write",
  "commerce.read",
  "commerce.write",
  "commerce.verify",
  "knowledge.read",
  "knowledge.write",
  "knowledge.review",
  "knowledge.publish",
  "knowledge.verify",
  "sources.upload",
  "cases.read_assigned",
  "cases.read_all",
  "cases.write",
  "support.transcripts.read",
  "analytics.read",
  "analytics.export",
  "ai.read",
  "ai.configure",
  "users.manage",
  "audit.read",
  "imports.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["admin", "editor", "reviewer", "support_agent", "analyst"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  editor: [
    "catalog.read",
    "catalog.write",
    "commerce.read",
    "commerce.write",
    "knowledge.read",
    "knowledge.write",
    "sources.upload",
    "analytics.read",
  ],
  reviewer: [
    "catalog.read",
    "commerce.read",
    "commerce.verify",
    "knowledge.read",
    "knowledge.review",
    "knowledge.publish",
    "knowledge.verify",
    "analytics.read",
  ],
  support_agent: [
    "catalog.read",
    "commerce.read",
    "knowledge.read",
    "cases.read_assigned",
    "cases.write",
    "support.transcripts.read",
  ],
  analyst: ["analytics.read", "analytics.export", "catalog.read", "commerce.read"],
};

export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    if ((ROLES as readonly string[]).includes(role)) {
      for (const p of ROLE_PERMISSIONS[role as Role]) out.add(p);
    }
  }
  return out;
}

export function can(roles: readonly string[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  editor: "Knowledge editor",
  reviewer: "Reviewer",
  support_agent: "Support agent",
  analyst: "Analyst",
};
