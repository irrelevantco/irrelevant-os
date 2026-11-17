import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "iRRELEVANT OS",
    short_name: "iRRELEVANT",
    description: "Build your position. Your client acquisition workspace.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#101110",
    theme_color: "#101110",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
