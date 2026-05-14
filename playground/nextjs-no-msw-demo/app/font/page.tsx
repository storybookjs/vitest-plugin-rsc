import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const localGeist = localFont({
  src: "./fixtures/geist-latin.woff2",
  variable: "--font-local-geist",
  display: "swap",
});

export default function FontPage() {
  return (
    <section
      className={`${geistSans.variable} ${geistMono.variable} ${localGeist.variable}`}
      data-testid="font-scope"
    >
      <h1 className={geistSans.className}>Next font route</h1>
      <code className={geistMono.className}>font-family: Geist Mono</code>
      <p className={localGeist.className}>Local font rendered</p>
    </section>
  );
}
