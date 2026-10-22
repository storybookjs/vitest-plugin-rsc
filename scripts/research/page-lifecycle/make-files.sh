#!/usr/bin/env bash
# Copies the templates into identical test files: files/b1..b5.test.tsx
# and notes-files/n1..n4.test.tsx.
cd "$(dirname "$0")"
for n in 1 2 3 4 5; do cp files/template.tsx "files/b$n.test.tsx"; done
for n in 1 2 3 4; do cp notes-files/template.tsx "notes-files/n$n.test.tsx"; done
