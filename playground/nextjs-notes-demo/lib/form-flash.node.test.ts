import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod";
import { zfd } from "zod-form-data";
import { getForm, setForm } from "#lib/form-flash.ts";

test("flashes validation errors and old input once", async () => {
  const schema = zfd.formData({
    name: zfd.text(z.string().min(2, "Enter at least 2 characters.")),
  });
  const formData = new FormData();
  formData.set("name", "A");

  const result = await setForm(schema, formData);
  expect(result.success).toBe(false);

  const form = await getForm(schema);
  expect(form.old.name).toBe("A");
  expect(form.errors.name).toBe("Enter at least 2 characters.");

  const consumed = await getForm(schema);
  expect(consumed.old.name).toBeUndefined();
  expect(consumed.errors.name).toBeUndefined();
});

test("flashes repeatable field values and omits file fields from old input", async () => {
  const schema = zfd.formData({
    tags: zfd.repeatable(z.array(zfd.text()).min(3, "Choose at least three tags.")),
    avatar: zfd.file(z.instanceof(File).optional()),
  });
  const formData = new FormData();
  formData.append("tags", "react");
  formData.append("tags", "rsc");
  formData.set("avatar", new File(["avatar"], "avatar.png", { type: "image/png" }));

  const result = await setForm(schema, formData);
  expect(result.success).toBe(false);

  const form = await getForm(schema);
  expectTypeOf(form.old.tags).toEqualTypeOf<string[] | undefined>();
  expectTypeOf(form.old.avatar).toEqualTypeOf<string | undefined>();
  expectTypeOf(form.errors.tags).toEqualTypeOf<string[] | undefined>();
  expectTypeOf(form.errors.avatar).toEqualTypeOf<string | undefined>();
  expect(form.old.tags).toEqual(["react", "rsc"]);
  expect(form.old.avatar).toBeUndefined();
  expect(form.errors.tags).toEqual(["Choose at least three tags."]);
});

test("skips sensitive and action fields from old input", async () => {
  const schema = zfd.formData({
    name: zfd.text(z.string().min(2, "Enter at least 2 characters.")),
    csrfToken: zfd.text(z.string().optional()),
    password: zfd.text(z.string().optional()),
    safeField: zfd.text(z.string().optional()),
  });
  const formData = new FormData();
  formData.set("$ACTION_ID", "server-action");
  formData.set("name", "A");
  formData.set("csrfToken", "csrf");
  formData.set("password", "secret");
  formData.set("safeField", "safe");

  const result = await setForm(schema, formData);
  expect(result.success).toBe(false);

  const form = await getForm(schema);
  expect(form.old.name).toBe("A");
  expect(form.old.safeField).toBe("safe");
  expect(form.old.csrfToken).toBeUndefined();
  expect(form.old.password).toBeUndefined();
  expect(form.errors.name).toBe("Enter at least 2 characters.");
});
