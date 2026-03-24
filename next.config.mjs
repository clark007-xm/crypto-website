/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production"

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },

  /* ── Production optimizations ── */
  compiler: {
    // Remove console.log in production (keep console.error and console.warn)
    removeConsole: isProd
      ? {
        exclude: ["error", "warn"],
      }
      : false,
  },

  /* ── Webpack customization for production ── */
  webpack: (config, { dev }) => {
    if (!dev) {
      // Enable aggressive minification and obfuscation
      config.optimization = {
        ...config.optimization,
        minimize: true,
        minimizer: config.optimization.minimizer?.map((minimizer) => {
          // Configure TerserPlugin for obfuscation
          if (minimizer.constructor.name === "TerserPlugin") {
            return new minimizer.constructor({
              ...minimizer.options,
              terserOptions: {
                ...minimizer.options?.terserOptions,
                compress: {
                  ...minimizer.options?.terserOptions?.compress,
                  drop_console: true, // Backup: also drop console via terser
                  drop_debugger: true,
                  pure_funcs: ["console.log", "console.info", "console.debug"],
                },
                mangle: {
                  ...minimizer.options?.terserOptions?.mangle,
                  safari10: true,
                  // Obfuscate variable names
                  properties: {
                    regex: /^_/, // Only mangle properties starting with _
                  },
                },
                format: {
                  comments: false, // Remove all comments
                },
              },
            })
          }
          return minimizer
        }),
      }
    }
    return config
  },

  turbopack: {},

  /* ── Security headers ── */
  headers: async () => {
    if (!isProd) return []
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ]
  },

  /* ── Production source maps (disabled for security) ── */
  productionBrowserSourceMaps: false,
}

export default nextConfig
