import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb', // Vendor page can return many orders with items; default 1MB was truncating
    },
  },
};

export default nextConfig;
