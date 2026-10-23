import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentStaff, verifySecondFactor } from "@/modules/identity/service";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/request";
import { adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Two-factor authentication" };

async function verifyAction(form: FormData) {
  "use server";
  const user = await currentStaff();
  if (!user) redirect("/admin/login?e=expired");
  if (!(await rateLimit("login", `mfa:${clientIpFrom(await headers())}:${user.id}`))) redirect("/admin/mfa?e=rate");
  const code = String(form.get("code") ?? "").slice(0, 20);
  if (!(await verifySecondFactor(user, code))) redirect("/admin/mfa?e=invalid");
  redirect("/admin");
}

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  if (!user.mfaEnrolled) redirect("/admin/mfa/setup");
  if (user.mfaVerified) redirect("/admin");
  const { e } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">Two-factor authentication</h1>
      <p className="mb-6 text-sm text-muted">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
      {e ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{e === "rate" ? "Too many attempts. Please wait." : "That code is not valid."}</p> : null}
      <form action={verifyAction} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium">Code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={20} className={adminInput} />
        </div>
        <button type="submit" className={`${adminButton} w-full`}>Verify</button>
      </form>
    </main>
  );
}
