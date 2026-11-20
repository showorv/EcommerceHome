import pino from "pino";

/**
 * Structured logger. Personal data and secrets are redacted (NFR-AV-03).
 * LOG_LEVEL is read directly so this file has no dependency on full env validation.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "code",
      "*.code",
      "phone",
      "*.phone",
      "phoneNumber",
      "*.phoneNumber",
      "email",
      "*.email",
      "trxId",
      "*.trxId",
      "headers.cookie",
      "headers.authorization",
    ],
    censor: "[redacted]",
  },
});
