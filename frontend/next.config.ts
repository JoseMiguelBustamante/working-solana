import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@coral-xyz/anchor", "@solana/web3.js"],
  // WSL2 demo: allow browser access from Windows host via the WSL IP.
  allowedDevOrigins: ["172.23.246.222", "localhost"],
  async rewrites() {
    return [
      // Same-origin RPC proxy: the browser talks to port 3000 and the Next
      // server (inside WSL) forwards to the local validator loopback.
      // This fixes "Failed to fetch" when the page is opened via the WSL IP
      // or port-forwarded localhost, because the validator only binds 127.0.0.1.
      {
        source: "/api/rpc/:path*",
        destination: "http://127.0.0.1:8899/:path*",
      },
    ];
  },
  webpack: (config) => {
    // rpc-websockets requires cjs uuid; Next detects the package's ESM
    // condition and refuses. Pin the real cjs entry by absolute path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const uuidCjsPath = require.resolve("uuid");
    config.resolve.alias = { ...config.resolve.alias, uuid: uuidCjsPath };
    return config;
  },
};

export default nextConfig;
