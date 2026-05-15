import { Geist, Geist_Mono, Roboto } from "next/font/google";
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

const robotoWeighted = Roboto({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-roboto-weighted",
});

const localGeist = localFont({
  src: "./fixtures/geist-latin.woff2",
  variable: "--font-local-geist",
  display: "swap",
});

const localMulti = localFont({
  src: [
    { path: "./fixtures/geist-latin.woff2", weight: "400", style: "normal" },
    { path: "./fixtures/geist-latin.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-local-multi",
  declarations: [{ prop: "font-feature-settings", value: '"kern"' }],
});

export default function FontPage() {
  return (
    <section
      className={`${geistSans.variable} ${geistMono.variable} ${robotoWeighted.variable} ${localGeist.variable} ${localMulti.variable} ${exportedGoogleFont.variable} ${exportedLocalFont.variable}`}
      data-testid="font-scope"
    >
      <h1 className={geistSans.className}>Next font route</h1>
      <code className={geistMono.className}>font-family: Geist Mono</code>
      <p className={localGeist.className}>Local font rendered</p>
      <p className={localMulti.className}>Local multi font rendered</p>
      <p className={robotoWeighted.className}>Google weighted font rendered</p>
      <p className={exportedGoogleFont.className}>Exported Google font rendered</p>
      <p className={exportedLocalFont.className}>Exported local font rendered</p>
      <p data-testid="google-style-family">{exportedGoogleFont.style.fontFamily}</p>
      <p data-testid="google-weighted-style-weight">
        {String(robotoWeighted.style.fontWeight ?? "none")}
      </p>
      <p data-testid="google-weighted-style-style">
        {String(robotoWeighted.style.fontStyle ?? "none")}
      </p>
      <p data-testid="local-style-family">{exportedLocalFont.style.fontFamily}</p>
      <p data-testid="local-multi-style-family">{localMulti.style.fontFamily}</p>
    </section>
  );
}
