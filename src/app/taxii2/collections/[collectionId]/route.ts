import { NextResponse } from "next/server";
import { taxiiDenied, TAXII_MEDIA } from "@/lib/taxii";
import { taxiiCollections } from "@/lib/stix";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ collectionId: string }> }) {
  const denied = taxiiDenied(request);
  if (denied) return denied;
  const { collectionId } = await ctx.params;
  const collection = taxiiCollections().find((c) => c.id === collectionId);
  if (!collection) {
    return NextResponse.json({ error: "Unknown collection.", collection_id: collectionId }, { status: 404 });
  }
  return NextResponse.json(collection, { headers: { "Content-Type": TAXII_MEDIA } });
}
