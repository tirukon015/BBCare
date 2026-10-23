import { secureCookies } from "@/lib/cookie-security";
import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  classifyUserAgent, decryptSecret, encryptSecret, hashPassword, newRecoveryCodes, newToken, newTotpSecret,
  permissionsFor, sha256, verifyPassword, verifyTotp, type Permission,
} from "@bbcare/core";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit/service";

export const STAFF_COOKIE = "bbcare_staff";
const IDLE_MINUTES = 60;
const ABSOLUTE_HOURS = 12;
const LOCK_AFTER = 8;

export interface StaffUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: Set<Permission>;
  mfaEnrolled: boolean;
  mfaVerified: boolean;
  sessionId: string;
}

async function setCookie(token: string) {
  (await cookies()).set(STAFF_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "strict",
    path: "/",
    maxAge: ABSOLUTE_HOURS * 3600,
  });
}

export async function clearStaffCookie() {
  (await cookies()).delete(STAFF_COOKIE);
}

export type LoginResult = { ok: true } | { ok: false; reason: "invalid" | "locked" | "disabled" };

/** Password step. On success a session exists but is not MFA-verified yet. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const sql = db();
  const [u] = await sql<{ id: string; password_hash: string; status: string; failed_logins: number; locked_until: Date | null }[]>`
    SELECT id, password_hash, status, failed_logins, locked_until FROM identity.users WHERE lower(email) = lower(${email})`;
  // Constant-ish work even for unknown users.
  const valid = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA"), false);
  if (!u) return { ok: false, reason: "invalid" };
  if (u.locked_until && u.locked_until > new Date()) {
    await audit({ actorId: u.id, action: "auth.login_locked" });
    return { ok: false, reason: "locked" };
  }
  if (!valid) {
    const failures = u.failed_logins + 1;
    await sql`UPDATE identity.users SET failed_logins = ${failures}, locked_until = ${failures >= LOCK_AFTER ? new Date(Date.now() + 15 * 60_000) : null} WHERE id = ${u.id}`;
    await audit({ actorId: u.id, action: "auth.login_failed", summary: { failures } });
    return { ok: false, reason: "invalid" };
  }
  if (u.status !== "active") {
    await audit({ actorId: u.id, action: "auth.login_disabled_account" });
    return { ok: false, reason: "disabled" };
  }
  const h = await headers();
  const device = classifyUserAgent(h.get("user-agent"));
  const { token, hash } = newToken();
  await sql`UPDATE identity.users SET failed_logins = 0, locked_until = NULL WHERE id = ${u.id}`;
  await sql`
    INSERT INTO identity.sessions (user_id, token_hash, expires_at, device)
    VALUES (${u.id}, ${hash}, now() + ${`${ABSOLUTE_HOURS} hours`}::interval, ${`${device.browserFamily}/${device.osFamily}`})`;
  await setCookie(token);
  await audit({ actorId: u.id, action: "auth.password_ok" });
  return { ok: true };
}

/** Resolve the current staff session from the cookie. Expired or idle sessions are rejected. */
export async function currentStaff(): Promise<StaffUser | null> {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sql = db();
  const [row] = await sql<{ session_id: string; mfa_verified: boolean; last_seen_at: Date; id: string; email: string; display_name: string; totp_enabled_at: Date | null; status: string; roles: string[] | null }[]>`
    SELECT s.id AS session_id, s.mfa_verified, s.last_seen_at, u.id, u.email, u.display_name, u.totp_enabled_at, u.status,
           (SELECT array_agg(role) FROM identity.user_roles r WHERE r.user_id = u.id) AS roles
    FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > now()`;
  if (!row || row.status !== "active") return null;
  if (Date.now() - row.last_seen_at.getTime() > IDLE_MINUTES * 60_000) {
    await sql`DELETE FROM identity.sessions WHERE id = ${row.session_id}`;
    return null;
  }
  if (Date.now() - row.last_seen_at.getTime() > 60_000) await sql`UPDATE identity.sessions SET last_seen_at = now() WHERE id = ${row.session_id}`;
  const roles = row.roles ?? [];
  return {
    id: row.id, email: row.email, displayName: row.display_name, roles, permissions: permissionsFor(roles),
    mfaEnrolled: !!row.totp_enabled_at, mfaVerified: row.mfa_verified, sessionId: row.session_id,
  };
}

