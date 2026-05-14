import { Geist } from "next/font/google";
import localFont from "next/font/local";

export const exportedGoogleFont = Geist({
  subsets: ["latin"],
  variable: "--font-exported-google",
});

export const exportedLocalFont = localFont({
  src: "./fixtures/geist-latin.woff2",
  variable: "--font-exported-local",
  adjustFontFallback: "Arial",
});
