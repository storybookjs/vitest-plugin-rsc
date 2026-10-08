import { Inter } from "next/font/google";
import localFont from "next/font/local";

// Downloaded from Google Fonts when it is first loaded. Not in the tests,
// see vitest.config.ts.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// A file of the app. Geist, under the license next to it.
export const geist = localFont({ src: "./geist-latin.woff2", variable: "--font-geist" });
