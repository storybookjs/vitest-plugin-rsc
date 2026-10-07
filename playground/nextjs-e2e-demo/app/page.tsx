import { Counter } from "./components/counter.tsx";

export default function HomePage() {
  return (
    <>
      <h1>Home</h1>
      <Counter />
      {/* Not a next/link, so that the browser loads the page. */}
      {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
      <a href="/notes">All notes, the long way</a>
    </>
  );
}
