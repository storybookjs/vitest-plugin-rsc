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
