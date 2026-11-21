import { fail, ok, readJson } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { appendAuditEvent } from "@/lib/audit";
import { webhookAuthError } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, string> = {
  "to do": "todo", open: "todo", "in progress": "in_progress", "in review": "in_review",
  done: "done", closed: "done", resolved: "done", canceled: "canceled", cancelled: "canceled",
};

const PRIORITY_MAP: Record<string, string> = {
  highest: "urgent", high: "high", medium: "normal", low: "low", lowest: "low",
};

export async function POST(request: Request) {
  // Fail-closed under Zero Trust; optional only in lab mode.
  const authError = webhookAuthError(request, "JIRA_WEBHOOK_SECRET");
  if (authError) return fail(authError, 401);

  try {
    const body = (await readJson(request)) as any;
    const issue = body?.issue;
    if (!issue?.key) return fail("No issue in payload.", 400);

    const f = issue.fields ?? {};
    const key = issue.key;
    const summary = f.summary ?? "Untitled";
    const status = STATUS_MAP[String(f.status?.name ?? "").toLowerCase()] ?? "UNKNOWN";
    const priority = PRIORITY_MAP[String(f.priority?.name ?? "").toLowerCase()] ?? "normal";
    const assignee = f.assignee?.displayName ?? f.assignee?.emailAddress ?? null;
    const created = f.created ?? new Date().toISOString();
    const updated = f.updated ?? new Date().toISOString();
    const url = `${process.env.JIRA_BASE_URL?.replace(/\/$/, "") ?? ""}/browse/${key}`;

    const existing = one<{ id: string }>("SELECT id FROM engineering_issues WHERE key = ?", key);
    if (existing) {
      run(
        `UPDATE engineering_issues SET title=?, status=?, priority=?, assignee=?, linear_url=? WHERE key=?`,
        summary, status, priority, assignee, url, key
      );
    } else {
      run(
        `INSERT INTO engineering_issues (id, key, title, status, priority, assignee, linear_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        `jira-${key}`, key, summary, status, priority, assignee, url, created
      );
    }
    appendAuditEvent({
      plane: "CYBERSECURITY",
      event_type: "INTEGRATION_EVENT_INGESTED",
      source: "jira-webhook",
      subject_id: null,
      resource_type: "engineering_issue",
      resource_id: key,
      outcome: "OK",
      payload: { event: body?.webhookEvent ?? "unknown", updated },
    });
    return ok({ received: true, key, event: body?.webhookEvent ?? "unknown" });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid payload.", 400);
  }
}
