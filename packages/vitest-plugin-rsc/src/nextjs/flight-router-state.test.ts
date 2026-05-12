import { expect, test } from "vitest";
import { buildFlightRouterStateWithNext } from "./flight-router-state";

test("builds route state through Next loader-tree machinery", async () => {
  await expect(buildFlightRouterStateWithNext("/note/[id]/[slug]", "/note/someid/someslug", "?a=1"))
    .resolves.toMatchInlineSnapshot(`
    [
      "",
      {
        "children": [
          "note",
          {
            "children": [
              [
                "id",
                "someid",
                "d",
                null,
              ],
              {
                "children": [
                  [
                    "slug",
                    "someslug",
                    "d",
                    null,
                  ],
                  {
                    "children": [
                      "__PAGE__?{"a":"1"}",
                      {},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      ,
      ,
      16,
    ]
  `);
});

test("builds catch-all route state through Next loader-tree machinery", async () => {
  await expect(buildFlightRouterStateWithNext("/docs/[...slug]", "/docs/a/b", "")).resolves
    .toMatchInlineSnapshot(`
    [
      "",
      {
        "children": [
          "docs",
          {
            "children": [
              [
                "slug",
                "a/b",
                "c",
                null,
              ],
              {
                "children": [
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
        ],
      },
      ,
      ,
      16,
    ]
  `);
});

test("builds optional catch-all route state through Next loader-tree machinery", async () => {
  await expect(buildFlightRouterStateWithNext("/docs/[[...slug]]", "/docs", "")).resolves
    .toMatchInlineSnapshot(`
    [
      "",
      {
        "children": [
          "docs",
          {
            "children": [
              [
                "slug",
                "",
                "oc",
                null,
              ],
              {
                "children": [
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
        ],
      },
      ,
      ,
      16,
    ]
  `);
});

test("keeps route groups in the router state without consuming pathname segments", async () => {
  await expect(buildFlightRouterStateWithNext("/(auth)/sign-in", "/sign-in", "")).resolves
    .toMatchInlineSnapshot(`
    [
      "",
      {
        "children": [
          "(auth)",
          {
            "children": [
              "sign-in",
              {
                "children": [
                  "__PAGE__",
                  {},
                ],
              },
            ],
          },
        ],
      },
      ,
      ,
      16,
    ]
  `);
});

test("resolves dynamic params after route groups using pathname depth", async () => {
  await expect(buildFlightRouterStateWithNext("/(notes)/notes/[id]", "/notes/a%20b", "")).resolves
    .toMatchInlineSnapshot(`
    [
      "",
      {
        "children": [
          "(notes)",
          {
            "children": [
              "notes",
              {
                "children": [
                  [
                    "id",
                    "a%20b",
                    "d",
                    null,
                  ],
                  {
                    "children": [
                      "__PAGE__",
                      {},
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      ,
      ,
      16,
    ]
  `);
});

test("rejects pathnames that do not match static route segments", async () => {
  await expect(buildFlightRouterStateWithNext("/notes/[id]", "/users/123", "")).rejects.toThrow(
    'Pattern "/notes/[id]" does not match pathname "/users/123".',
  );
});
