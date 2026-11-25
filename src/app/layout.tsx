import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa";
import { StartupSplash } from "@/components/startup-splash";
export const metadata: Metadata = {
  title: {
    default: "iRRELEVANT OS — Build your position.",
    template: "%s | iRRELEVANT OS",
  },
  description: "The client acquisition workspace for iRRELEVANT CO.",
  applicationName: "iRRELEVANT OS",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "iRRELEVANT OS",
  },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101110",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <StartupSplash />
        <noscript>
          <style>{`.startup-splash { display: none !important; }`}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only z-50 bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed"
        >
          Skip to content
        </a>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
