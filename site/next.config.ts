import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": ["./registry.json", "./src/components/ui/**"],
    "/r/[name]": ["./registry.json", "./src/components/ui/**"],
  },
};

export default nextConfig;
