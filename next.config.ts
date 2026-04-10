import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure data/ files are bundled with serverless functions
  outputFileTracingIncludes: {
    "/api/chat": ["./data/chunks-*.jsonl"],
  },
};

export default nextConfig;
