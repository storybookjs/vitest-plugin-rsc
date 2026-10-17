import { reports } from "host-report";
import { cleanup, loadClientModule, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { renderCallout } from "./callout.tsx";
import { renderGreeting } from "./greeting.tsx";
import { show, state } from "./state.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, with the browser's globals, as a test
// file does. What it shows is in its query: `?view=page` for a page of the
// app, `?view=node` for a node in a container of the host, `?view=switch`
// for one node after another in the one document, as Storybook's canvas
// renders story after story, `?view=client` for a file of the host with
// `"use client"`, `?view=package` for the ones of a package of the host in
// `node_modules`: one by the name of the package, one through its entry.
// `?view=module` renders a component of a file of the host with
// `"use client"` itself, as a framework renders a story, `?view=action`
// loads such a file while a node of the app is open, and `?view=after-page`
// renders its components after the page it loaded during. A second page of
// the host, with a node of its own, is callout.html.
const view = new URLSearchParams(window.location.search).get("view");
await show(async () => {
  if (view === "client" || view === "package") {
    // A client boundary, as in React: the file runs in the browser layer.
    if (view === "client") await import("./client.tsx");
    else {
      await import("host-package/client-greeting");
      await import("host-package");
    }
    // The report it made, through the page's own `host-report`.
    state.__hostReports = reports;
    return;
  }
  const container = document.getElementById("host-root")!;
  if (view === "module") {
    // What the rsc layer has of the file: a client reference module, with a
    // reference for each export. The file's own exports are the browser
    // layer's, and so is what renders them.
    const reference = await import("./client-module.tsx");
    const loaded = await loadClientModule(reference);
    const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
    renderClient(loaded.Badge, container);
    const plain = await import("./state.ts");
    // The file imported again, as Vite's client imports it after a change:
    // with a timestamp, another module of the browser, whose prefix runs the
    // file again. Vite's dev server takes the timestamp out of the id. A
    // static build has no change, and no server to ask for such a module.
    const update = `./client-module.tsx?t=${Date.now()}`;
    const again: typeof reference | undefined = import.meta.env.DEV
      ? await import(/* @vite-ignore */ update)
      : undefined;
    state.__hostModule = {
      reference: Reflect.get(reference.Badge, "$$typeof") === Symbol.for("react.client.reference"),
      same: (await loadClientModule(reference)) === loaded,
      again: again && (await loadClientModule(again)) !== loaded,
      kept: (await loadClientModule(reference)) === loaded,
      plain: (await loadClientModule(plain)) === plain,
      // A file of the app with the directive.
      app: await loadClientModule(await import("../app/components/counter.tsx")).then(
        () => "loaded",
        (error: Error) => error.message,
      ),
    };
    state.__hostReports = reports;
    return;
  }
  if (view === "action") {
    // A node of the app with a Server Action, and then a file of the host
    // with `"use client"` while the node is open, as a page of a framework's
    // docs shows a server story next to a client one.
    const { Like } = await import("../app/components/like.tsx");
    await renderServer(<Like />, { container, hostFiles: [] });
    await loadClientModule(await import("./client-module.tsx"));
    state.__hostReports = reports;
    return;
  }
  if (view === "after-page") {
    // A file of the host with `"use client"` that loads while a page of the
    // app is open, as a framework prepares the next story before it leaves
    // the one before. Then that page is left, and another one comes and goes.
    await renderServer({ url: "/" });
    const { Badge, Like } = await loadClientModule(await import("./client-module.tsx"));
    await cleanup();
    await renderServer({ url: "/" });
    await cleanup();
    const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
    for (const Component of [Badge, Like]) {
      renderClient(Component, container.appendChild(document.createElement("div")));
    }
    return;
  }
  if (view === "switch") {
    // The first node, with its stylesheet, and then `cleanup()`, as Vitest
    // runs it between tests and Storybook's framework will between stories.
    // The next `renderServer()` would leave the first node by itself too.
    await renderCallout(container);
    state.__hostCalloutLinked =
      document.querySelector("link[rel=stylesheet][href*='callout.module']") !== null;
    await cleanup();
  }
  const { response } =
    view === "node" || view === "switch"
      ? await renderGreeting(container)
      : await renderServer({ url: "/" });
  state.__hostResponse = { status: response.status, url: response.url };
});
