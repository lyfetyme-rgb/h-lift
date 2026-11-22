import Link from "next/link";

/** Friendly 404 — also covers stale SMS deep links to retired alert views. */
export default function NotFound() {
  return (
    <div className="failure" role="alert">
      <h2>Page not found</h2>
      <p>
        This link may be out of date. Return to the overview and use the navigation to find the
        current view.
      </p>
      <Link href="/" className="badge b-info">Go to overview →</Link>
    </div>
  );
}
