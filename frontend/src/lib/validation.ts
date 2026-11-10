import { z } from "zod";

// Same rule as the contract's Label schema (DNS label, also used in OpenStack, Docker and HAProxy).
export const LABEL = /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/;
const label = z
  .string()
  .trim()
  .regex(LABEL, "lowercase letters, digits and dashes, 1-32 characters, no dash at either end");

const DOMAIN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export const hackathonSchema = z.object({
  name: label,
  domain: z.string().trim().toLowerCase().regex(DOMAIN, "a domain such as hack1.cstam.felcloud.tn"),
  // Entered in minutes, sent as lease_ttl_seconds (contract: 0 to 30 days).
  lease_minutes: z.coerce.number().int().min(1, "at least 1 minute").max(43200, "at most 30 days"),
});
export type HackathonForm = z.input<typeof hackathonSchema>;
export type HackathonValues = z.output<typeof hackathonSchema>;

export const teamSchema = z.object({
  hackathon: z.string().min(1, "pick a hackathon"),
  name: label,
  app_port: z.coerce
    .number()
    .int()
    .refine((p) => p === 80 || (p >= 8000 && p <= 8099), "80 or 8000-8099 (ports open to the gateways)"),
  image: z.string().trim().max(255),
});
export type TeamForm = z.input<typeof teamSchema>;
export type TeamValues = z.output<typeof teamSchema>;

const PRINTABLE = /^[\x20-\x7e]*$/;
export const configSchema = z.object({
  rate_limit: z.coerce.number().int().min(1).max(1_000_000),
  extra: z
    .string()
    .transform((s) =>
      s
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          z.string().max(200, "each line at most 200 characters").regex(PRINTABLE, "printable ASCII only"),
        )
        .max(20, "at most 20 lines"),
    ),
  reason: z.string().trim().max(200),
});
export type ConfigForm = z.input<typeof configSchema>;
export type ConfigValues = z.output<typeof configSchema>;
