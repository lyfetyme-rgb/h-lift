/** @type {import('next').NextConfig} */
const securityHeaders = [
  // NIST 800-53 SC-8 / RFC 8446: force TLS and downgrade protection.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // W3C Content Security Policy. 'unsafe-inline' is required for the Next.js
  // inline bootstrap chunks; tighten to nonces when a nonce-aware proxy is used.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // TAXII 2.1 canonical URLs end with a trailing slash; serve both shapes
  // instead of redirecting, so TAXII clients see stable URLs.
  skipTrailingSlashRedirect: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
