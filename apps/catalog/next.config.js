/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  basePath: "/catalog",
  async redirects() {
    return [{ source: "/", destination: "/catalog", permanent: false, basePath: false }];
  }
};
