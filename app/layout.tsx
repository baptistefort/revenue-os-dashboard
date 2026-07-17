import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const anthropic = localFont({
  src: "../public/fonts/AnthropicSansVariable.ttf",
  variable: "--font-anthropic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Revenue OS — Infrastructure IA de prospection",
  description: "Prototype de cockpit de prospection B2B agentique",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={anthropic.variable}>
      <body>{children}</body>
    </html>
  );
}
