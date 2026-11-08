import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  poweredByHeader: false,
};

export default nextConfig;
