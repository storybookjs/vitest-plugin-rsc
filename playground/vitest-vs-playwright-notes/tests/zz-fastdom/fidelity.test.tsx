import { userEvent } from "@testing-library/user-event";
import { test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { click, expect, fill, press, screen, type Found } from "#test/fast-dom.ts";
import { Fixture } from "./fixture.tsx";

// The same clicks, fills and an Enter, by user-event (as test/user-event.ts)
// and by test/fast-dom.ts: React's handlers, the browser's own events, a
// form's submit, a checkbox by its label, Next's <Link> and <Form>. What
// fast-dom leaves out, by design, is the pointer's way to an element: React's
// onMouseEnter/onMouseLeave/onPointerEnter.

type Driver = {
  click(target: Found): Promise<void>;
  fill(target: Found, text: string): Promise<void>;
  press(target: Found, key: string): Promise<void>;
};
const user = userEvent.setup({ delay: null });
const drivers: Record<string, Driver> = {
  "user-event": {
    click: async (target) => user.click(await target.findElement()),
    fill: async (target, text) => {
      await user.clear(await target.findElement());
      if (text) await user.paste(text);
    },
    press: async (target, key) => {
      ((await target.findElement()) as HTMLElement).focus();
      await user.keyboard(`{${key}}`);
    },
  },
  "fast-dom": { click, fill, press },
};
const native = [
  "change",
  "input",
  "beforeinput",
  "submit",
  "focusin",
  "focusout",
  "select",
  "paste",
];
const logs: Record<string, { react: string[]; native: string[] }> = {};
const hover = /^(mouseenter|mouseleave|pointerenter) /;

async function run(driver: Driver) {
  const win = window as { fidelityLog?: string[] };
  win.fidelityLog = [];
  const nativeLog: string[] = [];
  const record = (event: Event) => {
    const target = event.target as Element;
    nativeLog.push(`${event.type} ${target.id || target.localName}`);
  };
  for (const type of native) document.addEventListener(type, record, true);
  try {
    await driver.click(screen.getByLabelText("Controlled"));
    await driver.fill(screen.getByLabelText("Controlled"), "abc");
    await driver.fill(screen.getByLabelText("Uncontrolled"), "xyz");
    await driver.click(screen.getByText("Check", { exact: false }));
    await driver.click(screen.getByRole("button", { name: "Press" }));
    await driver.fill(screen.getByLabelText("Query"), "hello");
    await driver.click(screen.getByRole("button", { name: "Go" }));
    await driver.press(screen.getByLabelText("Query"), "Enter");
    await expect.element(screen.getByText("Value: abc")).toBeInTheDocument();
    await expect.element(screen.getByText("3 characters")).toBeInTheDocument();
    await expect.element(screen.getByRole("checkbox")).toBeChecked();
  } finally {
    for (const type of native) document.removeEventListener(type, record, true);
  }
  return { react: [...win.fidelityLog], native: nativeLog };
}

for (const [name, driver] of Object.entries(drivers)) {
  test(`${name}: React's handlers and the browser's events`, async () => {
    await renderServer(<Fixture />, { url: "/fixture" });
    logs[name] = await run(driver);
    console.log(`FIDELITY ${name} ${JSON.stringify(logs[name])}`);
  });

  test(`${name}: Next's <Link> navigates`, async () => {
    await renderServer(<Fixture />, { url: "/fixture" });
    // The requests of the click: a hover prefetches with user-event.
    const fetch = window.fetch;
    const requests: string[] = [];
    window.fetch = (input, init) => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      requests.push(`${url.pathname}${headers.has("next-router-prefetch") ? " prefetch" : ""}`);
      return fetch(input, init);
    };
    try {
      await driver.click(screen.getByRole("link", { name: "Sign in link" }));
      await expect.element(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    } finally {
      window.fetch = fetch;
    }
    console.log(`FIDELITY link requests ${name} ${JSON.stringify(requests)}`);
  });

  test(`${name}: Next's <Form> navigates with its fields`, async () => {
    await renderServer(<Fixture />, { url: "/fixture" });
    await driver.fill(screen.getByLabelText("Form email"), "ada@example.com");
    await driver.click(screen.getByRole("button", { name: "Open sign-up" }));
    await expect
      .element(screen.getByRole("heading", { name: "Create an account" }))
      .toBeInTheDocument();
    expect(window.location.search).toBe("?email=ada%40example.com");
  });
}

// A page of the app after the nodes: a node does not render after one.
for (const [name, driver] of Object.entries(drivers)) {
  test(`${name}: a Server Action of a form with useActionState`, async () => {
    await renderServer({ url: "/sign-in" });
    await driver.fill(screen.getByLabelText("Email"), "nobody@example.com");
    await driver.fill(screen.getByLabelText("Password"), "wrong");
    await driver.click(screen.getByRole("button", { name: "Sign in" }));
    await expect.element(screen.getByText("Invalid email or password.")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Email")).toHaveValue("nobody@example.com");
  });
}

test("fast-dom sees what user-event sees, but the pointer's way", () => {
  const ue = logs["user-event"]!;
  const fast = logs["fast-dom"]!;
  console.log(
    `FIDELITY diff ${JSON.stringify({
      reactOnlyUserEvent: ue.react.filter((entry) => !fast.react.includes(entry)),
      reactOnlyFast: fast.react.filter((entry) => !ue.react.includes(entry)),
      nativeUserEvent: ue.native,
      nativeFast: fast.native,
    })}`,
  );
  expect(fast.react).toEqual(ue.react.filter((entry) => !hover.test(entry)));
});
