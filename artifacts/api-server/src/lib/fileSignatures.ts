import { inflateSync } from "node:zlib";

export function hasMatchingFileSignature(
  content: Uint8Array,
  contentType: string,
): boolean {
  const normalizedContentType = contentType.split(";", 1)[0].trim().toLowerCase();

  switch (normalizedContentType) {
    case "application/pdf":
      return matchesBytes(content, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "application/msword":
      return matchesBytes(content, [
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return isDocxPackage(content);
    case "image/png":
      return isPngImage(content);
    case "image/jpeg":
      return isJpegImage(content);
    case "image/webp":
      return isWebpImage(content);
    default:
      return false;
  }
}

function matchesBytes(
  content: Uint8Array,
  expected: number[],
  offset = 0,
): boolean {
  return expected.every((byte, index) => content[offset + index] === byte);
}

const DOCX_REQUIRED_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
];

function isDocxPackage(content: Uint8Array): boolean {
  if (!matchesBytes(content, [0x50, 0x4b, 0x03, 0x04])) {
    return false;
  }

  // The central directory is authoritative for ZIP entry names. Requiring the
  // package's core Word entries prevents an arbitrary ZIP from being accepted
  // as a DOCX merely because it starts with a local-file header.
  const minimumEndRecordLength = 22;
  const maximumCommentLength = 0xffff;
  const searchStart = Math.max(
    0,
    content.length - minimumEndRecordLength - maximumCommentLength,
  );
  let endRecordOffset = -1;
  for (let offset = content.length - minimumEndRecordLength; offset >= searchStart; offset -= 1) {
    if (readUint32(content, offset) === 0x06054b50) {
      endRecordOffset = offset;
      break;
    }
  }
  if (endRecordOffset < 0 || endRecordOffset + minimumEndRecordLength > content.length) {
    return false;
  }

  const diskNumber = readUint16(content, endRecordOffset + 4);
  const centralDirectoryDisk = readUint16(content, endRecordOffset + 6);
  const entriesOnDisk = readUint16(content, endRecordOffset + 8);
  const totalEntries = readUint16(content, endRecordOffset + 10);
  const centralDirectorySize = readUint32(content, endRecordOffset + 12);
  const centralDirectoryOffset = readUint32(content, endRecordOffset + 16);
  const commentLength = readUint16(content, endRecordOffset + 20);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries ||
    totalEntries === 0 ||
    commentLength !== content.length - endRecordOffset - minimumEndRecordLength ||
    centralDirectoryOffset + centralDirectorySize > endRecordOffset
  ) {
    return false;
  }

  const requiredEntries = new Set(DOCX_REQUIRED_ENTRIES);
  let offset = centralDirectoryOffset;
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (readUint32(content, offset) !== 0x02014b50 || offset + 46 > content.length) {
      return false;
    }
    const flags = readUint16(content, offset + 8);
    const nameLength = readUint16(content, offset + 28);
    const extraLength = readUint16(content, offset + 30);
    const entryCommentLength = readUint16(content, offset + 32);
    const localHeaderOffset = readUint32(content, offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (
      entryEnd > endRecordOffset ||
      localHeaderOffset + 30 > content.length ||
      readUint32(content, localHeaderOffset) !== 0x04034b50
    ) {
      return false;
    }
    const nameBytes = content.slice(offset + 46, offset + 46 + nameLength);
    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      return false;
    }
    if (
      requiredEntries.has(name) &&
      (flags & 0x0001) === 0 &&
      !name.endsWith("/")
    ) {
      requiredEntries.delete(name);
    }
    offset = entryEnd;
  }

  return offset === centralDirectoryOffset + centralDirectorySize &&
    requiredEntries.size === 0;
}

