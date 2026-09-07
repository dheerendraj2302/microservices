/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  basePath: "/orders",
  async redirects() {
    return [{ source: "/", destination: "/orders", permanent: false, basePath: false }];
  }
};
