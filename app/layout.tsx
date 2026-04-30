import type { Metadata } from "next";
import "./globals.css";
import { auth } from "@/lib/auth";
import { SessionProvider } from "./components/SessionProvider";

// Force dynamic rendering so all pages go through the server (Lambda on Amplify).
// Without this, Next.js pre-renders pages as static HTML and CloudFront serves them
// directly from cache, bypassing the middleware auth check entirely.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PDF to HL7 Converter",
  description: "Convert PDF files to HL7 v2.4 format with embedded PDF for Genie",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
