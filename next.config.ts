import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Self-contained server bundle for the Docker image (deploy/).
  output: "standalone",
};

export default nextConfig;
