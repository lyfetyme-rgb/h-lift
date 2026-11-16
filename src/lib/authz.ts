import { randomUUID } from "node:crypto";
import { all, one, run } from "./db";
import { appendAuditEvent, canonicalJson } from "./audit";
import { Principal, principalFromRequest, resolvePrincipal } from "./identity";
import { shelfState } from "./status";

/**
 * Scoped authorization engine.
 *
 * A role name alone never authorizes a write. The decision considers the
 * subject, roles, canonical capability, command, facility, resource type/id,
 * action, lifecycle state, credential assurance and the active local policy.
 * Every PERMIT and DENY is persisted and written onto the audit bus.
 */

export const ACTION_CAPABILITY: Record<string, string> = {
  MATERIAL_REQUEST: "material.request",
  MATERIAL_ISSUE: "material.issue",
  MATERIAL_RECEIVE: "material.receive",
  MATERIAL_RETURN: "material.return",
  MATERIAL_INSPECT: "material.inspect",
  MATERIAL_RELABEL: "material.relabel",
  CONTAINER_TRANSITION: "inventory.adjust",
  INVENTORY_READ: "inventory.read",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_RECONCILE: "inventory.reconcile",
  CONFLICT_RESOLVE: "inventory.reconcile",
  SECURITY_EVENTS_READ: "security.events.read",
  SECURITY_INCIDENT_MANAGE: "security.incident.manage",
  SECURITY_CONFIGURATION_MANAGE: "security.configuration.manage",
  SECURITY_VULNERABILITY_MANAGE: "security.vulnerability.manage",
  ASSURANCE_CONTROLS_READ: "assurance.controls.read",
  ASSURANCE_EVIDENCE_READ: "assurance.evidence.read",
  ASSURANCE_FINDING_MANAGE: "assurance.finding.manage",
  ASSURANCE_FINDING_CLOSE: "assurance.finding.close",
  OVERSIGHT_READ: "oversight.read",
  RELEASE_APPROVE: "release.approve",
  EXCEPTION_DECIDE: "exception.decide",
};

export const ASSURANCE_RANK: Record<string, number> = {
  HIGH: 3,
  MODERATE: 2,
  LOW: 1,
  UNKNOWN: 0,
};

export interface AuthorizationContext {
  principal?: Principal | null;
  subject_id?: string | null;
  command_id?: string | null;
  facility_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  resource_command_id?: string | null;
  action: string;
  lifecycle_state?: string | null;
  expiry_state?: string | null;
  credential_assurance?: string | null;
  policy_id?: string | null;
  requested_by?: string | null;
  correlation_id?: string | null;
  detail?: string | null;
}

export interface AuthorizationDecision {
  decision_id: string;
  decided_at: string;
  principal_id: string | null;
  subject_id: string;
  roles: string[];
  command_id: string | null;
  facility_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  capability: string | null;
  lifecycle_state: string | null;
  credential_assurance: string;
  policy_id: string | null;
  permitted: boolean;
  reason_code: string;
  obligations: string[];
  detail: string | null;
}

