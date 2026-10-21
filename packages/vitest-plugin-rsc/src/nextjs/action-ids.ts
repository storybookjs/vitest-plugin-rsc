import { registry, type ServerRequest } from "./registry.ts";

// The ids of the Server Actions that a request names, for the list of Server
// Actions that Next reads as it handles the request: see `serverActionsOf()`
// in ssr.ts.

const actionIdField = "$ACTION_ID_";
const actionReferenceField = "$ACTION_REF_";

/**
 * The ids of the Server Actions that `request` names. Next's router names the
 * one it calls in the `next-action` header. A form that the browser posts
 * itself, as React renders one for a Server Action, to work before the app
 * has hydrated or without JavaScript, names them in its fields, which Next's
 * `decodeAction()` and `areAllActionIdsValid()` read: a field
 * `$ACTION_ID_<id>`, or `$ACTION_REF_<n>` with the id in the field
 * `$ACTION_<n>:0`, for an action with bound arguments.
 *
 * Next reads the whole body of such a request first, and so does this: from
 * a copy, which leaves `request` a body of its own.
 */
export async function actionIdsOf(request: ServerRequest): Promise<string[]> {
  if (request.method !== "POST") return [];
  const header = request.headers.get("next-action");
  if (header !== null) return [header];
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\b/i.test(contentType)) return [];
  let { body } = request;
  if (body instanceof ReadableStream) [body, request.body] = body.tee();
  let form: FormData;
  try {
    form = await new registry.Response(body as BodyInit | null | undefined, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    // Next fails on the body too, as it reads it.
    return [];
  }
  const ids: string[] = [];
  for (const name of form.keys()) {
    if (name.startsWith(actionIdField)) ids.push(name.slice(actionIdField.length));
    if (!name.startsWith(actionReferenceField)) continue;
    const reference = form.get(`$ACTION_${name.slice(actionReferenceField.length)}:0`);
    try {
      const { id } = JSON.parse(typeof reference === "string" ? reference : "") as {
        id?: unknown;
      };
      if (typeof id === "string") ids.push(id);
    } catch {
      // Not a reference, which Next answers 400 for.
    }
  }
  return ids;
}
