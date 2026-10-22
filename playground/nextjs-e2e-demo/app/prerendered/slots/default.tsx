import { notFound } from "next/navigation";

// `children` has no page for `/prerendered/slots/duration`: a page load of it
// is the not-found page, and a navigation keeps the page that is there.
export default function SlotsDefault() {
  notFound();
}
