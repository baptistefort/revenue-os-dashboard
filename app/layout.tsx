import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPS — L’infrastructure IA du dirigeant",
  description: "Toute votre entreprise, ses données et sa mémoire dans une infrastructure IA unique.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
