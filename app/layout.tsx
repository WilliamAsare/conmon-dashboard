import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ConMon Dashboard",
    template: "%s | ConMon Dashboard",
  },
  description:
    "FedRAMP Continuous Monitoring dashboard for tracking vulnerabilities, POA&Ms, and compliance posture.",
  robots: {
    index: false, // Never index this app — it contains sensitive compliance data.
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
