import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./registry.json", "./src/components/ui/**", "./registry/**"],
    "/r/[name]": ["./registry.json", "./src/components/ui/**", "./registry/**"],
  },
};

export default nextConfig;
