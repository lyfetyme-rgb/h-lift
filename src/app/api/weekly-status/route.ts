import { NextResponse } from "next/server";
import { weeklyData } from "@/lib/repo";
import { renderWeeklyMarkdown } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const data = weeklyData();

  if (format === "markdown" || format === "md") {
    return new NextResponse(renderWeeklyMarkdown(data), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="hlift-weekly-${data.report.week}.md"`,
      },
    });
  }
  return NextResponse.json({ ...data, markdown: renderWeeklyMarkdown(data) });
}
