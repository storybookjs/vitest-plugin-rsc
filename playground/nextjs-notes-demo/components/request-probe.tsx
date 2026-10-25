"use client";

import { useState, type FormEvent } from "react";

// The requests of a Client Component to a route handler of the app
// (app/api/echo/route.ts), with the page's own `fetch`, `XMLHttpRequest`,
// `FormData` and `Response`: see app/request-probe/page.node.test.tsx.

type Echo = { method: string; cookie?: string; title?: string; file?: string };

export function RequestProbe() {
  const [answer, setAnswer] = useState("none");

  async function fetchEcho() {
    const response = await fetch("/api/echo");
    const echo = (await response.json()) as Echo;
    const setCookie = response.headers.get("set-cookie") ?? "hidden";
    setAnswer(`${response.status} ${echo.method} cookie=${echo.cookie} set-cookie=${setCookie}`);
  }

  function requestEcho() {
    const request = new XMLHttpRequest();
    request.onload = () => {
      const echo = JSON.parse(request.responseText) as Echo;
      setAnswer(`xhr ${request.status} ${echo.method} cookie=${echo.cookie}`);
    };
    request.open("GET", "/api/echo");
    request.send();
  }

  async function followRedirect() {
    const response = await fetch("/api/echo/redirect");
    const echo = (await response.json()) as Echo;
    setAnswer(`redirected=${response.redirected} ${new URL(response.url).pathname} ${echo.method}`);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // The page reads the file with its own Response, as a browser does.
    const read = await new Response(form.get("file") as File).text();
    const response = await fetch("/api/echo", { method: "POST", body: form });
    const echo = (await response.json()) as Echo;
    setAnswer(`${echo.title} ${echo.file} read=${read}`);
  }

  return (
    <section>
      <p>answer: {answer}</p>
      <button onClick={fetchEcho}>fetch</button>
      <button onClick={requestEcho}>xhr</button>
      <button onClick={followRedirect}>redirect</button>
      <form onSubmit={upload}>
        <input name="title" aria-label="title" />
        <input type="file" name="file" aria-label="file" />
        <button>upload</button>
      </form>
    </section>
  );
}
