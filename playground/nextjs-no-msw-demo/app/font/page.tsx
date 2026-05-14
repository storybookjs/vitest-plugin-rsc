import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { exportedGoogleFont, exportedLocalFont } from "./exported-fonts";

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
      className={`${geistSans.variable} ${geistMono.variable} ${localGeist.variable} ${exportedGoogleFont.variable} ${exportedLocalFont.variable}`}
      data-testid="font-scope"
    >
      <h1 className={geistSans.className}>Next font route</h1>
      <code className={geistMono.className}>font-family: Geist Mono</code>
      <p className={localGeist.className}>Local font rendered</p>
      <p className={exportedGoogleFont.className}>Exported Google font rendered</p>
      <p className={exportedLocalFont.className}>Exported local font rendered</p>
      <p data-testid="google-style-family">{exportedGoogleFont.style.fontFamily}</p>
      <p data-testid="local-style-family">{exportedLocalFont.style.fontFamily}</p>
    </section>
  );
}
