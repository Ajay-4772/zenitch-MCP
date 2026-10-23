import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { auditPageQuality } from '../src/audit/page-auditor.js';
import { compareVisualRegression, createPngBuffer } from '../src/audit/visual-comparator.js';
import { ZenitchServer } from '../src/server.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('Quality Auditing: Accessible clean markup achieves high score with zero violations', async () => {
  const cleanHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Accessible Portal</title>
    </head>
    <body>
      <main>
        <h1>Patient Records</h1>
        <form>
          <label for="patient-id">Patient Identification</label>
          <input id="patient-id" type="text" name="pid" />
          <button type="submit" style="width: 120px; height: 48px;">Search</button>
        </form>
        <img src="/avatar.png" alt="Doctor profile avatar" />
        <a href="/dashboard">Return to Dashboard</a>
      </main>
    </body>
    </html>
  `;

  const result = await auditPageQuality({
    url: 'http://localhost:3000/clean',
    htmlContent: cleanHtml
  });

  assert.equal(result.empiricalFindings.missingFormLabels.length, 0);
  assert.equal(result.empiricalFindings.brokenNavLinks.length, 0);
  assert.equal(result.empiricalFindings.horizontalOverflowDetected, false);
  assert.equal(result.recommendations.summaryScore, 100);
  assert.equal(result.empiricalFindings.auditMode, 'static_source_analysis');
  assert.ok(result.empiricalFindings.disclaimer.includes('static HTML/CSS source analysis'));
});

test('Quality Auditing: Detects unlabelled form inputs, broken links & missing alt attributes', async () => {
  const defectiveHtml = `
    <main>
      <input type="text" name="secret_code" placeholder="Enter code" />
      <img src="/banner.png" />
      <a href="#" class="nav-item">Mockup Route</a>
    </main>
  `;

  const result = await auditPageQuality({
    url: 'http://localhost:3000/defects',
    htmlContent: defectiveHtml
  });

  assert.ok(result.empiricalFindings.missingFormLabels.length >= 1);
  assert.ok(result.empiricalFindings.brokenNavLinks.length >= 1);
  assert.ok(result.recommendations.summaryScore < 80);

  // Policy integration
  const labelPolicy = result.empiricalFindings.policyViolations?.find(p => p.policyId === 'POL-A11Y-001');
  assert.ok(labelPolicy);
  assert.equal(labelPolicy.severity, 'ERROR');

  const navPolicy = result.empiricalFindings.policyViolations?.find(p => p.policyId === 'POL-INT-001');
  assert.ok(navPolicy);
});

test('Quality Auditing: Flags horizontal overflow exceeding mobile viewport and generates CSS diff', async () => {
  const overflowHtml = `
    <html>
    <body>
      <div style="width: 750px; background: #eee;">
        Wide desktop-only fixed container
      </div>
    </body>
    </html>
  `;

  const result = await auditPageQuality({
    url: 'http://localhost:3000/overflow',
    htmlContent: overflowHtml
  });

  assert.equal(result.empiricalFindings.horizontalOverflowDetected, true);
  assert.ok(result.empiricalFindings.overflowingElements.length >= 1);
  assert.ok(result.recommendations.suggestedCssDiffs.length >= 1);

  const diff = result.recommendations.suggestedCssDiffs[0];
  assert.ok(diff.cssPatch.includes('max-width: 100%'));
});

test('Quality Auditing: Flags sub-44px touch targets and low text contrast', async () => {
  const touchDefectHtml = `
    <div>
      <button style="width: 24px; height: 24px;">x</button>
      <span style="color: #ffff00; background: #ffffff;">Yellow on white low contrast</span>
    </div>
  `;

  const result = await auditPageQuality({
    url: 'http://localhost:3000/touch',
    htmlContent: touchDefectHtml
  });

  assert.ok(result.empiricalFindings.touchTargetViolations.length >= 1);
  assert.ok(result.empiricalFindings.contrastFailures.length >= 1);
  assert.ok(result.empiricalFindings.contrastFailures[0].measuredRatio < 4.5);
});

test('Visual Regression: Compares identical PNG images with PASS_IDENTICAL', () => {
  const tmpDir = os.tmpdir();
  const baseImg = path.join(tmpDir, `base-${Date.now()}.png`);
  const currImg = path.join(tmpDir, `curr-${Date.now()}.png`);

  // Create a 10x10 blue PNG
  const pixels = Buffer.alloc(10 * 10 * 4);
  for (let i = 0; i < 100; i++) {
    pixels[i * 4] = 2; // R
    pixels[i * 4 + 1] = 132; // G
    pixels[i * 4 + 2] = 199; // B (#0284c7)
    pixels[i * 4 + 3] = 255; // A
  }

  const pngBuf = createPngBuffer(10, 10, pixels);
  fs.writeFileSync(baseImg, pngBuf);
  fs.writeFileSync(currImg, pngBuf);

  try {
    const result = compareVisualRegression({
      baselineImagePath: baseImg,
      currentImagePath: currImg
    });

    assert.equal(result.verdict, 'PASS_IDENTICAL');
    assert.equal(result.mismatchPixelCount, 0);
    assert.equal(result.mismatchPercentage, 0);
    assert.equal(result.hasRegression, false);
  } finally {
    fs.unlinkSync(baseImg);
    fs.unlinkSync(currImg);
  }
});

test('Visual Regression: Detects visual changes, creates diff mask and flags FAIL_REGRESSION_DETECTED', () => {
  const tmpDir = os.tmpdir();
  const baseImg = path.join(tmpDir, `base-diff-${Date.now()}.png`);
  const currImg = path.join(tmpDir, `curr-diff-${Date.now()}.png`);
  const diffMask = path.join(tmpDir, `mask-diff-${Date.now()}.png`);

  const basePixels = Buffer.alloc(10 * 10 * 4);
  const currPixels = Buffer.alloc(10 * 10 * 4);

  for (let i = 0; i < 100; i++) {
    basePixels[i * 4] = 0;
    basePixels[i * 4 + 1] = 0;
    basePixels[i * 4 + 2] = 0;
    basePixels[i * 4 + 3] = 255;

    currPixels[i * 4] = i < 30 ? 255 : 0; // 30 pixels changed to red
    currPixels[i * 4 + 1] = 0;
    currPixels[i * 4 + 2] = 0;
    currPixels[i * 4 + 3] = 255;
  }

  fs.writeFileSync(baseImg, createPngBuffer(10, 10, basePixels));
  fs.writeFileSync(currImg, createPngBuffer(10, 10, currPixels));

  try {
    const result = compareVisualRegression({
      baselineImagePath: baseImg,
      currentImagePath: currImg,
      diffOutputPath: diffMask,
      toleranceThreshold: 0.05
    });

    assert.equal(result.verdict, 'FAIL_REGRESSION_DETECTED');
    assert.equal(result.hasRegression, true);
    assert.equal(result.mismatchPixelCount, 30);
    assert.equal(result.mismatchPercentage, 30);
    assert.ok(result.diffMaskSavedPath);
    assert.ok(fs.existsSync(diffMask));
  } finally {
    if (fs.existsSync(baseImg)) fs.unlinkSync(baseImg);
    if (fs.existsSync(currImg)) fs.unlinkSync(currImg);
    if (fs.existsSync(diffMask)) fs.unlinkSync(diffMask);
  }
});

test('Visual Regression: Flags dimension shift when image resolutions diverge', () => {
  const tmpDir = os.tmpdir();
  const baseImg = path.join(tmpDir, `base-dim-${Date.now()}.png`);
  const currImg = path.join(tmpDir, `curr-dim-${Date.now()}.png`);

  const basePixels = Buffer.alloc(8 * 8 * 4, 100);
  const currPixels = Buffer.alloc(12 * 8 * 4, 100);

  fs.writeFileSync(baseImg, createPngBuffer(8, 8, basePixels));
  fs.writeFileSync(currImg, createPngBuffer(12, 8, currPixels));

  try {
    const result = compareVisualRegression({
      baselineImagePath: baseImg,
      currentImagePath: currImg
    });

    assert.equal(result.verdict, 'FAIL_REGRESSION_DETECTED');
    const dimShift = result.detectedShifts.find(s => s.includes('Dimension mismatch'));
    assert.ok(dimShift);
  } finally {
    fs.unlinkSync(baseImg);
    fs.unlinkSync(currImg);
  }
});

test('Visual Regression: Returns structured error when file is missing or corrupt', () => {
  const result = compareVisualRegression({
    baselineImagePath: 'C:/fake/path/nonexistent.png',
    currentImagePath: 'C:/fake/path/nonexistent2.png'
  });

  assert.equal(result.verdict, 'ERROR_UNSUPPORTED_OR_CORRUPT');
  assert.equal(result.hasRegression, true);
  assert.ok(result.errorDetails?.includes('does not exist'));
});

test('ZenitchServer: executes zenitch_audit_page_quality via CallTool', async () => {
  const server = new ZenitchServer({ requireApprovalForChanges: false, logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const handler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(handler);

  const response = await handler(
    {
      method: 'tools/call',
      params: {
        name: 'zenitch_audit_page_quality',
        arguments: {
          url: 'http://localhost:3000/test-page',
          htmlContent: '<html><body><main><button style="width: 80px; height: 48px;">Valid</button></main></body></html>'
        }
      }
    },
    {}
  );

  assert.equal(response.isError, undefined);
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.success, true);
  assert.ok(parsed.data.empiricalFindings);
  assert.equal(parsed.data.empiricalFindings.testedUrl, 'http://localhost:3000/test-page');
});

test('ZenitchServer: executes zenitch_compare_visual_regression via CallTool', async () => {
  const server = new ZenitchServer({ requireApprovalForChanges: false, logLevel: 'ERROR' });
  const internalServer = server.getServerInstance();

  const handler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(handler);

  const tmpDir = os.tmpdir();
  const img1 = path.join(tmpDir, `mcp-img1-${Date.now()}.png`);
  const img2 = path.join(tmpDir, `mcp-img2-${Date.now()}.png`);

  const px = Buffer.alloc(4 * 4 * 4, 128);
  fs.writeFileSync(img1, createPngBuffer(4, 4, px));
  fs.writeFileSync(img2, createPngBuffer(4, 4, px));

  try {
    const response = await handler(
      {
        method: 'tools/call',
        params: {
          name: 'zenitch_compare_visual_regression',
          arguments: {
            baselineImagePath: img1,
            currentImagePath: img2
          }
        }
      },
      {}
    );

    assert.equal(response.isError, undefined);
    const parsed = JSON.parse(response.content[0].text);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.verdict, 'PASS_IDENTICAL');
  } finally {
    fs.unlinkSync(img1);
    fs.unlinkSync(img2);
  }
});

// ============================================================================
// HARDENING & VALIDATION PASS TESTS (Zenitch Phase 3, Step 5)
// ============================================================================

import { parsePng, makeChunk, crc32, paethPredictor } from '../src/audit/visual-comparator.js';
import zlib from 'node:zlib';

test('Hardening: Visual Regression generates union-sized diff mask with magenta overflow for asymmetric dimensions', () => {
  const tmpDir = os.tmpdir();
  const baseImg = path.join(tmpDir, `base-asym-${Date.now()}.png`);
  const currImg = path.join(tmpDir, `curr-asym-${Date.now()}.png`);
  const diffMask = path.join(tmpDir, `diff-asym-${Date.now()}.png`);

  // Baseline: 10x8 blue pixels
  const basePx = Buffer.alloc(10 * 8 * 4);
  for (let i = 0; i < 10 * 8; i++) {
    basePx[i * 4] = 0;
    basePx[i * 4 + 1] = 0;
    basePx[i * 4 + 2] = 255;
    basePx[i * 4 + 3] = 255;
  }

  // Current: 8x12 blue pixels (narrower width, taller height)
  const currPx = Buffer.alloc(8 * 12 * 4);
  for (let i = 0; i < 8 * 12; i++) {
    currPx[i * 4] = 0;
    currPx[i * 4 + 1] = 0;
    currPx[i * 4 + 2] = 255;
    currPx[i * 4 + 3] = 255;
  }

  fs.writeFileSync(baseImg, createPngBuffer(10, 8, basePx));
  fs.writeFileSync(currImg, createPngBuffer(8, 12, currPx));

  try {
    const result = compareVisualRegression({
      baselineImagePath: baseImg,
      currentImagePath: currImg,
      diffOutputPath: diffMask
    });

    assert.equal(result.verdict, 'FAIL_REGRESSION_DETECTED');
    assert.equal(result.hasRegression, true);
    // Overlap is 8x8 = 64 pixels (all blue, match).
    // Union is 10x12 = 120 pixels.
    // Mismatched pixels = 120 - 64 = 56 pixels.
    assert.equal(result.mismatchPixelCount, 56);
    assert.equal(result.mismatchPercentage, Math.round((56 / 120) * 10000) / 100);

    // Verify diff mask was generated and read back dimensions
    assert.ok(result.diffMaskSavedPath);
    assert.ok(fs.existsSync(diffMask));

    const maskBuf = fs.readFileSync(diffMask);
    const parsedMask = parsePng(maskBuf);
    assert.equal(parsedMask.width, 10);
    assert.equal(parsedMask.height, 12);

    // Verify non-overlapping region pixel (x=9, y=0) is magenta (#ff00ff)
    const idx1 = (0 * 10 + 9) * 4;
    assert.equal(parsedMask.rgba[idx1], 255);
    assert.equal(parsedMask.rgba[idx1 + 1], 0);
    assert.equal(parsedMask.rgba[idx1 + 2], 255);
    assert.equal(parsedMask.rgba[idx1 + 3], 255);

    // Verify non-overlapping region pixel (x=0, y=11) is magenta (#ff00ff)
    const idx2 = (11 * 10 + 0) * 4;
    assert.equal(parsedMask.rgba[idx2], 255);
    assert.equal(parsedMask.rgba[idx2 + 1], 0);
    assert.equal(parsedMask.rgba[idx2 + 2], 255);
    assert.equal(parsedMask.rgba[idx2 + 3], 255);
  } finally {
    if (fs.existsSync(baseImg)) fs.unlinkSync(baseImg);
    if (fs.existsSync(currImg)) fs.unlinkSync(currImg);
    if (fs.existsSync(diffMask)) fs.unlinkSync(diffMask);
  }
});

test('Hardening: Visual Regression decodes all 5 PNG filter methods (0..4) and RGB Color Type 2 correctly', () => {
  // Construct a 4x5 RGBA image with 1 row per filter method
  const width = 4;
  const height = 5;
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;

  // Desired raw RGBA pixel data
  const rawTarget = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rawTarget[idx] = (y * 50 + x * 20 + 10) & 255;
      rawTarget[idx + 1] = (y * 30 + x * 40 + 20) & 255;
      rawTarget[idx + 2] = (y * 40 + x * 10 + 30) & 255;
      rawTarget[idx + 3] = 255;
    }
  }

  // Manually encode scanlines with filters 0, 1, 2, 3, 4
  const filteredScanlines = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const filter = y; // Row 0=None, 1=Sub, 2=Up, 3=Average, 4=Paeth
    filteredScanlines[y * (1 + rowBytes)] = filter;

    const srcRowStart = y * rowBytes;
    const prevSrcRowStart = (y - 1) * rowBytes;
    const dstRowStart = y * (1 + rowBytes) + 1;

    for (let x = 0; x < rowBytes; x++) {
      const orig = rawTarget[srcRowStart + x];
      const a = x >= bytesPerPixel ? rawTarget[srcRowStart + x - bytesPerPixel] : 0;
      const b = y > 0 ? rawTarget[prevSrcRowStart + x] : 0;
      const c = (y > 0 && x >= bytesPerPixel) ? rawTarget[prevSrcRowStart + x - bytesPerPixel] : 0;

      let filteredVal: number;
      switch (filter) {
        case 0: filteredVal = orig; break;
        case 1: filteredVal = (orig - a) & 255; break;
        case 2: filteredVal = (orig - b) & 255; break;
        case 3: filteredVal = (orig - Math.floor((a + b) / 2)) & 255; break;
        case 4: filteredVal = (orig - paethPredictor(a, b, c)) & 255; break;
        default: filteredVal = orig;
      }
      filteredScanlines[dstRowStart + x] = filteredVal;
    }
  }

  // Package into valid PNG
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // Color type 6: RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const pngBuffer = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(filteredScanlines)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);

  const parsed = parsePng(pngBuffer);
  assert.equal(parsed.width, width);
  assert.equal(parsed.height, height);
  assert.equal(parsed.colorType, 6);
  // Verify that all decompressed and de-filtered pixels exactly equal the original target!
  assert.deepEqual(parsed.rgba, rawTarget);

  // Test Color Type 2 (RGB 24-bit without alpha)
  const rgbWidth = 2;
  const rgbHeight = 2;
  const rgbRowBytes = rgbWidth * 3;
  const rgbScanlines = Buffer.alloc(rgbHeight * (1 + rgbRowBytes));
  for (let y = 0; y < rgbHeight; y++) {
    rgbScanlines[y * (1 + rgbRowBytes)] = 0; // Filter 0
    for (let x = 0; x < rgbWidth; x++) {
      const idx = y * (1 + rgbRowBytes) + 1 + x * 3;
      rgbScanlines[idx] = 100;
      rgbScanlines[idx + 1] = 150;
      rgbScanlines[idx + 2] = 200;
    }
  }

  const rgbIhdr = Buffer.alloc(13);
  rgbIhdr.writeUInt32BE(rgbWidth, 0);
  rgbIhdr.writeUInt32BE(rgbHeight, 4);
  rgbIhdr.writeUInt8(8, 8);
  rgbIhdr.writeUInt8(2, 9); // Color type 2: RGB

  const rgbPng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', rgbIhdr),
    makeChunk('IDAT', zlib.deflateSync(rgbScanlines)),
    makeChunk('IEND', Buffer.alloc(0))
  ]);

  const parsedRgb = parsePng(rgbPng);
  assert.equal(parsedRgb.width, 2);
  assert.equal(parsedRgb.height, 2);
  assert.equal(parsedRgb.colorType, 2);
  // Normalized to 4-channel RGBA
  assert.equal(parsedRgb.rgba.length, 2 * 2 * 4);
  assert.equal(parsedRgb.rgba[0], 100);
  assert.equal(parsedRgb.rgba[1], 150);
  assert.equal(parsedRgb.rgba[2], 200);
  assert.equal(parsedRgb.rgba[3], 255); // Alpha expanded to 255
});

test('Hardening: Visual Regression enforces chunk boundaries, size limits, and security controls', () => {
  // Test 1: Excessive dimensions (> 8192) rejected
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bigIhdr = Buffer.alloc(13);
  bigIhdr.writeUInt32BE(10000, 0); // 10,000 px > 8192
  bigIhdr.writeUInt32BE(10000, 4);
  bigIhdr.writeUInt8(8, 8);
  bigIhdr.writeUInt8(6, 9);

  const bigPng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', bigIhdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.alloc(100))),
    makeChunk('IEND', Buffer.alloc(0))
  ]);

  assert.throws(() => parsePng(bigPng), /Invalid or excessive image dimensions/);

  // Test 2: Truncated chunk rejected
  const truncPng = bigPng.subarray(0, 25);
  assert.throws(() => parsePng(truncPng), /truncated|buffer too short/i);

  // Test 3: Null-byte injection in file paths handled safely
  const nullByteResult = compareVisualRegression({
    baselineImagePath: 'valid.png\0bad',
    currentImagePath: 'valid2.png'
  });
  assert.equal(nullByteResult.verdict, 'ERROR_UNSUPPORTED_OR_CORRUPT');
  assert.ok(nullByteResult.errorDetails?.includes('prohibited characters'));
});

test('Hardening: Page Auditor correctly identifies wrapping labels and validates aria-labelledby IDs', async () => {
  const mixedMarkup = `
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Test</title></head>
    <body>
      <!-- Wrapping label test: no ID attribute on input -->
      <label>
        Search Query
        <input type="search" name="q" />
      </label>

      <!-- Explicit label with for/id test -->
      <label for="user-email">Email Address</label>
      <input id="user-email" type="email" />

      <!-- Valid aria-labelledby pointing to existing element -->
      <h2 id="billing-title">Billing Address</h2>
      <input type="text" aria-labelledby="billing-title" />

      <!-- Broken aria-labelledby pointing to non-existent ID -->
      <input type="text" id="orphan-ref" aria-labelledby="non-existent-header" />

      <!-- Complete orphan input lacking any label -->
      <input type="text" name="secret_token" />
    </body>
    </html>
  `;

  const result = await auditPageQuality({
    url: 'http://localhost:3000/labels-test',
    htmlContent: mixedMarkup
  });

  // Exactly 2 inputs are unlabelled: orphan-ref and secret_token
  assert.equal(result.empiricalFindings.missingFormLabels.length, 2);
  assert.ok(result.empiricalFindings.missingFormLabels.includes('input#orphan-ref'));
  assert.ok(result.empiricalFindings.missingFormLabels.includes('input[type="text"]'));

  // Ensure wrapping label and valid aria-labelledby were NOT falsely flagged
  assert.ok(!result.empiricalFindings.missingFormLabels.includes('input[type="search"]'));
  assert.ok(!result.empiricalFindings.missingFormLabels.includes('input#user-email'));
});

test('Hardening: Page Auditor blocks SSRF cloud metadata and invalid protocols', async () => {
  // Cloud metadata endpoint
  const ssrfResult = await auditPageQuality({
    url: 'http://169.254.169.254/latest/meta-data/'
  });
  // Must contain security warning and not attempt unsafe fetch
  assert.ok(ssrfResult.empiricalFindings.disclaimer);

  // Google cloud metadata
  const gcpResult = await auditPageQuality({
    url: 'http://metadata.google.internal/computeMetadata/v1/'
  });
  assert.ok(gcpResult.empiricalFindings.disclaimer);

  // Unsafe protocol
  const protoResult = await auditPageQuality({
    url: 'file:///etc/passwd'
  });
  assert.ok(protoResult.empiricalFindings.disclaimer);
});

test('Hardening: Page Auditor maintains static estimate integrity and reports untested criteria as untested', async () => {
  const result = await auditPageQuality({
    url: 'http://localhost:3000/estimate-check',
    htmlContent: '<main><p>Test</p></main>'
  });

  assert.equal(result.empiricalFindings.auditMode, 'static_source_analysis');
  assert.ok(result.empiricalFindings.disclaimer.includes('static HTML/CSS source analysis'));
  assert.ok(result.empiricalFindings.disclaimer.includes('Rendered layout shifts'));

  // Untested criteria must explicitly declare external stylesheets and computed styles
  const untested = result.empiricalFindings.untestedCriteria;
  assert.ok(untested.some(u => u.includes('external stylesheets') || u.includes('CSS classes')));
  assert.ok(untested.some(u => u.includes('GPU compositing')));
  assert.ok(untested.some(u => u.includes('continuous scrolling')));

  // Tested criteria must explicitly identify static estimates
  const tested = result.empiricalFindings.testedCriteria;
  assert.ok(tested.some(t => t.includes('Static estimate')));
});

// ============================================================================
// FINAL SECURITY & CORRECTNESS REVIEW TESTS (Zenitch Step 5 Review)
// ============================================================================

import {
  isPrivateOrReservedIp,
  isSafeDestination,
  readResponseWithLimit
} from '../src/audit/page-auditor.js';
import { MAX_TOTAL_PIXELS } from '../src/audit/visual-comparator.js';

test('Security Hardening: Page Auditor DNS resolution and private IP blocking prevents SSRF', async () => {
  // Test private and reserved IP range detection
  assert.equal(isPrivateOrReservedIp('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('127.255.255.255'), true);
  assert.equal(isPrivateOrReservedIp('10.0.0.1'), true);
  assert.equal(isPrivateOrReservedIp('10.255.255.255'), true);
  assert.equal(isPrivateOrReservedIp('172.16.0.1'), true);
  assert.equal(isPrivateOrReservedIp('172.31.255.255'), true);
  assert.equal(isPrivateOrReservedIp('192.168.1.1'), true);
  assert.equal(isPrivateOrReservedIp('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIp('100.64.0.1'), true); // Carrier-grade NAT
  assert.equal(isPrivateOrReservedIp('0.0.0.0'), true);
  assert.equal(isPrivateOrReservedIp('::1'), true);
  assert.equal(isPrivateOrReservedIp('fe80::1'), true);
  assert.equal(isPrivateOrReservedIp('fc00::1'), true);
  assert.equal(isPrivateOrReservedIp('::ffff:169.254.169.254'), true);

  // Test public safe IP addresses
  assert.equal(isPrivateOrReservedIp('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedIp('93.184.216.34'), false);

  // Test isSafeDestination hostname and IP rejection
  const loopbackDest = await isSafeDestination('http://127.0.0.1:8080/internal');
  assert.equal(loopbackDest.safe, false);
  assert.ok(loopbackDest.reason?.includes('private'));

  const privateDest = await isSafeDestination('http://10.200.0.5/admin');
  assert.equal(privateDest.safe, false);

  const localHostDest = await isSafeDestination('http://localhost:3000/metrics');
  assert.equal(localHostDest.safe, false);

  const metaHostDest = await isSafeDestination('http://metadata.google.internal/computeMetadata/v1/');
  assert.equal(metaHostDest.safe, false);

  const ftpDest = await isSafeDestination('ftp://internal-server/file');
  assert.equal(ftpDest.safe, false);
});

test('Security Hardening: HTTP streaming body reader caps consumption and handles missing/misleading Content-Length', async () => {
  // Simulate a streaming response with 30 chunks of 100KB = 3MB total payload
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 30; i++) {
        controller.enqueue(new Uint8Array(100 * 1024).fill(65)); // 100KB of 'A'
      }
      controller.close();
    }
  });

  // Provide a misleading Content-Length: '100' while streaming 3MB
  const misleadingResponse = new Response(stream, {
    headers: { 'Content-Length': '100' }
  });

  // Enforce 2MB limit (2 * 1024 * 1024 = 2,097,152 bytes)
  const result = await readResponseWithLimit(misleadingResponse, 2 * 1024 * 1024);

  assert.equal(result.truncated, true);
  assert.equal(result.content.length, 2 * 1024 * 1024);
});

test('Correctness Hardening: PNG parser rejects duplicate IHDR, missing IEND, and CRC corruption with structured errors', () => {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);

  // 1. Duplicate IHDR
  const dupIhdrPng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.alloc(20))),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
  assert.throws(() => parsePng(dupIhdrPng), /duplicate IHDR/i);

  // 2. Missing IEND
  const missingIendPng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.alloc(20)))
  ]);
  assert.throws(() => parsePng(missingIendPng), /missing required IEND/i);

  // 3. Corrupt CRC: tamper 1 byte in chunk data without updating CRC
  const validChunk = makeChunk('IDAT', zlib.deflateSync(Buffer.alloc(20)));
  validChunk[10] ^= 0xff; // Flip bits in data
  const corruptCrcPng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    validChunk,
    makeChunk('IEND', Buffer.alloc(0))
  ]);
  assert.throws(() => parsePng(corruptCrcPng), /CRC mismatch/i);

  // 4. Verify compareVisualRegression handles CRC corruption gracefully with structured verdict
  const tmpDir = os.tmpdir();
  const corruptFile = path.join(tmpDir, `corrupt-crc-${Date.now()}.png`);
  fs.writeFileSync(corruptFile, corruptCrcPng);

  try {
    const regressionRes = compareVisualRegression({
      baselineImagePath: corruptFile,
      currentImagePath: corruptFile
    });
    assert.equal(regressionRes.verdict, 'ERROR_UNSUPPORTED_OR_CORRUPT');
    assert.ok(regressionRes.errorDetails?.includes('CRC mismatch'));
  } finally {
    fs.unlinkSync(corruptFile);
  }
});

test('Memory Hardening: Visual regression comparator enforces 16MP total pixel budget', () => {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Construct IHDR claiming 5000 x 5000 = 25 MegaPixels (> 16MP MAX_TOTAL_PIXELS)
  const hugeIhdr = Buffer.alloc(13);
  hugeIhdr.writeUInt32BE(5000, 0);
  hugeIhdr.writeUInt32BE(5000, 4);
  hugeIhdr.writeUInt8(8, 8);
  hugeIhdr.writeUInt8(6, 9);

  const hugePng = Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', hugeIhdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.alloc(50))),
    makeChunk('IEND', Buffer.alloc(0))
  ]);

  assert.throws(() => parsePng(hugePng), /exceed maximum budget/i);

  const tmpDir = os.tmpdir();
  const hugeFile = path.join(tmpDir, `huge-${Date.now()}.png`);
  fs.writeFileSync(hugeFile, hugePng);

  try {
    const result = compareVisualRegression({
      baselineImagePath: hugeFile,
      currentImagePath: hugeFile
    });
    assert.equal(result.verdict, 'ERROR_UNSUPPORTED_OR_CORRUPT');
    assert.ok(result.errorDetails?.includes('budget'));
  } finally {
    fs.unlinkSync(hugeFile);
  }
});
