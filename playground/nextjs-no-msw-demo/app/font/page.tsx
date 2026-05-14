import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function FontPage() {
  return (
    <section className={`${geistSans.variable} ${geistMono.variable}`} data-testid="font-scope">
      <h1 className={geistSans.className}>Next font route</h1>
      <code className={geistMono.className}>font-family: Geist Mono</code>
    </section>
  );
}
