import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sql.js requires WASM support
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
