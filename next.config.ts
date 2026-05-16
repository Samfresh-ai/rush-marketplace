import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_RUSH_HAS_ANTHROPIC_KEY: process.env.ANTHROPIC_API_KEY ? "true" : "false",
  },
  devIndicators: false,
  reactStrictMode: true,
  serverExternalPackages: [
    "@polkadot/api",
    "@polkadot/api-contract",
    "@polkadot/keyring",
    "@polkadot/util",
    "@polkadot/util-crypto",
  ],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