/** Use in admin pages and actions: requires a fully MFA-verified session and the permission. */
export async function requireStaff(permission?: Permission): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  if (!user.mfaEnrolled) redirect("/admin/mfa/setup");
  if (!user.mfaVerified) redirect("/admin/mfa");
  if (permission && !user.permissions.has(permission)) redirect("/admin?denied=1");
  return user;
}

/** For server actions: throws instead of redirecting when permission is missing. */
export async function assertPermission(permission: Permission): Promise<StaffUser> {
  const user = await currentStaff();
  if (!user || !user.mfaEnrolled || !user.mfaVerified) throw new Error("unauthenticated");
  if (!user.permissions.has(permission)) {
    await audit({ actorId: user.id, action: "auth.permission_denied", summary: { permission } });
    throw new Error("forbidden");
  }
  return user;
}

// ---- MFA ----

export async function beginTotpEnrollment(user: StaffUser): Promise<{ secret: string; uri: string }> {
  const secret = newTotpSecret();
  await db()`UPDATE identity.users SET totp_secret_enc = ${encryptSecret(secret, env().BBCARE_ENCRYPTION_KEY)}, totp_enabled_at = NULL WHERE id = ${user.id} AND totp_enabled_at IS NULL`;
  const { totpUri } = await import("@bbcare/core");
  return { secret, uri: totpUri(secret, user.email) };
}

export async function confirmTotpEnrollment(user: StaffUser, code: string): Promise<string[] | null> {
  const sql = db();
  const [u] = await sql<{ totp_secret_enc: string | null }[]>`SELECT totp_secret_enc FROM identity.users WHERE id = ${user.id} AND totp_enabled_at IS NULL`;
  if (!u?.totp_secret_enc) return null;
  const counter = verifyTotp(decryptSecret(u.totp_secret_enc, env().BBCARE_ENCRYPTION_KEY), code);
  if (counter === null) return null;
  const codes = newRecoveryCodes();
  await sql.begin(async (tx) => {
    await tx`UPDATE identity.users SET totp_enabled_at = now(), totp_last_counter = ${counter} WHERE id = ${user.id}`;
    await tx`DELETE FROM identity.recovery_codes WHERE user_id = ${user.id}`;
    for (const c of codes) await tx`INSERT INTO identity.recovery_codes (user_id, code_hash) VALUES (${user.id}, ${sha256(c)})`;
    await tx`UPDATE identity.sessions SET mfa_verified = true WHERE id = ${user.sessionId}`;
    await audit({ actorId: user.id, action: "auth.mfa_enrolled" }, tx);
  });
  return codes;
}

/** Second factor at login: TOTP code (reuse of a counter is rejected) or a single-use recovery code. */
export async function verifySecondFactor(user: StaffUser, code: string): Promise<boolean> {
  const sql = db();
  const clean = code.trim().toLowerCase();
  if (/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(clean)) {
    const [rc] = await sql<{ id: string }[]>`
      UPDATE identity.recovery_codes SET used_at = now() WHERE user_id = ${user.id} AND code_hash = ${sha256(clean)} AND used_at IS NULL RETURNING id`;
    if (!rc) { await audit({ actorId: user.id, action: "auth.mfa_failed", summary: { method: "recovery" } }); return false; }
    await sql`UPDATE identity.sessions SET mfa_verified = true WHERE id = ${user.sessionId}`;
    await audit({ actorId: user.id, action: "auth.mfa_ok", summary: { method: "recovery" } });
    return true;
  }
  const [u] = await sql<{ totp_secret_enc: string | null; totp_last_counter: string | null }[]>`
    SELECT totp_secret_enc, totp_last_counter::text FROM identity.users WHERE id = ${user.id} AND totp_enabled_at IS NOT NULL`;
  if (!u?.totp_secret_enc) return false;
  const counter = verifyTotp(decryptSecret(u.totp_secret_enc, env().BBCARE_ENCRYPTION_KEY), clean);
  if (counter === null || (u.totp_last_counter !== null && counter <= Number(u.totp_last_counter))) {
    await audit({ actorId: user.id, action: "auth.mfa_failed", summary: { method: "totp" } });
    return false;
  }
  // Rotate the session token after full authentication to prevent fixation.
  const { token, hash } = newToken();
  await sql`UPDATE identity.users SET totp_last_counter = ${counter} WHERE id = ${user.id}`;
  await sql`UPDATE identity.sessions SET mfa_verified = true, token_hash = ${hash}, last_seen_at = now() WHERE id = ${user.sessionId}`;
  await setCookie(token);
  await audit({ actorId: user.id, action: "auth.mfa_ok", summary: { method: "totp" } });
  return true;
}