interface PolicyRow {
  id: string;
  version: number;
  name: string;
  plane: string;
  capability_code: string;
  effect: string;
  requires_assurance: string;
  facility_scope: string;
  command_scope: string | null;
  allowed_states: string | null;
  require_valid_expiry: number;
  obligations: string | null;
  description: string | null;
  active: number;
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function identityAliases(principal: Principal): string[] {
  return [
    principal.subject_id,
    principal.display_name,
    principal.email ?? "",
    principal.id,
  ]
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function policyFor(capability: string, policyId?: string | null): PolicyRow | null {
  if (policyId) {
    return one<PolicyRow>("SELECT * FROM policies WHERE id = ? AND active = 1", policyId);
  }
  return one<PolicyRow>(
    `SELECT * FROM policies
      WHERE capability_code = ? AND active = 1
      ORDER BY version DESC LIMIT 1`,
    capability
  );
}

function persist(decision: AuthorizationDecision, context: AuthorizationContext) {
  run(
    `INSERT INTO authorization_decisions
       (id, decided_at, principal_id, subject_id, roles, command_id, facility_id,
        resource_type, resource_id, action, capability_code, lifecycle_state,
        credential_assurance, policy_id, permitted, reason_code, obligations, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    decision.decision_id,
    decision.decided_at,
    decision.principal_id,
    decision.subject_id,
    canonicalJson(decision.roles),
    decision.command_id,
    decision.facility_id,
    decision.resource_type,
    decision.resource_id,
    decision.action,
    decision.capability,
    decision.lifecycle_state,
    decision.credential_assurance,
    decision.policy_id,
    decision.permitted ? 1 : 0,
    decision.reason_code,
    canonicalJson(decision.obligations),
    context.correlation_id ?? null
  );

  appendAuditEvent({
    plane: "GOVERNANCE",
    event_type: "AUTHORIZATION_DECISION",
    source: "hlift.authz",
    subject_id: decision.subject_id,
    resource_type: decision.resource_type,
    resource_id: decision.resource_id,
    correlation_id: context.correlation_id ?? null,
    severity: decision.permitted ? "INFO" : "MEDIUM",
    outcome: decision.permitted ? "PERMIT" : "DENY",
    payload: {
      decision_id: decision.decision_id,
      action: decision.action,
      capability: decision.capability,
      policy_id: decision.policy_id,
      reason_code: decision.reason_code,
      facility_id: decision.facility_id,
      lifecycle_state: decision.lifecycle_state,
      credential_assurance: decision.credential_assurance,
      obligations: decision.obligations,
    },
  });
}

/**
 * Command hierarchy helpers: a higher command observes its descendants.
 */
function loadCommandParents(): Map<string, string | null> {
  const rows = all<{ id: string; parent_id: string | null }>(
    "SELECT id, parent_id FROM commands"
  );
  return new Map(rows.map((r) => [r.id, r.parent_id ?? null]));
}

export function commandIsAncestorOrSelf(ancestor: string, descendant: string): boolean {
  const parents = loadCommandParents();
  let cur: string | null = descendant;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    if (cur === ancestor) return true;
    seen.add(cur);
    cur = parents.get(cur) ?? null;
  }
  return false;
}

/**
 * Evaluate a request. Recording is on by default; read paths pass
 * `{ record: false }` so browsing does not flood the decision ledger.
 */
export function authorize(
  context: AuthorizationContext,
  options: { record?: boolean } = {}
): AuthorizationDecision {
  const principal = context.principal ?? resolvePrincipal(context.subject_id);
  const action = context.action;
  const capability = ACTION_CAPABILITY[action] ?? null;
  const now = new Date().toISOString();
  const decisionId = `authz-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  const base: AuthorizationDecision = {
    decision_id: decisionId,
    decided_at: now,
    principal_id: principal?.id ?? null,
    subject_id: principal?.subject_id ?? context.subject_id ?? "UNKNOWN",
    roles: principal?.roles.map((r) => r.code) ?? [],
    command_id: context.command_id ?? principal?.command_id ?? null,
    facility_id: context.facility_id ?? principal?.facility_id ?? null,
    resource_type: context.resource_type ?? null,
    resource_id: context.resource_id ?? null,
    action,
    capability,
    lifecycle_state: context.lifecycle_state ?? null,
    credential_assurance: context.credential_assurance ?? principal?.credential_assurance ?? "UNKNOWN",
    policy_id: context.policy_id ?? null,
    permitted: false,
    reason_code: "NOT_EVALUATED",
    obligations: [],
    detail: context.detail ?? null,
  };

  const deny = (reason: string, detail?: string): AuthorizationDecision => {
    const decision: AuthorizationDecision = {
      ...base,
      permitted: false,
      reason_code: reason,
      detail: detail ?? base.detail,
    };
    if (options.record !== false) persist(decision, context);
    return decision;
  };

  if (!principal) return deny("PRINCIPAL_NOT_FOUND");
  if (principal.status !== "ACTIVE") return deny("PRINCIPAL_INACTIVE");
  if (!capability) return deny("NO_CAPABILITY_MAPPING", `No capability maps to action ${action}.`);

  const policy = policyFor(capability, context.policy_id);
  if (!policy) return deny("NO_ACTIVE_POLICY", `No active policy for ${capability}.`);
  base.policy_id = policy.id;
  base.obligations = parseList(policy.obligations);

  if (policy.effect === "DENY") return deny("POLICY_DENY", policy.description ?? "Policy is a deny rule.");
  if (!principal.capabilities.includes(capability)) {
    return deny("MISSING_CAPABILITY", `${principal.subject_id} does not hold ${capability}.`);
  }

  const required = ASSURANCE_RANK[policy.requires_assurance] ?? 0;
  const actual = ASSURANCE_RANK[base.credential_assurance] ?? 0;
  if (actual < required) {
    return deny(
      "INSUFFICIENT_ASSURANCE",
      `${capability} requires ${policy.requires_assurance}; presented ${base.credential_assurance}.`
    );
  }

  if (policy.facility_scope === "MATCH") {
    if (!principal.facility_id || !context.facility_id) {
      return deny("FACILITY_UNRESOLVED", "Facility-scoped action has no resolvable facility.");
    }
    if (principal.facility_id !== context.facility_id) {
      return deny(
        "FACILITY_SCOPE_MISMATCH",
        `${principal.subject_id} is scoped to ${principal.facility_id}, resource is at ${context.facility_id}.`
      );
    }
  }

  const commandScope = policy.command_scope ?? "MATCH";
  if (commandScope && commandScope !== "NONE") {
    const principalCommand = principal.command_id ?? null;
    const resourceCommand = context.resource_command_id ?? principalCommand;
    if (commandScope === "MATCH" || commandScope === "SELF") {
      if (!principalCommand || principalCommand !== resourceCommand) {
        return deny(
          "COMMAND_SCOPE_MISMATCH",
          `${principal.subject_id} is scoped to command ${principalCommand ?? "UNKNOWN"}, resource is under ${resourceCommand ?? "UNKNOWN"}.`
        );
      }
    } else if (commandScope === "DESCENDANTS") {
      if (!principalCommand || !resourceCommand || !commandIsAncestorOrSelf(principalCommand, resourceCommand)) {
        return deny(
          "COMMAND_SCOPE_MISMATCH",
          `${principal.subject_id} at command ${principalCommand ?? "UNKNOWN"} cannot reach resource command ${resourceCommand ?? "UNKNOWN"}.`
        );
      }
    }
  }
  const allowedStates = parseList(policy.allowed_states);
  if (allowedStates.length) {
    if (!context.lifecycle_state) return deny("LIFECYCLE_STATE_UNKNOWN", `${capability} requires a known state.`);
    if (!allowedStates.includes(context.lifecycle_state)) {
      return deny(
        "LIFECYCLE_STATE_BLOCKED",
        `${capability} is not permitted from ${context.lifecycle_state}.`
      );
    }
  }

  if (policy.require_valid_expiry) {
    const expiry = context.expiry_state ?? null;
    if (!expiry || expiry === "EXPIRED" || expiry === "UNKNOWN") {
      return deny(
        expiry === "EXPIRED" ? "EXPIRY_BLOCKED" : "EXPIRY_UNKNOWN",
        `${capability} requires a valid, recorded expiry; expiry state is ${expiry ?? "UNKNOWN"}.`
      );
    }
  }

  // Segregation of duties: no principal may approve their own request.
  const requestedBy = context.requested_by?.trim().toLowerCase();
  if (requestedBy && identityAliases(principal).includes(requestedBy)) {
    return deny("SEGREGATION_OF_DUTIES", "The requester cannot also approve this record.");
  }

  // Closing an audit finding is a narrow command acknowledgement, never a
  // general write granted by an assurance management capability.
  if (action === "ASSURANCE_FINDING_CLOSE") {
    if (!principal.roles.some((r) => r.code === "COMMAND_OVERSIGHT")) {
      return deny("SEGREGATION_OF_DUTIES", "Only command oversight may close a finding under acknowledge policy.");
    }
    base.obligations = Array.from(new Set([...base.obligations, "COMMAND_ACKNOWLEDGEMENT_REQUIRED"]));
  }

  const decision: AuthorizationDecision = {
    ...base,
    permitted: true,
    reason_code: "PERMITTED",
  };
  if (options.record !== false) persist(decision, context);
  return decision;
}

export class AuthorizationDeniedError extends Error {
  decision: AuthorizationDecision;
  constructor(decision: AuthorizationDecision) {
    super(`${decision.action} denied: ${decision.reason_code}${decision.detail ? ` — ${decision.detail}` : ""}`);
    this.name = "AuthorizationDeniedError";
    this.decision = decision;
  }
}

export function requireAuthorization(
  context: AuthorizationContext,
  options: { record?: boolean } = {}
): AuthorizationDecision {
  const decision = authorize(context, options);
  if (!decision.permitted) throw new AuthorizationDeniedError(decision);
  return decision;
}

export function authorizeRequest(
  request: Request,
  context: Omit<AuthorizationContext, "principal" | "subject_id">
): AuthorizationDecision {
  const principal = principalFromRequest(request);
  return authorize({ ...context, principal });
}

export function requireRequest(
  request: Request,
  context: Omit<AuthorizationContext, "principal" | "subject_id">
): AuthorizationDecision {
  const principal = principalFromRequest(request);
  return requireAuthorization({ ...context, principal });
}

export function canRead(principal: Principal | null, action: string): boolean {
  return authorize({ principal, action }, { record: false }).permitted;
}

/** Minimal resource context needed to scope a container write. */
export function containerScope(id: string): {
  lifecycle_state: string;
  facility_id: string | null;
  command_id: string | null;
  expiry_state: string;
} | null {
  const row = one<{ state: string; facility_id: string | null; owning_command: string | null; expires_at: string | null }>(
    "SELECT state, facility_id, owning_command, expires_at FROM containers WHERE id = ?",
    id
  );
  if (!row) return null;
  return {
    lifecycle_state: row.state,
    facility_id: row.facility_id,
    command_id: row.owning_command,
    expiry_state: shelfState(row.expires_at),
  };
}

export function decisionSummary() {
  const total = one<{ n: number }>("SELECT COUNT(*) AS n FROM authorization_decisions")?.n ?? 0;
  const permitted = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM authorization_decisions WHERE permitted = 1"
  )?.n ?? 0;
  const denied = total - permitted;
  const byReason = all<{ reason_code: string; n: number }>(
    `SELECT reason_code, COUNT(*) AS n
       FROM authorization_decisions
      GROUP BY reason_code
      ORDER BY n DESC`
  );
  const recent = all<Record<string, unknown>>(
    `SELECT d.*, p.display_name
       FROM authorization_decisions d
       LEFT JOIN principals p ON p.id = d.principal_id
      ORDER BY d.decided_at DESC
      LIMIT 40`
  );
  return { total, permitted, denied, byReason, recent };
}
