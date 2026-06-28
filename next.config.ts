import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  /** Dev и production build не делят одну папку — иначе HMR ломает кэш */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["framer-motion"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Меньше «битых» vendor-chunks при частых правках /floor (~3000 модулей)
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
