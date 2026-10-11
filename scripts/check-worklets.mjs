#!/usr/bin/env node
// Runs the Reanimated / Worklets Babel plugin over built files, the way an
// app's Metro build does, then checks that:
// - each file defines at least the expected number of worklets;
// - each file still loads once compiled. The plugin turns worklet functions
//   into constants, which are not hoisted, so a worklet used before it is
//   defined throws a ReferenceError at load time. Files that import React
//   Native packages cannot load in Node, so they are only compiled.
//
// Usage: node scripts/check-worklets.mjs <file>=<minimum worklets> …
// File names may contain `*` (for example `dist/frame-*.js=3`).

import { readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(resolve('package.json'))
const workletsRoot = dirname(require.resolve('react-native-worklets/package.json'))
const babel = require(require.resolve('@babel/core', { paths: [workletsRoot] }))
const plugin = require.resolve('react-native-worklets/plugin')

let failed = false
/** Expands a `*` in the file name part of a path. */
function expand(pattern) {
  if (!pattern.includes('*')) return [pattern]
  const directory = dirname(pattern)
  const regex = new RegExp(
    `^${basename(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')}$`,
  )
  return readdirSync(directory)
    .filter((name) => regex.test(name))
    .map((name) => join(directory, name))
}

const files = process.argv.slice(2).flatMap((argument) => {
  const [pattern, minimum = '1'] = argument.split('=')
  const matches = expand(pattern)
  if (matches.length === 0) {
    console.error(`✗ ${pattern}: no such file`)
    failed = true
  }
  return matches.map((path) => [path, minimum])
})

for (const [path, minimum] of files) {
  const file = resolve(path)
  const { code } = await babel.transformFileAsync(file, {
    babelrc: false,
    configFile: false,
    plugins: [plugin],
  })

  const worklets = code.match(/\.__workletHash = /g)?.length ?? 0
  if (worklets < Number(minimum)) {
    console.error(`✗ ${path}: ${worklets} worklets once compiled, expected at least ${minimum}`)
    failed = true
    continue
  }

  if (/from ["']react-native/.test(code)) {
    console.log(`✓ ${path}: ${worklets} worklets (not loaded: it imports React Native)`)
    continue
  }

  // Written next to the original, so that its imports resolve the same way.
  const compiled = join(dirname(file), `.${basename(file, '.js')}.worklets.mjs`)
  writeFileSync(compiled, code)
  try {
    await import(pathToFileURL(compiled).href)
    console.log(`✓ ${path}: ${worklets} worklets, loads once compiled`)
  } catch (error) {
    console.error(`✗ ${path} fails to load once compiled: ${error.message}`)
    failed = true
  } finally {
    unlinkSync(compiled)
  }
}
process.exit(failed ? 1 : 0)
