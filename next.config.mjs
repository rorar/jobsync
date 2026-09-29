/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Build output directory. Default `.next`, overridable so the E2E production
  // build (scripts/e2e-prod-build.sh, which sets `.next-e2e`) does not share a
  // directory with the dev server's Turbopack cache. They are different build
  // pipelines writing the same manifest filenames: sharing means every switch
  // between `next dev` and `next start` silently invalidates the other one's
  // work, and a stale manifest surfaces as "Internal Server Error" rather than
  // as a cache problem — which is what scripts/clean.sh exists to undo.
  //
  // MUST be identical at build time and at start time: `next start` resolves
  // BUILD_ID from this path, so a server started without the variable looks for
  // a build that is not there and exits with "Could not find a production
  // build".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((o) => o.trim())
    : [],
};

export default nextConfig;
