import { Callout } from "../app/components/callout.tsx";

// A component whose CSS styles every heading of its page. A story has the CSS
// of what its own story file imports, so not the stories of another file.
export default {
  title: "Server/Callout",
  component: Callout,
  args: { children: "Read this first" },
};

export const Default = {};
