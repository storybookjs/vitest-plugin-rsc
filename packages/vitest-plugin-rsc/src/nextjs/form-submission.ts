// A form that the browser submits itself, without Next's router or React:
// what its navigation has is the entries of the form, not the body the
// browser would send. The body is in the encoding that the form asks for, as
// a browser encodes it. For a form of a Server Action without JavaScript
// React asks for `multipart/form-data`. The default of HTML is
// `application/x-www-form-urlencoded`, which Next's server takes for a form
// that is no Server Action.

/**
 * The encoding of a submission whose navigation `source` is: the
 * `formenctype` of the button that submits the form, or the `enctype` of the
 * form, which `form.submit()` submits itself.
 */
export function enctypeOf(source: Element | null): string {
  if (source instanceof HTMLFormElement) return source.enctype;
  if (source instanceof HTMLButtonElement || source instanceof HTMLInputElement) {
    if (source.hasAttribute("formenctype")) return source.formEnctype;
    if (source.form) return source.form.enctype;
  }
  return "application/x-www-form-urlencoded";
}

/**
 * The body of a form with the entries of `formData`, in the encoding
 * `enctype`. A `Blob` with the type as a browser sends it, without a charset:
 * Next's server tells a form from a Server Action by the exact type.
 */
export function formBody(formData: FormData, enctype: string): FormData | Blob {
  if (enctype === "multipart/form-data") return formData;
  // The encodings of text send the name of a file.
  const entries = Array.from(formData, ([name, value]): [string, string] => [
    name,
    typeof value === "string" ? value : value.name,
  ]);
  if (enctype === "text/plain") {
    return new Blob([entries.map(([name, value]) => `${name}=${value}\r\n`).join("")], {
      type: "text/plain",
    });
  }
  return new Blob([String(new URLSearchParams(entries))], {
    type: "application/x-www-form-urlencoded",
  });
}
