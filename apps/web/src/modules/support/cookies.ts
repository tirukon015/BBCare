import { secureCookies } from "@/lib/cookie-security";
import "server-only";
import { cookies } from "next/headers";
import { SUPPORT_COOKIE } from "./service";

export async function setSupportCookie(publicId: string, token: string, maxAge: number) {
  (await cookies()).set(SUPPORT_COOKIE, `${publicId}.${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge,
  });
}

export async function readSupportCookie(): Promise<string | undefined> {
  return (await cookies()).get(SUPPORT_COOKIE)?.value;
}
