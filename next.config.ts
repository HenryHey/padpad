import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === "true";
const [repoOwner, repoName] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];

const isUserSite =
  Boolean(repoOwner && repoName) &&
  repoName.toLowerCase() === `${repoOwner.toLowerCase()}.github.io`;

const defaultBasePath = isGithubActions && repoName && !isUserSite ? `/${repoName}` : "";

const computedBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? defaultBasePath;

const basePath = computedBasePath || undefined;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
