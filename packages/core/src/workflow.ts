import type { Permission } from "./rbac";

/** Knowledge revision states from docs/project/02-product-requirements.md. */
export const REVISION_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "published",
  "rejected",
  "archived",
  "superseded",
] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export type RevisionAction = "submit" | "approve" | "reject" | "publish" | "archive" | "reopen";

interface Transition {
  from: readonly RevisionStatus[];
  to: RevisionStatus;
  permission: Permission;
}

const TRANSITIONS: Record<RevisionAction, Transition> = {
  submit: { from: ["draft"], to: "in_review", permission: "knowledge.write" },
  approve: { from: ["in_review"], to: "approved", permission: "knowledge.review" },
  reject: { from: ["in_review"], to: "rejected", permission: "knowledge.review" },
  publish: { from: ["approved"], to: "published", permission: "knowledge.publish" },
  archive: { from: ["published", "approved", "draft", "rejected"], to: "archived", permission: "knowledge.publish" },
  reopen: { from: ["rejected"], to: "draft", permission: "knowledge.write" },
};

export interface TransitionContext {
  action: RevisionAction;
  current: RevisionStatus;
  actorId: string;
  authorId: string;
  actorPermissions: ReadonlySet<Permission>;
  /** Admins may self-approve; such approvals are flagged in the audit log. */
  actorIsAdmin: boolean;
}

export type TransitionResult =
  | { ok: true; to: RevisionStatus; selfApproved: boolean }
  | { ok: false; reason: "invalid_transition" | "forbidden" | "separation_of_duties" };

export function evaluateTransition(ctx: TransitionContext): TransitionResult {
  const t = TRANSITIONS[ctx.action];
  if (!t.from.includes(ctx.current)) return { ok: false, reason: "invalid_transition" };
  if (!ctx.actorPermissions.has(t.permission)) return { ok: false, reason: "forbidden" };
  const isReviewStep = ctx.action === "approve";
  const selfReview = isReviewStep && ctx.actorId === ctx.authorId;
  if (selfReview && !ctx.actorIsAdmin) return { ok: false, reason: "separation_of_duties" };
  return { ok: true, to: t.to, selfApproved: selfReview };
}

/** Content of revisions in these states may never change. */
export const IMMUTABLE_STATUSES: readonly RevisionStatus[] = ["approved", "published", "superseded", "archived"];

/** Only published content may be used for customer-facing retrieval. */
export function isCustomerVisible(status: RevisionStatus): boolean {
  return status === "published";
}
