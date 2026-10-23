import { redirect } from "next/navigation";
import { z } from "zod";
import { ROLES, ROLE_LABELS } from "@bbcare/core";
import { assertPermission, createStaffUser, listStaff, requireStaff, resetMfa, resetPassword, setRoles, setUserStatus } from "@/modules/identity/service";
import { AdminShell, StatusPill, Table, Td, adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

async function createAction(form: FormData) {
  "use server";
  const user = await assertPermission("users.manage");
  const p = z.object({ email: z.email().max(200), displayName: z.string().trim().min(2).max(100), password: z.string().min(12).max(200) }).safeParse(Object.fromEntries(form));
  const roles = form.getAll("roles").map(String).filter((r) => (ROLES as readonly string[]).includes(r));
  if (!p.success || roles.length === 0) redirect("/admin/users?e=invalid");
  try { await createStaffUser(user, { ...p.data, roles }); } catch { redirect("/admin/users?e=exists"); }
  redirect("/admin/users?ok=created");
}

async function manageAction(form: FormData) {
  "use server";
  const actor = await assertPermission("users.manage");
  const id = String(form.get("id"));
  const op = String(form.get("op"));
  try {
    if (op === "roles") await setRoles(actor, id, form.getAll("roles").map(String).filter((r) => (ROLES as readonly string[]).includes(r)));
    else if (op === "disable") await setUserStatus(actor, id, "disabled");
    else if (op === "enable") await setUserStatus(actor, id, "active");
    else if (op === "mfa") await resetMfa(actor, id);
    else if (op === "password") {
      const pw = String(form.get("password") ?? "");
      if (pw.length < 12) redirect("/admin/users?e=password");
      await resetPassword(actor, id, pw);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("cannot_")) redirect(`/admin/users?e=${err.message}`);
    throw err;
  }
  redirect("/admin/users?ok=1");
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const user = await requireStaff("users.manage");
  const rows = await listStaff();
  const { e, ok } = await searchParams;
  return (
    <AdminShell user={user} title="Users">
      {e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">Could not save: {e.replace(/_/g, " ")}.</p> : null}
      {ok ? <p role="status" className="mb-4 rounded-lg border border-olive-soft bg-olive-soft px-3 py-2 text-sm text-olive-dark">Saved.</p> : null}
      <Table head={["Name", "Email", "Status", "MFA", "Roles", "Actions"]}>
        {rows.map((u) => (
          <tr key={u.id}>
            <Td>{u.display_name}</Td><Td>{u.email}</Td><Td><StatusPill status={u.status} /></Td><Td>{u.mfa ? "on" : <span className="text-warn">not enrolled</span>}</Td>
            <Td>
              <form action={manageAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={u.id} /><input type="hidden" name="op" value="roles" />
                {ROLES.map((r) => <label key={r} className="flex items-center gap-1 text-xs"><input type="checkbox" name="roles" value={r} defaultChecked={u.roles?.includes(r)} />{ROLE_LABELS[r]}</label>)}
                <button className="rounded border border-line px-2 text-xs">Save roles</button>
              </form>
            </Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                <form action={manageAction}><input type="hidden" name="id" value={u.id} /><button name="op" value={u.status === "active" ? "disable" : "enable"} className="rounded border border-line px-2 text-xs">{u.status === "active" ? "Disable" : "Enable"}</button></form>
                <form action={manageAction}><input type="hidden" name="id" value={u.id} /><button name="op" value="mfa" className="rounded border border-line px-2 text-xs">Reset MFA</button></form>
                <form action={manageAction} className="flex gap-1"><input type="hidden" name="id" value={u.id} /><input type="hidden" name="op" value="password" /><input name="password" type="password" minLength={12} placeholder="New password" autoComplete="new-password" className="min-h-8 w-28 rounded border border-line px-1 text-xs" /><button className="rounded border border-line px-2 text-xs">Set</button></form>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <form action={createAction} className="mt-8 grid max-w-2xl gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 text-sm">
        <h2 className="font-semibold">Add staff member</h2>
        <label>Name<input name="displayName" required className={adminInput} /></label>
        <label>Email<input name="email" type="email" required className={adminInput} /></label>
        <label>Temporary password (at least 12 characters; share securely, not by chat)<input name="password" type="password" minLength={12} required autoComplete="new-password" className={adminInput} /></label>
        <fieldset className="flex flex-wrap gap-3"><legend className="mb-1">Roles</legend>{ROLES.map((r) => <label key={r} className="flex items-center gap-1"><input type="checkbox" name="roles" value={r} />{ROLE_LABELS[r]}</label>)}</fieldset>
        <p className="text-xs text-muted">New staff must enrol two-factor authentication at first sign-in.</p>
        <button className={adminButton}>Create</button>
      </form>
    </AdminShell>
  );
}
