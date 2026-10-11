import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apple Support AI — Evidence-Grounded Support Agent",
  description:
    "Phase 1 dashboard for the Apple Support AI project: dataset statistics, exploratory data analysis and reconstructed AppleSupport conversations from the Customer Support on Twitter dataset.",
  keywords: [
    "Apple Support",
    "customer support",
    "EDA",
    "retrieval-augmented generation",
    "Hiver",
    "twcs",
  ],
  authors: [{ name: "Hiver Technical Assignment" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Apple Support AI — Evidence-Grounded Support Agent",
    description:
      "Phase 1 — Data Foundation: dataset statistics, EDA and reconstructed AppleSupport conversations.",
    siteName: "Apple Support AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
