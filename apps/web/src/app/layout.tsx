import type { Metadata, Viewport } from "next";
import { Comic_Relief, Google_Sans } from "next/font/google";
import "./globals.css";

const comicRelief = Comic_Relief({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const googleSans = Google_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#007FFF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Veto | Runtime AI Agent Security Firewall",
    template: "%s | Veto",
  },
  description:
    "Zero-Trust, sub-millisecond runtime guardrails and policy enforcement for autonomous AI agents.",
  applicationName: "Veto",
  icons: {
    icon: [{ url: "/veto-logo.jpg", sizes: "32x32", type: "image/jpeg" }],
    apple: [{ url: "/veto-logo.jpg", sizes: "180x180", type: "image/jpeg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${comicRelief.variable} ${googleSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="ambient-glow-container">
          <div className="ambient-nebula-right"></div>
          <div className="ambient-nebula-center"></div>
        </div>
        <div className="page-container">{children}</div>
      </body>
    </html>
  );
}
