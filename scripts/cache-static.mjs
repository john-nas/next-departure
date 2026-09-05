#!/usr/bin/env node

import { DEFAULT_STATIC_CACHE, SUPPORTED_STATIC_BRANCHES } from '../config/feed.mjs'
import { ensureStaticLookup } from './lib/static-lookup.mjs'

function usage() {
  return [
    'Usage: node scripts/cache-static.mjs [options]',
    '',
    'Options:',
    '  --branches <4|4,5,6>           Static GTFS branches to cache (default: 4)',
    '  --cache <path>                  Cache destination',
    '  --outer-member-file <N=path>    Use an already-downloaded outer ZIP member',
    '  --force                         Rebuild requested cache branches',
    '  --help                          Show this help',
  ].join('\n')
}

function takeValue(args, index, flag) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseArguments(args) {
  const options = {
    branches: ['4'],
    cachePath: DEFAULT_STATIC_CACHE,
    force: false,
    localMemberFiles: new Map(),
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help') options.help = true
    else if (argument === '--force') options.force = true
    else if (argument === '--branches') {
      options.branches = takeValue(args, index, argument).split(',').filter(Boolean)
      index += 1
    } else if (argument === '--cache') {
      options.cachePath = takeValue(args, index, argument)
      index += 1
    } else if (argument === '--outer-member-file') {
      const assignment = takeValue(args, index, argument)
      const separator = assignment.indexOf('=')
      if (separator < 1) throw new Error(`${argument} must use branch=path syntax`)
      options.localMemberFiles.set(
        assignment.slice(0, separator),
        assignment.slice(separator + 1),
      )
      index += 1
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }

  if (
    options.branches.length === 0 ||
    options.branches.some((branch) => !SUPPORTED_STATIC_BRANCHES.includes(branch))
  ) {
    throw new Error('Supported GTFS branches are 4, 5 and 6')
  }
  return options
}

try {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    process.exit(0)
  }
  const lookup = await ensureStaticLookup(options)
  console.log(
    `Cached ${Object.keys(lookup.stops).length} stops and ${Object.keys(lookup.routes).length} routes from branch(es) ${lookup.source.branches.join(', ')}.`,
  )
} catch (error) {
  console.error(`Static GTFS cache failed: ${error.message}`)
  process.exitCode = 1
}
