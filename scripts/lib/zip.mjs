import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_EOCD_SEARCH = 65_535 + 22

function findEndOfCentralDirectory(buffer) {
  const firstPossibleOffset = Math.max(0, buffer.length - MAX_EOCD_SEARCH)
  for (let offset = buffer.length - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('ZIP end-of-central-directory record was not found')
}

function parseEndOfCentralDirectory(buffer, offset) {
  const diskNumber = buffer.readUInt16LE(offset + 4)
  const centralDirectoryDisk = buffer.readUInt16LE(offset + 6)
  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new Error('Multi-disk ZIP files are not supported')
  }

  const entryCount = buffer.readUInt16LE(offset + 10)
  const centralDirectorySize = buffer.readUInt32LE(offset + 12)
  const centralDirectoryOffset = buffer.readUInt32LE(offset + 16)
  if (
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error('ZIP64 archives are not supported by this focused helper')
  }

  return { entryCount, centralDirectorySize, centralDirectoryOffset }
}

export function readZipIndex(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer)
  const directory = parseEndOfCentralDirectory(buffer, eocdOffset)
  const directoryEnd = directory.centralDirectoryOffset + directory.centralDirectorySize
  if (directoryEnd > buffer.length) {
    throw new Error('ZIP central directory is outside the supplied buffer')
  }
  return parseCentralDirectory(
    buffer.subarray(directory.centralDirectoryOffset, directoryEnd),
    directory.entryCount,
  )
}

function parseCentralDirectory(buffer, expectedEntries) {
  const entries = new Map()
  let offset = 0

  while (offset < buffer.length) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid ZIP central-directory entry at byte ${offset}`)
    }

    const flags = buffer.readUInt16LE(offset + 8)
    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const crc32 = buffer.readUInt32LE(offset + 16)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const nameStart = offset + 46
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')

    entries.set(name, {
      name,
      flags,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })
    offset = nameStart + nameLength + extraLength + commentLength
  }

  if (entries.size !== expectedEntries) {
    throw new Error(`Expected ${expectedEntries} ZIP entries but parsed ${entries.size}`)
  }
  return entries
}

function inflateEntry(entry, compressed) {
  let result
  if (entry.compressionMethod === 0) result = compressed
  else if (entry.compressionMethod === 8) result = inflateRawSync(compressed)
  else throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`)

  if (result.length !== entry.uncompressedSize) {
    throw new Error(
      `ZIP entry ${entry.name} inflated to ${result.length} bytes; expected ${entry.uncompressedSize}`,
    )
  }
  return result
}

export function extractZipEntry(buffer, entry) {
  const offset = entry.localHeaderOffset
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid local ZIP header for ${entry.name}`)
  }
  const nameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize
  if (dataEnd > buffer.length) throw new Error(`Truncated ZIP entry ${entry.name}`)
  return inflateEntry(entry, buffer.subarray(dataStart, dataEnd))
}

export function extractStandaloneLocalMember(buffer, expectedName) {
  if (buffer.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) {
    throw new Error('Local member file does not start with a ZIP local header')
  }
  const flags = buffer.readUInt16LE(6)
  if ((flags & 0x08) !== 0) {
    throw new Error('Local member files using a trailing data descriptor are unsupported')
  }
  const compressionMethod = buffer.readUInt16LE(8)
  const compressedSize = buffer.readUInt32LE(18)
  const uncompressedSize = buffer.readUInt32LE(22)
  const nameLength = buffer.readUInt16LE(26)
  const extraLength = buffer.readUInt16LE(28)
  const name = buffer.subarray(30, 30 + nameLength).toString('utf8')
  if (expectedName && name !== expectedName) {
    throw new Error(`Expected local member ${expectedName}, received ${name}`)
  }
  const dataStart = 30 + nameLength + extraLength
  const dataEnd = dataStart + compressedSize
  if (dataEnd !== buffer.length) {
    throw new Error(`Local member ${name} has unexpected trailing or missing bytes`)
  }
  return inflateEntry(
    { name, compressionMethod, compressedSize, uncompressedSize },
    buffer.subarray(dataStart, dataEnd),
  )
}

async function fetchRange(url, range) {
  const response = await fetch(url, {
    headers: { Range: range },
    signal: AbortSignal.timeout(60_000),
  })
  if (response.status !== 206) {
    await response.body?.cancel()
    throw new Error(
      `Schedule server did not honour ${range} (HTTP ${response.status}); refusing a full archive download`,
    )
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  return { bytes, headers: response.headers }
}

export async function readRemoteZipIndex(url) {
  const tailResponse = await fetchRange(url, `bytes=-${MAX_EOCD_SEARCH}`)
  const contentRange = tailResponse.headers.get('content-range')
  const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/)
  if (!match) throw new Error('Schedule server returned an invalid Content-Range header')

  const tailStart = Number(match[1])
  const totalSize = Number(match[3])
  const eocdOffset = findEndOfCentralDirectory(tailResponse.bytes)
  const directory = parseEndOfCentralDirectory(tailResponse.bytes, eocdOffset)

  let centralDirectory
  const relativeDirectoryStart = directory.centralDirectoryOffset - tailStart
  if (
    relativeDirectoryStart >= 0 &&
    relativeDirectoryStart + directory.centralDirectorySize <= tailResponse.bytes.length
  ) {
    centralDirectory = tailResponse.bytes.subarray(
      relativeDirectoryStart,
      relativeDirectoryStart + directory.centralDirectorySize,
    )
  } else {
    const directoryEnd = directory.centralDirectoryOffset + directory.centralDirectorySize - 1
    const response = await fetchRange(
      url,
      `bytes=${directory.centralDirectoryOffset}-${directoryEnd}`,
    )
    centralDirectory = response.bytes
  }

  return {
    entries: parseCentralDirectory(centralDirectory, directory.entryCount),
    metadata: {
      size: totalSize,
      etag: tailResponse.headers.get('etag'),
      lastModified: tailResponse.headers.get('last-modified'),
    },
  }
}

export async function extractRemoteZipEntry(url, entry) {
  const headerResponse = await fetchRange(
    url,
    `bytes=${entry.localHeaderOffset}-${entry.localHeaderOffset + 29}`,
  )
  const header = headerResponse.bytes
  if (header.length !== 30 || header.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid remote ZIP local header for ${entry.name}`)
  }
  const nameLength = header.readUInt16LE(26)
  const extraLength = header.readUInt16LE(28)
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedSize - 1
  const dataResponse = await fetchRange(url, `bytes=${dataStart}-${dataEnd}`)
  if (dataResponse.bytes.length !== entry.compressedSize) {
    throw new Error(`Remote ZIP entry ${entry.name} was truncated`)
  }
  return inflateEntry(entry, dataResponse.bytes)
}
