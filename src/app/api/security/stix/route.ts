import { NextResponse } from "next/server";
import { authorize } from "@/lib/authz";
import { principalFromRequest } from "@/lib/identity";
import { buildStixBundle, STIX_SPEC_VERSION } from "@/lib/stix";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const principal = principalFromRequest(request);
  const decision = authorize({ principal, action: "SECURITY_EVENTS_READ" }, { record: false });
  if (!decision.permitted) {
    return NextResponse.json(
      { error: "STIX export requires security.events.read.", reason_code: decision.reason_code },
      { status: 403 }
    );
  }
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500) || 500, 5000);
  return NextResponse.json(buildStixBundle(limit), {
    status: 200,
    headers: { "Content-Type": `application/stix+json;version=${STIX_SPEC_VERSION}` },
  });
}
