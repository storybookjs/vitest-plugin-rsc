import { reports } from "host-report";
import { tags } from "host-report/tags";
import {
  cleanup,
  handleRequest,
  linkStylesheetsOf,
  loadClientModule,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { renderCallout } from "./callout.tsx";
import { greetingFor, renderGreeting } from "./greeting.tsx";
import { renderTag } from "./tag.tsx";
import { show, state } from "./state.ts";

// The host of the app: what a test file is to Vitest, and a story to
// Storybook. It runs in the rsc layer, with the browser's globals, as a test
// file does. What it shows is in its query: `?view=page` for a page of the
// app, at `?url=` or `/`, `?view=node` for a node in a container of the
// host, `?view=switch` for one node after another in the one document, as
// Storybook's canvas renders story after story, `?view=app-file` for a node
// whose `hostFiles` name a file of the app, `?view=client` for a file of the
// host with `"use client"`, `?view=package` for the ones of a package of
// the host in `node_modules`: one by the name of the package, one through
// its entry.
// `?view=module` renders a component of a file of the host with
// `"use client"` itself, as a framework renders a story, and
// `?view=in-place` renders it again after a change. `?view=action`
// loads such a file while a node of the app is open, and `?view=after-page`
// renders its components after the page it loaded during. `?view=pages`
// moves the URL of the host between two pages of the app. `?view=tag`
// renders a node with a Client Component of a package that is not
// pre-bundled, and leaves what it tagged through the page's
// `host-report/tags`, and `?view=rerender` renders a node again with other props,
// without a page load. `?view=stored` opens a page and stores in the
// browser, as a story's `beforeEach` does. `?view=early` renders no route,
// as a story of a Client Component does, and leaves the test a way to send
// a request to the app. A second page of the host, with a node of its own,
// is callout.html.
const view = new URLSearchParams(window.location.search).get("view");
await show(async () => {
  if (view === "client" || view === "package") {
    // A client boundary, as in React: the file runs in the browser layer.
    // The host uses it as it loads, with the stylesheets of what it renders.
    if (view === "client") {
      await import("./client.tsx");
      await linkStylesheetsOf(["host/client.tsx"]);
    } else {
      await import("host-package/client-greeting");
      await import("host-package");
    }
    // The report it made, through the page's own `host-report`.
    state.__hostReports = reports;
    return;
  }
  const container = document.getElementById("host-root")!;
  if (view === "early") {
    // What a page of the host does that renders no route: a `fetch` of a file
    // of its own, a file of the host with `"use client"`, and `cleanup()`, as
    // a framework cleans up before each story. None of it is the server's.
    state.__hostFetched = (await fetch("./callout.html")).status;
    const { Badge } = await loadClientModule(await import("./client-module.tsx"));
    const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
    renderClient(Badge, container);
    await cleanup();
    state.__hostReadyAt = performance.now();
    state.__hostRequest = (path) =>
      handleRequest(path).then(
        (response) => response.status,
        (error: Error) => error.name,
      );
    state.__hostCleanup = cleanup;
    return;
  }
  if (view === "module") {
    // What the rsc layer has of the file: a client reference module, with a
    // reference for each export. The file's own exports are the browser
    // layer's, and so is what renders them.
    const reference = await import("./client-module.tsx");
    const loaded = await loadClientModule(reference);
    const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
    await linkStylesheetsOf(["host/client-module.tsx"]);
    renderClient(loaded.Badge, container);
    const plain = await import("./state.ts");
    // The file imported again with a query that Vite's dev server takes out
    // of the id: another module in the host's document, whose line gets the
    // evaluation of the first, as no module has changed. A static build has
    // no server to ask for such a module.
    const update = `./client-module.tsx?t=${Date.now()}`;
    const again: typeof reference | undefined = import.meta.env.DEV
      ? await import(/* @vite-ignore */ update)
      : undefined;
    state.__hostModule = {
      reference: Reflect.get(reference.Badge, "$$typeof") === Symbol.for("react.client.reference"),
      same: (await loadClientModule(reference)) === loaded,
      again: again && (await loadClientModule(again)) === loaded,
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
  if (view === "in-place") {
    const { renderInPlace } = await import("./in-place.tsx");
    await renderInPlace(container);
    state.__hostReports = reports;
    return;
  }
  if (view === "tag") {
    await renderTag(container);
    // What the component gave a module of the page through a module of its
    // package without side effects: the page's own instance of it.
    state.__hostTags = tags;
    return;
  }
  if (view === "rerender") {
    const { rerender } = await renderGreeting(container);
    state.__hostRerender = (name) => rerender(greetingFor(name));
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
    // the one before: loaded, not used yet. Then the host uses it, and a page
    // comes and goes, which its stylesheet steps aside for. A use that ends
    // while a page is open takes it, and `cleanup()` ends every use. The host
    // uses the file again, as a framework shows another story of it.
    const badgeLinked = () => document.querySelector("link[href*='badge.module']") !== null;
    const linked: Record<string, boolean> = {};
    const first = await renderServer({ url: "/" });
    const file = await import("./client-module.tsx");
    linked.loadedDuringPage = badgeLinked();
    await first.unmount();
    await linkStylesheetsOf(["host/client-module.tsx"]);
    linked.used = badgeLinked();
    const second = await renderServer({ url: "/" });
    linked.duringPage = badgeLinked();
    await second.unmount();
    linked.pageLeft = badgeLinked();
    await cleanup();
    linked.cleanedUp = badgeLinked();
    const use = new AbortController();
    await linkStylesheetsOf(["host/client-module.tsx"], { signal: use.signal });
    const third = await renderServer({ url: "/" });
    use.abort();
    await third.unmount();
    linked.endedDuringPage = badgeLinked();
    const { Badge, Like } = await loadClientModule(file);
    await linkStylesheetsOf(["host/client-module.tsx"]);
    state.__hostBadgeLinked = linked;
    const { renderClient } = await loadClientModule(await import("./render-client.tsx"));
    for (const Component of [Badge, Like]) {
      renderClient(Component, container.appendChild(document.createElement("div")));
    }
    return;
  }
  if (view === "stored") {
    await renderServer({ url: "/" });
    localStorage.setItem("visitor", "Ada");
    sessionStorage.setItem("visitor", "Ada");
    return;
  }
  if (view === "pages") {
    // A page of the app, and another one after the host moved its URL, as a
    // host says in its URL what it shows. Leaving each page puts back the
    // URL that the host had as that page opened. One that it set while the
    // page was open went with the page.
    await renderServer({ url: "/" });
    await cleanup();
    window.history.replaceState(null, "", "?view=pages&shows=second");
    await renderServer({ url: "/" });
    window.history.replaceState(null, "", "?view=pages&shows=third");
    await cleanup();
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
      : view === "app-file"
        ? await renderGreeting(container, ["app/components/greeting.tsx"])
        : await renderServer({
            url: new URLSearchParams(window.location.search).get("url") ?? "/",
          });
  state.__hostResponse = { status: response.status, url: response.url };
});
