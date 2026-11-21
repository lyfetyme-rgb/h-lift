import { timingSafeEqual } from "node:crypto";
import { zeroTrustEnabled } from "./zero-trust";

/**
 * Webhook authentication for machine-to-machine integrations.
 *
 * In lab mode a webhook secret is optional, matching the integration setup
 * flow. Under Zero Trust (HLIFT_ZERO_TRUST=1) an unauthenticated webhook is a
 * write path with no identity, so it is fail-closed: a configured secret must
 * be present and must match in constant time.
 */

function equalSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns an error message when the webhook must be rejected, else null. */
export function webhookAuthError(request: Request, envName: string): string | null {
  const expected = process.env[envName]?.trim();
  const provided = request.headers.get("x-hlift-webhook-secret")?.trim() ?? "";

  if (!expected) {
    return zeroTrustEnabled()
      ? `${envName} is required when HLIFT_ZERO_TRUST is enabled.`
      : null;
  }
  if (!provided || !equalSecret(provided, expected)) return "Invalid webhook secret.";
  return null;
}
