import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { evaluateZeroTrust } from "@/lib/zero-trust";

function zeroTrustRejection() {
  return NextResponse.json(
    {
      error: "Zero trust: no identity assertion was presented.",
      reason_code: "ASSERTION_REQUIRED",
    },
    { status: 401 }
  );
}

/**
 * Zero Trust proxy (NIST 800-207).
 *
 * Runs before API routes and the TAXII feed. When HLIFT_ZERO_TRUST is enabled,
 * a request with no identity assertion (`x-hlift-subject` or the
 * `hlift_subject` cookie) is rejected with 401 and an explicit reason code.
 * Health and machine webhooks are exempt: health is probed by the container
 * orchestrator, and webhooks carry their own optional shared secret and are
 * audited on receipt.
 *
 * Edge-safe: this file must not import the database or any Node-only module.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/health" || pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  const gate = evaluateZeroTrust(request);
  if (!gate.permitted) return zeroTrustRejection();
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/taxii2/:path*"],
};
