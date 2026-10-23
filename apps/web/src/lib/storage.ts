import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "./env";

/** Private file storage on local disk (outside the web root). Keys are random; names are metadata. */
function root(): string {
  return resolve(env().BBCARE_STORAGE_DIR);
}

export async function putFile(bytes: Uint8Array, ext: string): Promise<string> {
  const key = `${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext.replace(/[^a-z0-9]/g, "")}`;
  const path = join(root(), key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (!/^\d{4}-\d{2}\/[0-9a-f]{32}\.[a-z0-9]+$/.test(key)) throw new Error("invalid key");
  return readFile(join(root(), key));
}
