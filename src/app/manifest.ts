import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PDF Loader",
    short_name: "PDF Loader",
    description: "Internal loader for PDF invoice extraction into PostgreSQL.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#F3EADB",
    theme_color: "#B14A2F",
    icons: [
      {
        src: "/icons/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
