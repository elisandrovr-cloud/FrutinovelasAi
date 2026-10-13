/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fruti/shared"],
  output: "standalone",
  images: { unoptimized: true },
};
export default nextConfig;
