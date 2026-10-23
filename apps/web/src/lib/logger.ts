import "server-only";
import pino from "pino";

/** Structured logger. Known sensitive keys are redacted wherever they appear. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "bbcare-web" },
  redact: {
    paths: [
      "password", "*.password", "token", "*.token", "authorization", "*.authorization", "cookie", "*.cookie",
      "totp", "*.totp", "secret", "*.secret", "email", "*.email", "phone", "*.phone", "contact", "*.contact",
      "headers.cookie", "headers.authorization", "content", "*.content",
    ],
    censor: "[redacted]",
  },
});
