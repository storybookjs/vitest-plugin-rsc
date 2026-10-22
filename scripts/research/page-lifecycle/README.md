# Page lifecycle measurements

Throwaway measurements for [docs/page-lifecycle-risk.md](../../../docs/page-lifecycle-risk.md). They are not part of any test run: no Vitest project includes them.

Each directory holds the test files of one experiment. `run.sh` runs one directory in a single tab, against the project of the e2e demo or of the notes demo, and keeps the `PLM {...}` lines that the tests print in `results/<name>.jsonl`:

```sh
pnpm build
R=scripts/research/page-lifecycle
# name, config, directory, isolate, leak, pages
$R/run.sh e2e-within vitest.e2e.config.ts e2e 0 0 100
$R/run.sh files-iso1-leak1 vitest.e2e.config.ts \
  files 1 1 30
$R/run.sh notes-within vitest.notes.config.ts notes 0 0 60
```

| Directory           | Experiment                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `e2e/`              | A: 100 pages in a file, clean, a node, a leaking app, navigations |
| `files/`            | B: five files of 30 pages, `isolate` on and off, leaking or not   |
| `notes/`            | C: the notes demo, clean and leaking                              |
| `notes-files/`      | D: what `isolate: true` costs per file in the notes demo          |
| `notes-snapshot/`   | E: a heap snapshot after leaked pages, for `retainers.ts`         |
| `notes-symptom/`    | F: a timer of a left page that fails a later test                 |
| `e2e-snapshot/`     | G: two snapshots 200 pages apart, for `diff.ts`                   |
| `e2e-realm/`        | H: a page that compiles its modules anew, and a bare iframe       |
| `notes-realm/`      | H in the notes demo                                               |
| `e2e-img-snapshot/` | I: navigations to `/images`, which keep pages                     |
| `notes-gc/`         | J: what a forced garbage collection costs                         |

`files/` and `notes-files/` have one `template.tsx` each, which `make-files.sh` copies into identical test files before a run.

H needs `compile-per-page.patch` applied to the plugin (`git apply`), and reverted after: with it, a page compiles every module anew, as a realm of its own would.

E, G and I write heap snapshots to `results/` with the browser command in `heap-snapshot-command.ts`. They are 70 to 350 MB and stay out of git. Read them with:

```sh
node --max-old-space-size=8192 \
  $R/retainers.ts $R/results/notes-leak1.heapsnapshot
node --max-old-space-size=8192 $R/diff.ts \
  $R/results/residual-before.heapsnapshot \
  $R/results/residual-after.heapsnapshot
```

What they printed is in `results/*.txt`.
