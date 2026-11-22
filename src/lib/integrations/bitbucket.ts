// Bitbucket adapter. Configuration is entirely environment-driven.

export interface BitbucketConfig {
  workspace: string;
  repoSlug: string;
  username: string;
  appPassword: string;
}

export function bitbucketConfig(): BitbucketConfig | null {
  const workspace = process.env.BITBUCKET_WORKSPACE?.trim();
  const repoSlug = process.env.BITBUCKET_REPO_SLUG?.trim();
  const username = process.env.BITBUCKET_USERNAME?.trim();
  const appPassword = process.env.BITBUCKET_APP_PASSWORD?.trim();
  if (!workspace || !repoSlug || !username || !appPassword) return null;
  return { workspace, repoSlug, username, appPassword };
}

export interface BitbucketPullRequest {
  id: number;
  title: string;
  state: string; // OPEN | MERGED | DECLINED | SUPERSEDED
  sourceBranch: string;
  destinationBranch: string;
  author: string | null;
  url: string;
  updatedOn: string;
  commitSha: string | null;
}

const PR_STATE_MAP: Record<string, string> = {
  OPEN: "open",
  MERGED: "merged",
  DECLINED: "closed",
  SUPERSEDED: "closed",
};

export async function fetchBitbucketPullRequests(
  cfg: BitbucketConfig,
  pagelen = 50
): Promise<BitbucketPullRequest[]> {
  const auth = Buffer.from(`${cfg.username}:${cfg.appPassword}`).toString("base64");
  const url = `https://api.bitbucket.org/2.0/repositories/${cfg.workspace}/${cfg.repoSlug}/pullrequests?state=OPEN&state=MERGED&state=DECLINED&pagelen=${pagelen}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Bitbucket PR list failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { values?: any[] };
  return (data.values ?? []).map((p) => ({
    id: p.id,
    title: p.title ?? "Untitled",
    state: PR_STATE_MAP[String(p.state ?? "").toUpperCase()] ?? "UNKNOWN",
    sourceBranch: p.source?.branch?.name ?? "UNKNOWN",
    destinationBranch: p.destination?.branch?.name ?? "UNKNOWN",
    author: p.author?.display_name ?? p.author?.username ?? null,
    url: p.links?.html?.href ?? "",
    updatedOn: p.updated_on ?? new Date().toISOString(),
    commitSha: p.source?.commit?.hash ?? null,
  }));
}
