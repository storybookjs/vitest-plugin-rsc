import { expect, test } from "vitest";
import { buildFlightRouterState } from "./flight-router-state";

test("parse route and url to route true", () => {
  expect(buildFlightRouterState("/note/[id]/[slug]", "/note/someid/someslug", "?a=1"))
    .toMatchInlineSnapshot(`
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
                      null,
                      null,
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      null,
      null,
      16,
    ]
  `);
});
