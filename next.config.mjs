/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  output: "standalone",
  // Skip lint/type checks during `next build` — `bun run check` enforces these locally.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Router cache: set both client-side stale times to 0 so navigations always refetch.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
    // Bundle the sample test PDFs into the standalone Lambda output so
    // /api/test-pdfs can stream them back in production. Without this,
    // Next.js' file tracing skips docs/ and the route 500s on Amplify.
    outputFileTracingIncludes: {
      "/api/test-pdfs": [
        "./docs/test-pdfs/referrals/**/*.pdf",
        "./docs/test-pdfs/addressees/**/*.pdf",
        "./docs/test-pdfs/results/**/*.pdf",
        "./docs/test-pdfs/originals/referral_dummy.pdf",
      ],
    },
  },
  ...(isDev && {
    // Disable webpack persistent filesystem cache (.next/cache/webpack).
    // Slower restarts, but no stale chunks between dev sessions.
    webpack: (config, { dev }) => {
      if (dev) {
        config.cache = false;
      }
      return config;
    },
    // Send aggressive no-cache headers on every response in dev so the browser
    // never serves a stale page or asset from its HTTP cache.
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            {
              key: "Cache-Control",
              value: "no-store, no-cache, must-revalidate, max-age=0",
            },
            { key: "Pragma", value: "no-cache" },
            { key: "Expires", value: "0" },
            { key: "Surrogate-Control", value: "no-store" },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
