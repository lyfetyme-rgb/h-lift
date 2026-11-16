import { fail, forbidden, ok } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { fetchJiraIssues, jiraConfig } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "integration",
      resource_id: "jira",
    });

    const cfg = jiraConfig();
    if (!cfg) {
      return fail("Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY.", 422);
    }

    const issues = await fetchJiraIssues(cfg);
    const now = new Date().toISOString();
    let upserted = 0;
    for (const issue of issues) {
      const existing = one<{ id: string }>("SELECT id FROM engineering_issues WHERE key = ?", issue.key);
      if (existing) {
        run(
          `UPDATE engineering_issues
              SET title = ?, status = ?, priority = ?, assignee = ?, linear_url = ?, created_at = COALESCE(created_at, ?)
            WHERE key = ?`,
          issue.summary,
          issue.status,
          issue.priority,
          issue.assignee,
          issue.url,
          issue.created,
          issue.key
        );
      } else {
        run(
          `INSERT INTO engineering_issues (id, key, title, status, priority, assignee, linear_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `jira-${issue.key}`,
          issue.key,
          issue.summary,
          issue.status,
          issue.priority,
          issue.assignee,
          issue.url,
          issue.created
        );
      }
      upserted++;
    }

    return ok({ configured: true, project: cfg.projectKey, fetched: issues.length, upserted, synced_at: now });
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Jira sync failed.", 502);
  }
}

export function GET() {
  const cfg = jiraConfig();
  return ok({ configured: !!cfg, project: cfg?.projectKey ?? null });
}
