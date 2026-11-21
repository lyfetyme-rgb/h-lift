import { Kpi, Page, Panel } from "@/components/ui";
import { IntegrationSync } from "@/components/Actions";
import { authorize } from "@/lib/authz";
import { currentPrincipal } from "@/lib/identity";
import { jiraConfig } from "@/lib/integrations/jira";
import { bitbucketConfig } from "@/lib/integrations/bitbucket";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const principal = await currentPrincipal();
  const decision = authorize({ principal, action: "SECURITY_CONFIGURATION_MANAGE" }, { record: false });
  if (!decision.permitted) {
    const { default: AccessDenied } = await import("@/components/AccessDenied");
    return (
      <AccessDenied
        title="Integrations"
        plane="CYBERSECURITY"
        capability="security.configuration.manage"
        principal={principal}
        decision={decision}
      />
    );
  }

  // Read configuration directly on the server. Calling our own HTTP endpoint
  // would depend on HLIFT_BASE_URL and, under Zero Trust, require an assertion
  // on a request we cannot supply from a Server Component.
  const jira = jiraConfig();
  const bitbucket = bitbucketConfig();
  const status = {
    jira: {
      configured: !!jira,
      project: jira?.projectKey ?? null,
      baseUrl: jira?.baseUrl ?? null,
    },
    bitbucket: {
      configured: !!bitbucket,
      workspace: bitbucket?.workspace ?? null,
      repo: bitbucket?.repoSlug ?? null,
    },
  };

  return (
    <Page
      title="Integrations"
      subtitle="Connect H-LIFT to Jira and Bitbucket so engineering issues and pull requests feed the traceability chain. Configuration is environment-driven; no secret is stored in the repository."
    >
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <Kpi
          label="Jira"
          value={status?.jira?.configured ? "CONFIGURED" : "NOT CONFIGURED"}
          severity={status?.jira?.configured ? "ok" : "warn"}
          note={status?.jira?.project ?? "set JIRA_* env vars"}
        />
        <Kpi
          label="Bitbucket"
          value={status?.bitbucket?.configured ? "CONFIGURED" : "NOT CONFIGURED"}
          severity={status?.bitbucket?.configured ? "ok" : "warn"}
          note={status?.bitbucket?.repo ?? "set BITBUCKET_* env vars"}
        />
      </div>

      <Panel title="Jira">
        <p className="small dim" style={{ marginBottom: 12 }}>
          Syncs Jira issues into the engineering issue register. Requires
          <span className="mono"> JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY</span>.
          Webhook: <span className="mono">POST /api/webhooks/jira</span> (optional
          <span className="mono"> JIRA_WEBHOOK_SECRET</span>).
        </p>
        <IntegrationSync kind="jira" label="Sync Jira issues" />
      </Panel>

      <Panel title="Bitbucket">
        <p className="small dim" style={{ marginBottom: 12 }}>
          Syncs pull requests into code links, matching issue keys found in branch names. Requires
          <span className="mono"> BITBUCKET_WORKSPACE, BITBUCKET_REPO_SLUG, BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD</span>.
          Webhook: <span className="mono">POST /api/webhooks/bitbucket</span> (optional
          <span className="mono"> BITBUCKET_WEBHOOK_SECRET</span>).
        </p>
        <IntegrationSync kind="bitbucket" label="Sync Bitbucket PRs" />
      </Panel>

      <Panel title="Environment reference">
        <table>
          <tbody>
            <tr><td className="mono small">JIRA_BASE_URL</td><td className="small dim">e.g. https://yourco.atlassian.net</td></tr>
            <tr><td className="mono small">JIRA_EMAIL</td><td className="small dim">account email for the API token</td></tr>
            <tr><td className="mono small">JIRA_API_TOKEN</td><td className="small dim">Atlassian API token</td></tr>
            <tr><td className="mono small">JIRA_PROJECT_KEY</td><td className="small dim">e.g. HL</td></tr>
            <tr><td className="mono small">BITBUCKET_WORKSPACE</td><td className="small dim">workspace slug</td></tr>
            <tr><td className="mono small">BITBUCKET_REPO_SLUG</td><td className="small dim">repository slug</td></tr>
            <tr><td className="mono small">BITBUCKET_USERNAME</td><td className="small dim">Bitbucket username</td></tr>
            <tr><td className="mono small">BITBUCKET_APP_PASSWORD</td><td className="small dim">app password with repo read</td></tr>
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
