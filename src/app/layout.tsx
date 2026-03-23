import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ElevenLabs to Inworld Migration",
  description: "Migrate ElevenLabs voices to Inworld voice clones",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">
        <main className="overflow-auto">{children}</main>
      </body>
    </html>
  );
}
