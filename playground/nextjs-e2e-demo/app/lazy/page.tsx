import dynamic from "next/dynamic";
import { BrowserOnlyChart } from "./browser-only-chart.tsx";

// A Server Component that loads a component when it renders.
const Summary = dynamic(() => import("./summary.tsx"));

export default function LazyPage() {
  return (
    <>
      <h1>Lazy</h1>
      <Summary />
      <BrowserOnlyChart />
    </>
  );
}
