#!/usr/bin/env node
// Fails if a built file does not start with the "use client" directive, which
// Next.js needs to treat a package's components as Client Components.
// Usage: node scripts/check-use-client.mjs <file>...

import { readFileSync } from 'node:fs'

let failed = false
for (const file of process.argv.slice(2)) {
  const start = readFileSync(file, 'utf8').trimStart()
  if (!/^["']use client["'];?/.test(start)) {
    console.error(`✗ ${file} does not start with "use client"`)
    failed = true
  } else {
    console.log(`✓ ${file} starts with "use client"`)
  }
}
process.exit(failed ? 1 : 0)
