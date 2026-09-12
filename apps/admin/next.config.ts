import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal, self-contained `.next/standalone` build for deployment without pnpm/node_modules
  // on the target server - see https://nextjs.org/docs/app/api-reference/config/next-config-js/output.
  // `outputFileTracingRoot` must point at the monorepo root (two levels up) so the trace picks
  // up the `@arcana/shared` workspace package this app depends on.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
