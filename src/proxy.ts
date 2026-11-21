import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { evaluateZeroTrust } from "@/lib/zero-trust";

function zeroTrustRejection(reasonCode: "ASSERTION_REQUIRED" | "INVALID_ASSERTION") {
  return NextResponse.json(
    {
      error:
        reasonCode === "INVALID_ASSERTION"
          ? "Zero trust: identity assertion was rejected."
          : "Zero trust: no identity assertion was presented.",
      reason_code: reasonCode,
    },
    { status: 401 }
  );
}

/**
 * Zero Trust proxy (NIST 800-207).
 *
 * Runs before API routes and the TAXII feed. When HLIFT_ZERO_TRUST is enabled,
 * a request must present a valid identity assertion; in signed mode the HS256
 * signature, expiry, issuer and audience are verified here at the edge.
 * Health and machine webhooks are exempt: health is probed by the container
 * orchestrator, and webhooks carry their own optional shared secret and are
 * audited on receipt.
 *
 * Edge-safe: this file must not import the database or any Node-only module.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/health" || pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }

  const gate = await evaluateZeroTrust(request);
  if (!gate.permitted) {
    return zeroTrustRejection(
      gate.reason_code === "INVALID_ASSERTION" ? "INVALID_ASSERTION" : "ASSERTION_REQUIRED"
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/taxii2/:path*"],
};