export async function logout() {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (token) await db()`DELETE FROM identity.sessions WHERE token_hash = ${sha256(token)}`;
  await clearStaffCookie();
}

// ---- User administration ----

export async function createStaffUser(actor: StaffUser, input: { email: string; displayName: string; password: string; roles: string[] }) {
  const hash = await hashPassword(input.password);
  const sql = db();
  return sql.begin(async (tx) => {
    const [u] = await tx<{ id: string }[]>`
      INSERT INTO identity.users (email, display_name, password_hash) VALUES (${input.email}, ${input.displayName}, ${hash}) RETURNING id`;
    for (const r of input.roles) await tx`INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES (${u!.id}, ${r}, ${actor.id})`;
    await audit({ actorId: actor.id, action: "users.create", entityType: "user", entityId: u!.id, summary: { roles: input.roles } }, tx);
    return u!.id;
  });
}

export async function listStaff() {
  return db()<{ id: string; email: string; display_name: string; status: string; roles: string[] | null; mfa: boolean; last_seen: Date | null }[]>`
    SELECT u.id, u.email, u.display_name, u.status, (SELECT array_agg(role ORDER BY role) FROM identity.user_roles r WHERE r.user_id = u.id) AS roles,
           u.totp_enabled_at IS NOT NULL AS mfa, (SELECT max(last_seen_at) FROM identity.sessions s WHERE s.user_id = u.id) AS last_seen
    FROM identity.users u ORDER BY u.display_name`;
}

export async function setRoles(actor: StaffUser, userId: string, roles: string[]) {
  if (actor.id === userId && !roles.includes("admin")) throw new Error("cannot_remove_own_admin");
  await db().begin(async (tx) => {
    await tx`DELETE FROM identity.user_roles WHERE user_id = ${userId}`;
    for (const r of roles) await tx`INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES (${userId}, ${r}, ${actor.id})`;
    await tx`DELETE FROM identity.sessions WHERE user_id = ${userId} AND user_id <> ${actor.id}`;
    await audit({ actorId: actor.id, action: "users.roles_set", entityType: "user", entityId: userId, summary: { roles } }, tx);
  });
}

export async function setUserStatus(actor: StaffUser, userId: string, status: "active" | "disabled") {
  if (actor.id === userId) throw new Error("cannot_disable_self");
  await db()`UPDATE identity.users SET status = ${status} WHERE id = ${userId}`;
  if (status === "disabled") await db()`DELETE FROM identity.sessions WHERE user_id = ${userId}`;
  await audit({ actorId: actor.id, action: "users.status_set", entityType: "user", entityId: userId, summary: { status } });
}

export async function resetMfa(actor: StaffUser, userId: string) {
  await db()`UPDATE identity.users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_counter = NULL WHERE id = ${userId}`;
  await db()`DELETE FROM identity.recovery_codes WHERE user_id = ${userId}`;
  await db()`DELETE FROM identity.sessions WHERE user_id = ${userId}`;
  await audit({ actorId: actor.id, action: "users.mfa_reset", entityType: "user", entityId: userId });
}

export async function resetPassword(actor: StaffUser, userId: string, password: string) {
  const hash = await hashPassword(password);
  await db()`UPDATE identity.users SET password_hash = ${hash}, failed_logins = 0, locked_until = NULL WHERE id = ${userId}`;
  await db()`DELETE FROM identity.sessions WHERE user_id = ${userId}`;
  await audit({ actorId: actor.id, action: "users.password_reset", entityType: "user", entityId: userId });
}

export async function changeOwnPassword(user: StaffUser, current: string, next: string): Promise<boolean> {
  const [u] = await db()<{ password_hash: string }[]>`SELECT password_hash FROM identity.users WHERE id = ${user.id}`;
  if (!u || !(await verifyPassword(current, u.password_hash))) return false;
  await db()`UPDATE identity.users SET password_hash = ${await hashPassword(next)} WHERE id = ${user.id}`;
  await db()`DELETE FROM identity.sessions WHERE user_id = ${user.id} AND id <> ${user.sessionId}`;
  await audit({ actorId: user.id, action: "auth.password_changed" });
  return true;
}
