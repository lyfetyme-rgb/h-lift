import { NextResponse } from "next/server";
import { taxiiDenied, TAXII_MEDIA, STIX_MEDIA } from "@/lib/taxii";
import { stixObjects } from "@/lib/stix";

export const dynamic = "force-dynamic";

const COLLECTION_ID = "a1a0914e-e3aa-4080-a0fb-a67dec49c1a3";

export async function GET(request: Request, ctx: { params: Promise<{ collectionId: string }> }) {
  const denied = taxiiDenied(request);
  if (denied) return denied;
  const { collectionId } = await ctx.params;
  if (collectionId !== COLLECTION_ID) {
    return NextResponse.json({ error: "Unknown collection.", collection_id: collectionId }, { status: 404 });
  }
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500) || 500, 5000);
  const objects = stixObjects(limit).filter((o) => o.type !== "identity");
  return NextResponse.json(
    { more: false, objects },
    { headers: { "Content-Type": TAXII_MEDIA, "X-STIX-Media-Type": STIX_MEDIA } }
  );
}
