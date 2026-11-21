import { NextResponse } from "next/server";
import { taxiiDenied, TAXII_MEDIA } from "@/lib/taxii";
import { taxiiCollections } from "@/lib/stix";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = taxiiDenied(request);
  if (denied) return denied;
  return NextResponse.json({ collections: taxiiCollections() }, {
    headers: { "Content-Type": TAXII_MEDIA },
  });
}
