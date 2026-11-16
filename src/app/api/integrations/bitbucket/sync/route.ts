import { fail, forbidden, ok } from "@/lib/http";
import { all, one, run } from "@/lib/db";
import { requireRequest } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { appendAuditEvent } from "@/lib/audit";
import { fetchBitbucketPullRequests, bitbucketConfig } from "@/lib/integrations/bitbucket";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireRequest(request, {
      action: "SECURITY_CONFIGURATION_MANAGE",
      resource_type: "integration",
      resource_id: "bitbucket",
    });

    const principal = await currentPrincipal();

    const cfg = bitbucketConfig();
    if (!cfg) {
      return fail("Bitbucket is not configured. Set BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG, BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD.", 422);
    }

    const prs = await fetchBitbucketPullRequests(cfg);
    const issues = all<{ id: string; key: string }>("SELECT id, key FROM engineering_issues");
    const now = new Date().toISOString();
    let linked = 0;
    for (const pr of prs) {
      // Link a PR to an issue when the issue key appears in the branch name.
      const issue = issues.find((i) => pr.sourceBranch.toUpperCase().includes(i.key.toUpperCase()));
      if (!issue) continue;
      const existing = one<{ id: string }>("SELECT id FROM code_links WHERE pr_url = ?", pr.url);
      if (existing) {
        run(
          `UPDATE code_links
              SET branch = ?, commit_sha = ?, pr_state = ?, checks_status = ?, updated_at = ?
            WHERE pr_url = ?`,
          pr.sourceBranch,
          pr.commitSha,
          pr.state,
          "UNKNOWN",
          pr.updatedOn,
          pr.url
        );
      } else {
        run(
          `INSERT INTO code_links (id, issue_id, branch, commit_sha, pr_url, pr_state, checks_status, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `bb-${pr.id}`,
          issue.id,
          pr.sourceBranch,
          pr.commitSha,
          pr.url,
          pr.state,
          "UNKNOWN",
          pr.updatedOn
        );
      }
      linked++;
    }

    appendAuditEvent({
      plane: "CYBERSECURITY",
      event_type: "INTEGRATION_SYNC",
      source: "hlift.integrations.bitbucket",
      subject_id: principal?.subject_id ?? null,
      resource_type: "integration",
      resource_id: "bitbucket",
      outcome: "OK",
      payload: {
        workspace: cfg.workspace,
        repo: cfg.repoSlug,
        fetched: prs.length,
        linked,
        synced_at: now,
      },
    });

    return ok({ configured: true, workspace: cfg.workspace, repo: cfg.repoSlug, fetched: prs.length, linked, synced_at: now });
  } catch (e) {
    if (e && typeof e === "object" && "decision" in e) {
      return (await import("@/lib/http")).forbidden((e as { message?: string }).message ?? "Denied", (e as any).decision);
    }
    return fail(e instanceof Error ? e.message : "Bitbucket sync failed.", 502);
  }
}

export function GET() {
  const cfg = bitbucketConfig();
  return ok({ configured: !!cfg, workspace: cfg?.workspace ?? null, repo: cfg?.repoSlug ?? null });
}
