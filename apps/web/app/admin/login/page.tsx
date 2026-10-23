import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { currentStaff, login } from "@/modules/identity/service";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/request";
import { adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

async function loginAction(form: FormData) {
  "use server";
  const ip = clientIpFrom(await headers());
  if (!(await rateLimit("login", ip))) redirect("/admin/login?e=rate");
  const parsed = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) redirect("/admin/login?e=invalid");
  const r = await login(parsed.data.email, parsed.data.password);
  if (!r.ok) redirect(`/admin/login?e=${r.reason}`);
  redirect("/admin/mfa");
}

const MESSAGES: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  locked: "Too many failed attempts. Try again in 15 minutes.",
  disabled: "This account is disabled.",
  rate: "Too many attempts. Please wait and try again.",
  expired: "Your session expired. Please sign in again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const user = await currentStaff();
  if (user?.mfaVerified) redirect("/admin");
  const { e } = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-bold">BBCare Admin</h1>
      <p className="mb-6 text-sm text-muted">Staff sign-in. Two-factor authentication is required.</p>
      {e && MESSAGES[e] ? <p role="alert" className="mb-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{MESSAGES[e]}</p> : null}
      <form action={loginAction} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className={adminInput} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={adminInput} />
        </div>
        <button type="submit" className={`${adminButton} w-full`}>Continue</button>
      </form>
    </main>
  );
}
