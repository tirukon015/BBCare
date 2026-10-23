import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { beginTotpEnrollment, confirmTotpEnrollment, currentStaff } from "@/modules/identity/service";
import { adminButton, adminInput } from "@/components/admin-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up two-factor authentication" };

async function confirmAction(form: FormData) {
  "use server";
  const user = await currentStaff();
  if (!user) redirect("/admin/login?e=expired");
  const codes = await confirmTotpEnrollment(user, String(form.get("code") ?? "").trim());
  if (!codes) redirect("/admin/mfa/setup?e=invalid");
  // Recovery codes are shown once via a short-lived, httpOnly cookie read by the next page.
  const { cookies } = await import("next/headers");
  (await cookies()).set("bbcare_rc", codes.join(","), { httpOnly: true, sameSite: "strict", path: "/admin/mfa/setup", maxAge: 120, secure: process.env.NODE_ENV === "production" });
  redirect("/admin/mfa/setup?done=1");
}

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ e?: string; done?: string }> }) {
  const user = await currentStaff();
  if (!user) redirect("/admin/login");
  const sp = await searchParams;
  if (sp.done === "1") {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const codes = store.get("bbcare_rc")?.value?.split(",") ?? [];
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold">Two-factor authentication is on</h1>
        {codes.length ? (
          <>
            <p className="mt-2 text-sm">Save these recovery codes somewhere safe. Each can be used once. They will not be shown again.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-4 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          </>
        ) : null}
        <Link href="/admin" className={`${adminButton} mt-6`}>Continue to admin</Link>
      </main>
    );
  }
  if (user.mfaEnrolled) redirect(user.mfaVerified ? "/admin" : "/admin/mfa");
  const { secret, uri } = await beginTotpEnrollment(user);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, width: 200, color: { dark: "#262624", light: "#ffffff" } });
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-ink-soft">Scan this code with an authenticator app (for example Google Authenticator, Microsoft Authenticator or 1Password), then enter the 6-digit code.</p>
      {sp.e ? <p role="alert" className="mt-4 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">That code is not valid. A new secret has been generated; scan again.</p> : null}
      <div className="mt-4 w-[200px] rounded-lg border border-line bg-white" role="img" aria-label="QR code for authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-3 text-xs text-muted">Manual entry key:</p>
      <p className="break-all font-mono text-sm">{secret}</p>
      <form action={confirmAction} className="mt-6 space-y-3">
        <label htmlFor="code" className="text-sm font-medium">6-digit code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className={adminInput} />
        <button type="submit" className={`${adminButton} w-full`}>Turn on two-factor authentication</button>
      </form>
    </main>
  );
}
