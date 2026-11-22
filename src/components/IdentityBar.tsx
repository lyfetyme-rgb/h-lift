"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/client-api";

interface PrincipalView {
  subject_id: string;
  display_name: string;
  role_label: string;
  facility_id: string | null;
  credential_assurance: string;
}

interface IdentityResponse {
  current: PrincipalView | null;
  switchable: boolean;
  principals: PrincipalView[];
}

export default function IdentityBar() {
  const router = useRouter();
  const [current, setCurrent] = useState<PrincipalView | null>(null);
  const [people, setPeople] = useState<PrincipalView[]>([]);
  const [switchable, setSwitchable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiJson<IdentityResponse>("/api/identity");
      setCurrent(data.current ?? null);
      setPeople(data.principals ?? []);
      setSwitchable(data.switchable !== false);
    } catch (error) {
      // Surface the failure instead of pretending no identity is configured.
      setLoadError(error instanceof Error ? error.message : "Identity could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const choose = (subject: string) => {
    setBusy(true);
    document.cookie = `hlift_subject=${encodeURIComponent(subject)}; path=/; max-age=86400; samesite=lax`;
    // The server components read the cookie; refresh re-renders the shell and
    // every page under the new authenticated principal.
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  };

  if (loadError) {
    return (
      <div className="identity-bar" role="alert">
        <span className="error" title={loadError}>identity unavailable</span>
        <button type="button" className="small" onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="identity-bar">
      <span className="mono dim">acting principal</span>
      {switchable ? (
        <select
          aria-label="acting principal"
          value={current?.subject_id ?? ""}
          disabled={busy || people.length === 0}
          onChange={(e) => choose(e.target.value)}
        >
          {people.length === 0 ? <option value="">no principals available</option> : null}
          {people.map((p) => (
            <option key={p.subject_id} value={p.subject_id}>
              {p.display_name} · {p.role_label} · {p.facility_id ?? "NO FACILITY"}
            </option>
          ))}
        </select>
      ) : (
        <span className="mono" title="Subject asserted by the configured identity provider">
          {current?.subject_id ?? "external assertion"}
        </span>
      )}
      {current ? (
        <>
          <span className="badge b-info" title="Credential assurance from the identity adapter">
            {current.credential_assurance}
          </span>
          {!switchable ? (
            <span className="badge b-info" title="IdP-signed assertion; not switchable from the console">
              IdP-ASSERTED
            </span>
          ) : (
            <span className="mono dim" title="Stable subject from the DoD identity service">
              {current.subject_id}
            </span>
          )}
        </>
      ) : null}
    </div>
  );
}
