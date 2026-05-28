import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow up to 10 MB uploads through server actions (evidence files).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
