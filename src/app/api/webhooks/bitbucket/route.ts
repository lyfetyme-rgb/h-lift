import { fail, ok, readJson } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { appendAuditEvent } from "@/lib/audit";
import { webhookAuthError } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

const PR_STATE_MAP: Record<string, string> = {
  OPEN: "open", MERGED: "merged", DECLINED: "closed", SUPERSEDED: "closed",
};

export async function POST(request: Request) {
  // Fail-closed under Zero Trust; optional only in lab mode.
  const authError = webhookAuthError(request, "BITBUCKET_WEBHOOK_SECRET");
  if (authError) return fail(authError, 401);

  try {
    const body = (await readJson(request)) as any;
    const pr = body?.pullrequest;
    if (!pr?.id) return fail("No pull request in payload.", 400);

    const branch = pr.source?.branch?.name ?? "UNKNOWN";
    const state = PR_STATE_MAP[String(pr.state ?? "").toUpperCase()] ?? "UNKNOWN";
    const url = pr.links?.html?.href ?? "";
    const sha = pr.source?.commit?.hash ?? null;
    const updated = pr.updated_on ?? new Date().toISOString();

    const issues = all<{ id: string; key: string }>("SELECT id, key FROM engineering_issues");
    const issue = issues.find((i) => branch.toUpperCase().includes(i.key.toUpperCase()));
    if (!issue) {
      appendAuditEvent({
        plane: "CYBERSECURITY",
        event_type: "INTEGRATION_EVENT_INGESTED",
        source: "bitbucket-webhook",
        subject_id: null,
        resource_type: "code_link",
        resource_id: `bb-${pr.id}`,
        outcome: "UNLINKED",
        payload: { branch, state, linked: false, updated },
      });
      return ok({ received: true, linked: false });
    }

    const existing = one<{ id: string }>("SELECT id FROM code_links WHERE pr_url = ?", url);
    if (existing) {
      run(
        `UPDATE code_links SET branch=?, commit_sha=?, pr_state=?, updated_at=? WHERE pr_url=?`,
        branch, sha, state, updated, url
      );
    } else {
      run(
        `INSERT INTO code_links (id, issue_id, branch, commit_sha, pr_url, pr_state, checks_status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'UNKNOWN', ?)`,
        `bb-${pr.id}`, issue.id, branch, sha, url, state, updated
      );
    }
    appendAuditEvent({
      plane: "CYBERSECURITY",
      event_type: "INTEGRATION_EVENT_INGESTED",
      source: "bitbucket-webhook",
      subject_id: null,
      resource_type: "code_link",
      resource_id: `bb-${pr.id}`,
      outcome: "OK",
      payload: { branch, state, linked: !!issue, updated },
    });
    return ok({ received: true, linked: true, issue: issue.key });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid payload.", 400);
  }
}
