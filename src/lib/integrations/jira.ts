// Jira adapter. Configuration is entirely environment-driven so no secret
// is ever committed. When JIRA_BASE_URL is unset the adapter reports
// "not configured" and sync is a no-op.

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export function jiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.trim();
  const email = process.env.JIRA_EMAIL?.trim();
  const apiToken = process.env.JIRA_API_TOKEN?.trim();
  const projectKey = process.env.JIRA_PROJECT_KEY?.trim();
  if (!baseUrl || !email || !apiToken || !projectKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), email, apiToken, projectKey };
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  created: string;
  updated: string;
  url: string;
}

const STATUS_MAP: Record<string, string> = {
  "to do": "todo",
  "open": "todo",
  "in progress": "in_progress",
  "in review": "in_review",
  "done": "done",
  "closed": "done",
  "resolved": "done",
  "canceled": "canceled",
  "cancelled": "canceled",
};

const PRIORITY_MAP: Record<string, string> = {
  highest: "urgent",
  high: "high",
  medium: "normal",
  low: "low",
  lowest: "low",
};

export async function fetchJiraIssues(cfg: JiraConfig, maxResults = 100): Promise<JiraIssue[]> {
  const auth = Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString("base64");
  const jql = encodeURIComponent(`project = ${cfg.projectKey} ORDER BY updated DESC`);
  const url = `${cfg.baseUrl}/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=summary,status,priority,assignee,created,updated`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira search failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { issues?: any[] };
  return (data.issues ?? []).map((i) => {
    const f = i.fields ?? {};
    return {
      key: i.key,
      summary: f.summary ?? "Untitled",
      status: STATUS_MAP[String(f.status?.name ?? "").toLowerCase()] ?? "UNKNOWN",
      priority: PRIORITY_MAP[String(f.priority?.name ?? "").toLowerCase()] ?? "normal",
      assignee: f.assignee?.displayName ?? f.assignee?.emailAddress ?? null,
      created: f.created ?? new Date().toISOString(),
      updated: f.updated ?? new Date().toISOString(),
      url: `${cfg.baseUrl}/browse/${i.key}`,
    };
  });
}
