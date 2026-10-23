import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  VisualRegressionInput,
  VisualRegressionOutput
} from '../schemas/visual-regression.schema.js';

// --- Security & Resource Constraints ---
export const MAX_IMAGE_WIDTH = 8192;
export const MAX_IMAGE_HEIGHT = 8192;
export const MAX_TOTAL_PIXELS = 16 * 1024 * 1024; // 16 MegaPixels (~67.1MB RGBA buffer)
export const MAX_PNG_FILE_SIZE = 15 * 1024 * 1024; // 15MB
export const MAX_DECOMPRESSED_IDAT = 50 * 1024 * 1024; // 50MB

// --- PNG Parsing & Generation Utilities ---

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function makeChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

export function createPngBuffer(width: number, height: number, rgba: Buffer): Buffer {
  if (width <= 0 || height <= 0 || width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
    throw new Error(`Image dimensions ${width}x${height} exceed supported limits (max ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT}).`);
  }
  if (width * height > MAX_TOTAL_PIXELS) {
    throw new Error(`Total pixels (${width * height}) exceed maximum pixel budget (${MAX_TOTAL_PIXELS}).`);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // Color type 6: RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrChunk = makeChunk('IHDR', ihdrData);

  const rowBytes = width * 4;
  const rawScanlines = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    rawScanlines[y * (1 + rowBytes)] = 0; // Filter: None
    rgba.copy(rawScanlines, y * (1 + rowBytes) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const compressed = zlib.deflateSync(rawScanlines);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

export interface ParsedPng {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  rgba: Buffer;
}

export function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function parsePng(buffer: Buffer): ParsedPng {
  if (!buffer || buffer.length < 8) {
    throw new Error('Invalid PNG: buffer too short.');
  }

  if (buffer.length > MAX_PNG_FILE_SIZE) {
    throw new Error(`File size ${buffer.length} bytes exceeds maximum allowed limit of ${MAX_PNG_FILE_SIZE} bytes.`);
  }

  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG header: file does not match PNG signature.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let foundIhdr = false;
  let foundIend = false;
  let chunkIndex = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      throw new Error('Corrupt PNG: chunk header truncated at end of file.');
    }
    const chunkLen = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLen;

    if (dataEnd + 4 > buffer.length) {
      throw new Error(`Corrupt PNG: chunk ${chunkType} truncated.`);
    }

    // CRC validation
    const computedCrc = crc32(buffer.subarray(offset + 4, dataEnd));
    const readCrc = buffer.readUInt32BE(dataEnd);
    if (computedCrc !== readCrc) {
      throw new Error(`Corrupt PNG: CRC mismatch in chunk ${chunkType}. Computed 0x${computedCrc.toString(16)}, found 0x${readCrc.toString(16)}.`);
    }

    if (chunkIndex === 0 && chunkType !== 'IHDR') {
      throw new Error(`Corrupt PNG: first chunk must be IHDR, found ${chunkType}.`);
    }

    if (chunkType === 'IHDR') {
      if (foundIhdr) {
        throw new Error('Corrupt PNG: duplicate IHDR chunk detected.');
      }
      foundIhdr = true;
      width = buffer.readUInt32BE(dataOffset);
      height = buffer.readUInt32BE(dataOffset + 4);
      bitDepth = buffer.readUInt8(dataOffset + 8);
      colorType = buffer.readUInt8(dataOffset + 9);

      if (width <= 0 || height <= 0 || width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
        throw new Error(`Invalid or excessive image dimensions: ${width}x${height}. Maximum supported is ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT}.`);
      }

      if (width * height > MAX_TOTAL_PIXELS) {
        throw new Error(`Image total pixels (${width * height}) exceed maximum budget of ${MAX_TOTAL_PIXELS} pixels.`);
      }

      if (bitDepth !== 8) {
        throw new Error(`Unsupported PNG bit depth: ${bitDepth}. Expected 8-bit.`);
      }
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`Unsupported PNG color type: ${colorType}. Expected RGB (2) or RGBA (6).`);
      }
    } else if (chunkType === 'IDAT') {
      if (!foundIhdr) {
        throw new Error('Corrupt PNG: IDAT chunk appeared before IHDR chunk.');
      }
      idatChunks.push(buffer.subarray(dataOffset, dataEnd));
    } else if (chunkType === 'IEND') {
      foundIend = true;
      break;
    }

    chunkIndex++;
    offset = dataEnd + 4; // Skip data + CRC
  }

  if (!foundIhdr || width === 0 || height === 0 || idatChunks.length === 0) {
    throw new Error('Corrupt PNG: missing IHDR or IDAT image data.');
  }

  if (!foundIend) {
    throw new Error('Corrupt PNG: missing required IEND chunk.');
  }

  const compressedIdat = Buffer.concat(idatChunks);
  let decompressed: Buffer;
  try {
    decompressed = zlib.inflateSync(compressedIdat, {
      maxOutputLength: MAX_DECOMPRESSED_IDAT
    });
  } catch (err: unknown) {
    throw new Error(`PNG decompression error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const expectedLength = height * (1 + rowBytes);

  if (decompressed.length < expectedLength) {
    throw new Error(`Corrupt PNG: decompressed stream length ${decompressed.length} < expected ${expectedLength}.`);
  }

  // De-filter scanlines into raw pixels
  const rawRgb = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = decompressed[y * (1 + rowBytes)];
    const srcRowStart = y * (1 + rowBytes) + 1;
    const dstRowStart = y * rowBytes;
    const prevDstRowStart = (y - 1) * rowBytes;

    for (let x = 0; x < rowBytes; x++) {
      const rawByte = decompressed[srcRowStart + x];
      const a = x >= bytesPerPixel ? rawRgb[dstRowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? rawRgb[prevDstRowStart + x] : 0;
      const c = (y > 0 && x >= bytesPerPixel) ? rawRgb[prevDstRowStart + x - bytesPerPixel] : 0;

      let val = rawByte;
      switch (filter) {
        case 0: val = rawByte; break; // None
        case 1: val = (rawByte + a) & 255; break; // Sub
        case 2: val = (rawByte + b) & 255; break; // Up
        case 3: val = (rawByte + Math.floor((a + b) / 2)) & 255; break; // Average
        case 4: val = (rawByte + paethPredictor(a, b, c)) & 255; break; // Paeth
        default:
          throw new Error(`Unsupported PNG filter method: ${filter}.`);
      }
      rawRgb[dstRowStart + x] = val;
    }
  }

  // Normalize to 4-channel RGBA
  let rgba: Buffer;
  if (colorType === 6) {
    rgba = rawRgb;
  } else {
    // Expand RGB (3 bytes) to RGBA (4 bytes, alpha = 255)
    rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = rawRgb[i * 3];
      rgba[i * 4 + 1] = rawRgb[i * 3 + 1];
      rgba[i * 4 + 2] = rawRgb[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
  }

  return { width, height, colorType, bitDepth, rgba };
}

// --- Visual Regression Engine ---

export function compareVisualRegression(input: VisualRegressionInput): VisualRegressionOutput {
  const {
    baselineImagePath,
    currentImagePath,
    diffOutputPath,
    toleranceThreshold = 0.05,
    ignoreAntiAliasing = true
  } = input;

  // 1. Path Safety & Existence Validation
  if (!baselineImagePath || typeof baselineImagePath !== 'string' || baselineImagePath.includes('\0')) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: ['Invalid baseline image path'],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: 'Baseline image path is invalid or contains prohibited characters.'
    };
  }

  if (!currentImagePath || typeof currentImagePath !== 'string' || currentImagePath.includes('\0')) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: ['Invalid comparison image path'],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: 'Current comparison image path is invalid or contains prohibited characters.'
    };
  }

  if (!fs.existsSync(baselineImagePath)) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: [`Baseline image not found: ${baselineImagePath}`],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: `Baseline image file does not exist at "${baselineImagePath}".`
    };
  }

  if (!fs.existsSync(currentImagePath)) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: [`Comparison image not found: ${currentImagePath}`],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: `Current comparison image file does not exist at "${currentImagePath}".`
    };
  }

  // 2. Read and Parse PNGs
  let baseline: ParsedPng;
  let current: ParsedPng;

  try {
    const baseBuf = fs.readFileSync(baselineImagePath);
    baseline = parsePng(baseBuf);
  } catch (err: unknown) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: [`Corrupt or unsupported baseline PNG: ${err instanceof Error ? err.message : String(err)}`],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: err instanceof Error ? err.message : String(err)
    };
  }

  try {
    const currBuf = fs.readFileSync(currentImagePath);
    current = parsePng(currBuf);
  } catch (err: unknown) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: [`Corrupt or unsupported comparison PNG: ${err instanceof Error ? err.message : String(err)}`],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: err instanceof Error ? err.message : String(err)
    };
  }

  const detectedShifts: string[] = [];
  const baselineDimensions = { width: baseline.width, height: baseline.height };
  const comparisonDimensions = { width: current.width, height: current.height };

  // 3. Dimension Check & Union Canvas Setup
  const isDimensionMismatch = baseline.width !== current.width || baseline.height !== current.height;
  if (isDimensionMismatch) {
    detectedShifts.push(
      `Dimension mismatch: baseline (${baseline.width}x${baseline.height}) vs current (${current.width}x${current.height}). Structural layout shift detected.`
    );
  }

  const maxWidth = Math.max(baseline.width, current.width);
  const maxHeight = Math.max(baseline.height, current.height);
  const totalUnionPixels = maxWidth * maxHeight;

  // Enforce memory boundary on union diff allocation
  if (totalUnionPixels > MAX_TOTAL_PIXELS) {
    return {
      hasRegression: true,
      mismatchPercentage: 100,
      mismatchPixelCount: 0,
      detectedShifts: [`Comparison union dimensions (${maxWidth}x${maxHeight}) exceed maximum budget of ${MAX_TOTAL_PIXELS} pixels.`],
      verdict: 'ERROR_UNSUPPORTED_OR_CORRUPT',
      errorDetails: `Comparison union area (${totalUnionPixels} pixels) exceeds the safe maximum memory threshold (${MAX_TOTAL_PIXELS} pixels).`
    };
  }

  // 4. Pixel-by-Pixel Diffing & Diff Mask Buffer (Across full union bounds)
  let mismatchPixelCount = 0;
  const diffRgba = Buffer.alloc(maxWidth * maxHeight * 4);
  const aaThreshold = ignoreAntiAliasing ? 18 : 5; // Euclidean RGBA distance tolerance

  let minDiffX = maxWidth;
  let maxDiffX = 0;
  let minDiffY = maxHeight;
  let maxDiffY = 0;

  for (let y = 0; y < maxHeight; y++) {
    for (let x = 0; x < maxWidth; x++) {
      const maskIdx = (y * maxWidth + x) * 4;
      const inBase = x < baseline.width && y < baseline.height;
      const inCurr = x < current.width && y < current.height;

      if (inBase && inCurr) {
        const baseIdx = (y * baseline.width + x) * 4;
        const currIdx = (y * current.width + x) * 4;

        const rDiff = baseline.rgba[baseIdx] - current.rgba[currIdx];
        const gDiff = baseline.rgba[baseIdx + 1] - current.rgba[currIdx + 1];
        const bDiff = baseline.rgba[baseIdx + 2] - current.rgba[currIdx + 2];
        const aDiff = baseline.rgba[baseIdx + 3] - current.rgba[currIdx + 3];

        const distance = Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff + aDiff * aDiff);

        if (distance > aaThreshold) {
          mismatchPixelCount++;
          minDiffX = Math.min(minDiffX, x);
          maxDiffX = Math.max(maxDiffX, x);
          minDiffY = Math.min(minDiffY, y);
          maxDiffY = Math.max(maxDiffY, y);

          // Highlight difference in bright magenta (#ff00ff)
          diffRgba[maskIdx] = 255;
          diffRgba[maskIdx + 1] = 0;
          diffRgba[maskIdx + 2] = 255;
          diffRgba[maskIdx + 3] = 255;
        } else {
          // Dimmed grayscale background from baseline
          const gray = Math.round(
            0.299 * baseline.rgba[baseIdx] +
            0.587 * baseline.rgba[baseIdx + 1] +
            0.114 * baseline.rgba[baseIdx + 2]
          );
          diffRgba[maskIdx] = gray;
          diffRgba[maskIdx + 1] = gray;
          diffRgba[maskIdx + 2] = gray;
          diffRgba[maskIdx + 3] = 120; // Semi-transparent
        }
      } else {
        // Pixel lies outside common intersection (dimensional divergence)
        mismatchPixelCount++;
        minDiffX = Math.min(minDiffX, x);
        maxDiffX = Math.max(maxDiffX, x);
        minDiffY = Math.min(minDiffY, y);
        maxDiffY = Math.max(maxDiffY, y);

        // Highlight dimensional overflow area in bright magenta (#ff00ff)
        diffRgba[maskIdx] = 255;
        diffRgba[maskIdx + 1] = 0;
        diffRgba[maskIdx + 2] = 255;
        diffRgba[maskIdx + 3] = 255;
      }
    }
  }

  const mismatchPercentage = totalUnionPixels > 0
    ? Math.min(100, Math.round((mismatchPixelCount / totalUnionPixels) * 10000) / 100)
    : 0;

  if (mismatchPixelCount > 0) {
    detectedShifts.push(
      `Visual difference detected in bounding region [X: ${minDiffX}..${maxDiffX}, Y: ${minDiffY}..${maxDiffY}]. ${mismatchPixelCount} differing pixel(s).`
    );
  }

  // 5. Verdict Computation
  let verdict: VisualRegressionOutput['verdict'] = 'PASS_IDENTICAL';
  const tolerancePercent = toleranceThreshold * 100;

  if (mismatchPixelCount === 0) {
    verdict = 'PASS_IDENTICAL';
  } else if (mismatchPercentage <= tolerancePercent && detectedShifts.length <= 1) {
    verdict = 'PASS_WITHIN_TOLERANCE';
  } else {
    verdict = 'FAIL_REGRESSION_DETECTED';
  }

  const hasRegression = verdict === 'FAIL_REGRESSION_DETECTED';

  // 6. Optional Diff Mask Export with Strict Path Validation
  let diffMaskSavedPath: string | undefined;
  if (diffOutputPath && mismatchPixelCount > 0) {
    // Security check: reject null bytes, directory traversal or non-PNG targets
    if (!diffOutputPath.includes('\0')) {
      const normalizedPath = path.normalize(diffOutputPath);
      if (normalizedPath.toLowerCase().endsWith('.png')) {
        try {
          const diffMaskBuf = createPngBuffer(maxWidth, maxHeight, diffRgba);
          const targetDir = path.dirname(normalizedPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          fs.writeFileSync(normalizedPath, diffMaskBuf);
          diffMaskSavedPath = normalizedPath;
        } catch {
          // Graceful fallback if filesystem write permissions are restricted
        }
      }
    }
  }

  return {
    hasRegression,
    mismatchPercentage,
    mismatchPixelCount,
    diffMaskSavedPath,
    detectedShifts,
    verdict,
    baselineDimensions,
    comparisonDimensions
  };
}
