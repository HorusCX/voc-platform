import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Changed to Inter
import { AuthProvider } from "@/contexts/AuthContext";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { AppLayout } from "@/components/layout/AppLayout";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HorusCX VoC Dashboard",
  description: "Voice of Customer Analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <AuthProvider>
          <PortfolioProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </PortfolioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
