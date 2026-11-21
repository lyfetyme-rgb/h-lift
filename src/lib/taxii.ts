import { NextResponse } from "next/server";
import { authorize } from "./authz";
import { principalFromRequest } from "./identity";

export const TAXII_MEDIA = "application/taxii+json;version=2.1";
export const STIX_MEDIA = "application/stix+json;version=2.1";

/**
 * TAXII 2.1 has no built-in authentication - it relies on transport security
 * (mTLS, TLS client certificates, or a reverse proxy that asserts identity).
 * H-LIFT applies the same capability gate as the rest of the security plane,
 * so an anonymous TAXII client is refused unless HLIFT_TAXII_OPEN=1 is set
 * explicitly for a lab feed.
 */
export function taxiiDenied(request: Request): NextResponse | null {
  if ((process.env.HLIFT_TAXII_OPEN ?? "").trim().toLowerCase() === "1") return null;
  const principal = principalFromRequest(request);
  const decision = authorize({ principal, action: "SECURITY_EVENTS_READ" }, { record: false });
  if (decision.permitted) return null;
  return NextResponse.json(
    {
      error: "TAXII read requires the security.events.read capability.",
      reason_code: decision.reason_code,
    },
    { status: 403 }
  );
}