function isPngImage(content: Uint8Array): boolean {
  if (
    !matchesBytes(content, [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  ) {
    return false;
  }

  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  const imageDataChunks: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;

  while (offset < content.length) {
    if (offset + 12 > content.length) return false;
    const dataLength = readUint32BigEndian(content, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const endOffset = dataOffset + dataLength;
    if (endOffset < dataOffset || endOffset + 4 > content.length) return false;

    for (let index = 0; index < 4; index += 1) {
      const byte = content[typeOffset + index];
      if (
        (byte < 0x41 || byte > 0x5a) &&
        (byte < 0x61 || byte > 0x7a)
      ) {
        return false;
      }
    }
    const chunkType = String.fromCharCode(
      content[typeOffset],
      content[typeOffset + 1],
      content[typeOffset + 2],
      content[typeOffset + 3],
    );
    const expectedCrc = readUint32BigEndian(content, endOffset);
    if (crc32(content, typeOffset, endOffset) !== expectedCrc) return false;

    if (!sawHeader && chunkType !== "IHDR") return false;
    if (chunkType === "IHDR") {
      if (sawHeader || dataLength !== 13) return false;
      width = readUint32BigEndian(content, dataOffset);
      height = readUint32BigEndian(content, dataOffset + 4);
      bitDepth = content[dataOffset + 8];
      colorType = content[dataOffset + 9];
      if (
        width === 0 ||
        height === 0 ||
        !isValidPngBitDepth(colorType, bitDepth) ||
        content[dataOffset + 10] !== 0 ||
        content[dataOffset + 11] !== 0 ||
        (content[dataOffset + 12] !== 0 && content[dataOffset + 12] !== 1)
      ) {
        return false;
      }
      interlaceMethod = content[dataOffset + 12];
      sawHeader = true;
    } else if (chunkType === "IDAT") {
      if (!sawHeader || sawEnd || dataLength === 0) return false;
      sawImageData = true;
      imageDataChunks.push(content.slice(dataOffset, endOffset));
    } else if (chunkType === "IEND") {
      if (!sawHeader || !sawImageData || dataLength !== 0 || sawEnd) return false;
      sawEnd = true;
      if (endOffset + 4 !== content.length) return false;
    } else if (sawEnd) {
      return false;
    }

    offset = endOffset + 4;
  }

  if (!sawHeader || !sawImageData || !sawEnd || offset !== content.length) {
    return false;
  }

  // Check that the IDAT stream is a real zlib stream and expands to the
  // expected filtered scanlines. This catches valid-looking chunks with
  // truncated or otherwise unrelated compressed payloads.
  try {
    const inflated = inflateSync(Buffer.concat(imageDataChunks.map((chunk) => Buffer.from(chunk))));
    if (inflated.length === 0) return false;
    const channels = colorType === 0 || colorType === 3
      ? 1
      : colorType === 4
        ? 2
        : colorType === 2
          ? 3
          : 4;
    const scanlineLengths = getPngScanlineLengths(
      width,
      height,
      bitDepth,
      channels,
      interlaceMethod,
    );
    if (inflated.length !== scanlineLengths.reduce((total, length) => total + length, 0)) {
      return false;
    }
    let scanlineOffset = 0;
    for (const scanlineLength of scanlineLengths) {
      if (inflated[scanlineOffset] > 4) return false;
      scanlineOffset += scanlineLength;
    }
  } catch {
    return false;
  }
  return true;
}

function getPngScanlineLengths(
  width: number,
  height: number,
  bitDepth: number,
  channels: number,
  interlaceMethod: number,
): number[] {
  const bitsPerPixel = bitDepth * channels;
  if (interlaceMethod === 0) {
    const rowBytes = Math.ceil(width * bitsPerPixel / 8);
    return Array.from({ length: height }, () => rowBytes + 1);
  }

  const xStarts = [0, 4, 0, 2, 0, 1, 0];
  const yStarts = [0, 0, 4, 0, 2, 0, 1];
  const xSteps = [8, 8, 4, 4, 2, 2, 1];
  const ySteps = [8, 8, 8, 4, 4, 2, 2];
  const scanlineLengths: number[] = [];
  for (let pass = 0; pass < xStarts.length; pass += 1) {
    const passWidth = width <= xStarts[pass]
      ? 0
      : Math.ceil((width - xStarts[pass]) / xSteps[pass]);
    const passHeight = height <= yStarts[pass]
      ? 0
      : Math.ceil((height - yStarts[pass]) / ySteps[pass]);
    const rowBytes = Math.ceil(passWidth * bitsPerPixel / 8);
    for (let row = 0; row < passHeight; row += 1) {
      scanlineLengths.push(rowBytes + 1);
    }
  }
  return scanlineLengths;
}

function isValidPngBitDepth(colorType: number, bitDepth: number): boolean {
  const validDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return validDepths[colorType]?.includes(bitDepth) ?? false;
}

function isJpegImage(content: Uint8Array): boolean {
  if (!matchesBytes(content, [0xff, 0xd8]) || content.length < 4) return false;

  let offset = 2;
  let sawFrame = false;
  while (offset < content.length) {
    if (content[offset] !== 0xff) return false;
    const markerStart = offset;
    while (content[offset] === 0xff) offset += 1;
    if (offset >= content.length) return false;
    const marker = content[offset++];
    if (marker === 0x00) return false;
    if (marker === 0xd9) return false;
    if (marker === 0xda) {
      const segmentEnd = readJpegSegmentEnd(content, offset);
      if (segmentEnd === undefined || segmentEnd - offset < 8) return false;
      offset = segmentEnd;
      const scanEnd = findJpegScanMarker(content, offset);
      if (scanEnd === undefined) return false;
      if (scanEnd.marker === 0xd9) {
        return sawFrame && scanEnd.offset + 2 === content.length;
      }
      // A marker other than EOI ends this scan. Continue parsing it as the
      // next marker so progressive and multi-scan JPEGs remain supported.
      offset = scanEnd.offset;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) return false;
    if (marker === 0x01) continue;

    const segmentEnd = readJpegSegmentEnd(content, offset);
    if (segmentEnd === undefined) return false;
    if (isJpegFrameMarker(marker)) {
      if (sawFrame || segmentEnd - offset < 8) return false;
      const height = readUint16BigEndian(content, offset + 3);
      const width = readUint16BigEndian(content, offset + 5);
      const components = content[offset + 7];
      if (width === 0 || height === 0 || components === 0) return false;
      if (segmentEnd - offset < 8 + components * 3) return false;
      sawFrame = true;
    }
    offset = segmentEnd;
    if (offset <= markerStart) return false;
  }
  return false;
}

function readJpegSegmentEnd(content: Uint8Array, lengthOffset: number): number | undefined {
  if (lengthOffset + 2 > content.length) return undefined;
  const length = readUint16BigEndian(content, lengthOffset);
  if (length < 2 || lengthOffset + length > content.length) return undefined;
  return lengthOffset + length;
}

function findJpegScanMarker(
  content: Uint8Array,
  startOffset: number,
): { offset: number; marker: number } | undefined {
  let offset = startOffset;
  while (offset < content.length) {
    if (content[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const markerOffset = offset;
    while (content[offset] === 0xff) offset += 1;
    if (offset >= content.length) return undefined;
    const marker = content[offset];
    if (marker === 0x00) {
      offset += 1;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 1;
      continue;
    }
    return { offset: markerOffset, marker };
  }
  return undefined;
}

function isJpegFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function isWebpImage(content: Uint8Array): boolean {
  if (
    content.length < 20 ||
    !matchesBytes(content, [0x52, 0x49, 0x46, 0x46]) ||
    !matchesBytes(content, [0x57, 0x45, 0x42, 0x50], 8) ||
    readUint32LittleEndian(content, 4) !== content.length - 8
  ) {
    return false;
  }

  let offset = 12;
  let sawImage = false;
  while (offset < content.length) {
    if (offset + 8 > content.length) return false;
    const chunkSize = readUint32LittleEndian(content, offset + 4);
    const dataOffset = offset + 8;
    const endOffset = dataOffset + chunkSize;
    const paddedEndOffset = endOffset + (chunkSize % 2);
    if (
      endOffset < dataOffset ||
      paddedEndOffset > content.length
    ) {
      return false;
    }
    const chunkType = String.fromCharCode(
      content[offset],
      content[offset + 1],
      content[offset + 2],
      content[offset + 3],
    );
    const chunk = content.slice(dataOffset, endOffset);
    if (chunkType === "VP8 ") {
      if (!isVp8Chunk(chunk)) return false;
      sawImage = true;
    } else if (chunkType === "VP8L") {
      if (!isVp8lChunk(chunk)) return false;
      sawImage = true;
    } else if (chunkType === "VP8X") {
      if (!isVp8xChunk(chunk)) return false;
    } else if (chunkType === "ANMF") {
      if (chunk.length < 16) return false;
      sawImage = true;
    }
    offset = paddedEndOffset;
  }
  return sawImage && offset === content.length;
}

function isVp8Chunk(chunk: Uint8Array): boolean {
  return (
    chunk.length >= 10 &&
    (chunk[0] & 0x01) === 0 &&
    matchesBytes(chunk, [0x9d, 0x01, 0x2a], 3) &&
    (readUint16LittleEndian(chunk, 6) & 0x3fff) > 0 &&
    (readUint16LittleEndian(chunk, 8) & 0x3fff) > 0
  );
}

function isVp8lChunk(chunk: Uint8Array): boolean {
  if (chunk.length < 5 || chunk[0] !== 0x2f) return false;
  const width = 1 + (chunk[1] | ((chunk[2] & 0x3f) << 8));
  const height = 1 + ((chunk[2] >> 6) | (chunk[3] << 2) | ((chunk[4] & 0x03) << 10));
  return width > 0 && height > 0;
}

function isVp8xChunk(chunk: Uint8Array): boolean {
  if (chunk.length !== 10 || (chunk[0] & 0xc0) !== 0) return false;
  const width = 1 + chunk[4] + (chunk[5] << 8) + (chunk[6] << 16);
  const height = 1 + chunk[7] + (chunk[8] << 8) + (chunk[9] << 16);
  return width > 0 && height > 0;
}

function crc32(content: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= content[offset];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint16(content: Uint8Array, offset: number): number {
  return (
    (content[offset] ?? 0) |
    ((content[offset + 1] ?? 0) << 8)
  );
}

function readUint32(content: Uint8Array, offset: number): number {
  return (
    (content[offset] ?? 0) |
    ((content[offset + 1] ?? 0) << 8) |
    ((content[offset + 2] ?? 0) << 16) |
    ((content[offset + 3] ?? 0) * 0x1000000)
  );
}

function readUint16LittleEndian(content: Uint8Array, offset: number): number {
  return readUint16(content, offset);
}

function readUint16BigEndian(content: Uint8Array, offset: number): number {
  return (
    ((content[offset] ?? 0) << 8) |
    (content[offset + 1] ?? 0)
  );
}

function readUint32LittleEndian(content: Uint8Array, offset: number): number {
  return readUint32(content, offset);
}

function readUint32BigEndian(content: Uint8Array, offset: number): number {
  return (
    ((content[offset] ?? 0) * 0x1000000) +
    ((content[offset + 1] ?? 0) << 16) |
    ((content[offset + 2] ?? 0) << 8) |
    (content[offset + 3] ?? 0)
  ) >>> 0;
}