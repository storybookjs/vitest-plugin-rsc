import { screen, waitFor } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  expectToHaveBeenNavigatedTo,
  NextRouter,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { setNote } from "../libs/notes";
import { getUser } from "../libs/session";

import NoteEditor from "./note-editor";

test("note editor saves note and redirects after submitting note", async () => {
  const created_by = "kasper";
  vi.mocked(getUser).mockReturnValue(created_by);
  const title = "This is a title";
  const body = "This is a body";

  await renderServer(
    <NextRouter url="/note/edit">
      <NoteEditor noteId={null} initialTitle={title} initialBody={body} />
    </NextRouter>,
  );

  await userEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
  const id = Date.now().toString();
  await waitFor(() => expectToHaveBeenNavigatedTo({ pathname: `/note/${id}` }));
  expect(setNote).toHaveBeenLastCalledWith(id, {
    id,
    title,
    body,
    created_by,
    updated_at: Date.now(),
  });
});
