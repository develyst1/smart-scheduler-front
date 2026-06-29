import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: [
    "localhost",
    "https://did.smartalliance.co.th",
    "did.smartalliance.co.th",
    "localhost:3001",
    "192.168.33.162",
    "192.168.33.162:3001",
    "192.168.33.166",
    "192.168.33.160",
    "192.168.33.166:3000",
    "192.168.33.160:6601",
    "192.168.33.42",
    "154.197.124.206",
  ],
};
export default nextConfig;
