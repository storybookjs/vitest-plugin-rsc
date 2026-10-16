import { createRoot, type Root } from "react-dom/client";

// Like the imperative API of a toast library: the first toast makes a React
// root of its own, which every toast after it renders into again. The
// library keeps it, as long as the page is there.
let root: Root | undefined;

export function toast(message: string): void {
  root ??= createRoot(document.body.appendChild(document.createElement("div")));
  root.render(<p>{message}</p>);
}
