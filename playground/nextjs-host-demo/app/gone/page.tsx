import { notFound } from "next/navigation";

// A page that is not there: Next renders its not-found page in its place.
export default function Gone(): never {
  notFound();
}
