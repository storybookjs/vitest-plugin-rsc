import marked from "marked";
import sanitizeHtml from "sanitize-html";
import type { ReactNode } from "react";

const allowedTags = sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3"]);
const allowedAttributes = Object.assign({}, sanitizeHtml.defaults.allowedAttributes, {
  img: ["alt", "src"],
});

export default function NotePreview({ children }: { children?: ReactNode }) {
  const markdown = typeof children === "string" ? children : "";

  return (
    <div className="note-preview">
      <div
        className="text-with-markdown"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(marked(markdown), {
            allowedTags,
            allowedAttributes,
          }),
        }}
      />
    </div>
  );
}
