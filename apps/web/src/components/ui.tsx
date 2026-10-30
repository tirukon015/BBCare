import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-5xl px-4 sm:px-6", className)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]", className)}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "olive" | "primary" | "warn" | "danger" }) {
  const tones = {
    neutral: "bg-sand text-ink-soft",
    olive: "bg-primary-soft text-primary-dark",
    primary: "bg-primary-soft text-primary-dark",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
export const buttonStyles = {
  primary: `${buttonBase} bg-primary text-white hover:bg-primary-dark`,
  secondary: `${buttonBase} border border-line bg-white text-ink hover:bg-sand`,
  ghost: `${buttonBase} text-ink-soft hover:bg-sand`,
  danger: `${buttonBase} bg-danger text-white hover:opacity-90`,
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cx(buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link className={cx(buttonStyles[variant], className)} {...props} />;
}

export function Notice({ tone = "neutral", children, role }: { tone?: "neutral" | "olive" | "primary" | "warn" | "danger"; children: ReactNode; role?: "status" | "alert" | "note" }) {
  const tones = {
    neutral: "border-line bg-sand text-ink-soft",
    olive: "border-primary-soft bg-primary-soft text-primary-dark",
    primary: "border-primary-soft bg-primary-soft text-primary-dark",
    warn: "border-warn-soft bg-warn-soft text-warn",
    danger: "border-danger-soft bg-danger-soft text-danger",
  };
  return <div role={role} className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputStyles =
  "min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-muted focus:border-primary";

export function SectionHeading({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="mb-3 text-lg font-semibold text-ink">{children}</h2>;
}
