import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/admin",
        "/settings",
        "/upload",
        "/notifications",
        "/welcome",
        "/login",
        "/design",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
