"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface PrincipalView {
  subject_id: string;
  display_name: string;
  role_label: string;
  facility_id: string | null;
  credential_assurance: string;
}

export default function IdentityBar() {
  const router = useRouter();
  const [current, setCurrent] = useState<PrincipalView | null>(null);
  const [people, setPeople] = useState<PrincipalView[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/identity", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.current ?? null);
        setPeople(d.principals ?? []);
      })
      .catch(() => undefined);
  }, []);

  const choose = (subject: string) => {
    setBusy(true);
    document.cookie = `hlift_subject=${encodeURIComponent(subject)}; path=/; max-age=86400; samesite=lax`;
    // The server components read the cookie; refresh re-renders the shell and
    // every page under the new authenticated principal.
    router.refresh();
    setTimeout(() => setBusy(false), 400);
  };

  return (
    <div className="identity-bar">
      <span className="mono dim">acting principal</span>
      <select
        aria-label="acting principal"
        value={current?.subject_id ?? ""}
        disabled={busy || people.length === 0}
        onChange={(e) => choose(e.target.value)}
      >
        {people.map((p) => (
          <option key={p.subject_id} value={p.subject_id}>
            {p.display_name} · {p.role_label} · {p.facility_id ?? "NO FACILITY"}
          </option>
        ))}
      </select>
      {current ? (
        <>
          <span className="badge b-info" title="Credential assurance from the identity adapter">
            {current.credential_assurance}
          </span>
          <span className="mono dim" title="Stable subject from the DoD identity service">
            {current.subject_id}
          </span>
        </>
      ) : null}
    </div>
  );
}
