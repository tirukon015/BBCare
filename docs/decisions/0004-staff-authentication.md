# ADR 0004: Self-hosted staff authentication with mandatory TOTP

**Status:** Accepted, October 2026 (supersedes the earlier Better Auth proposal)

**Context:** Only staff authenticate in v1. Customers use anonymous support sessions. Requirements: strong password hashing, mandatory MFA for staff, server-side sessions, role-based permissions, auditability, no per-user fees, minimal dependency churn.

**Options:** Better Auth; Auth.js; hosted identity (Clerk, Auth0: paid, data held externally); a small in-house implementation on Node's crypto primitives.

**Decision:** In-house implementation using only `node:crypto`:
- Passwords: scrypt (N=2^15, r=8, p=1, 64-byte key, per-user random salt), constant-time comparison.
- Sessions: random 32-byte tokens in an httpOnly, Secure, SameSite=Lax cookie; only the SHA-256 hash is stored; idle and absolute expiry; rotation on login and privilege change.
- MFA: RFC 6238 TOTP (SHA-1, 30 s, 6 digits, plus or minus one step), mandatory before any admin access; secrets encrypted at rest with AES-256-GCM using a key from the environment; single-use recovery codes stored hashed.
- Login rate limiting and audit entries for every authentication event.

**Consequences:** No third-party auth dependency; full test coverage of the security-critical code is mandatory. Adding customer accounts or SSO later would be a new ADR.
