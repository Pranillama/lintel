import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

const poppins = Poppins({ weight: ["300", "400", "500", "600"], subsets: ["latin"], variable: "--font-poppins", display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Lintel · AP Command Center",
  description: "AI reads the bill. Code decides. People own the exceptions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${plexMono.variable}`}>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
