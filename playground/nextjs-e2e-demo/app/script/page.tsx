import Script from "next/script";

const afterInteractive = `document.documentElement.dataset.scripts += " afterInteractive";`;

export default function ScriptPage() {
  return (
    <>
      <h1>Scripts</h1>
      <Script src="/scripts/before-interactive.js" strategy="beforeInteractive" />
      <Script id="after-interactive">{afterInteractive}</Script>
    </>
  );
}
