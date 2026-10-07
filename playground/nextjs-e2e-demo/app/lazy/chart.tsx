"use client";

export default function Chart() {
  return <p>Chart: drawn in a {typeof window === "undefined" ? "server" : "browser"}</p>;
}
