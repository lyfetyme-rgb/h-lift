import { ok } from "@/lib/http";
import { jiraConfig } from "@/lib/integrations/jira";
import { bitbucketConfig } from "@/lib/integrations/bitbucket";

export const dynamic = "force-dynamic";

export function GET() {
  const jira = jiraConfig();
  const bitbucket = bitbucketConfig();
  return ok({
    jira: { configured: !!jira, project: jira?.projectKey ?? null, baseUrl: jira?.baseUrl ?? null },
    bitbucket: { configured: !!bitbucket, workspace: bitbucket?.workspace ?? null, repo: bitbucket?.repoSlug ?? null },
  });
}
