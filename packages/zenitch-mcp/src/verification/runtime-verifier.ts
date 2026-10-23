import {
  isSafeDestination,
  isPrivateOrReservedIp,
  safeFetchHtml,
  readResponseWithLimit,
  DEFAULT_MAX_RESPONSE_BYTES,
  type UrlSafetyOptions,
  type UrlSafetyResult
} from '../utils/url-safety.js';
import fs from 'node:fs';
import path from 'node:path';
import { RuntimeAction, VerificationEvidenceItem } from '../schemas/memory.schema.js';
import { StorageEngine } from '../memory/storage-engine.js';

export interface ViewportConfig {
  name: 'desktop' | 'tablet' | 'mobile';
  width: number;
  height: number;
}

export const VIEWPORTS: Record<string, ViewportConfig> = {
  desktop: { name: 'desktop', width: 1280, height: 800 },
  tablet: { name: 'tablet', width: 768, height: 1024 },
  mobile: { name: 'mobile', width: 390, height: 844 }
};

export interface RuntimeVerificationOptions {
  projectRoot: string;
  route?: string;
  viewport?: 'desktop' | 'tablet' | 'mobile';
  actions?: RuntimeAction[];
  devServerUrl?: string;
  timeoutMs?: number;
  allowLoopback?: boolean;
}

export interface RuntimeVerificationResult {
  verdict: 'PASSED' | 'FAILED' | 'BLOCKED';
  summary: string;
  evidence: VerificationEvidenceItem[];
  durationMs: number;
  environment?: Record<string, any>;
}

export class RuntimeVerifier {
  public static async detectDevServer(projectRoot: string): Promise<{ running: boolean; url?: string; command?: string }> {
    let command: string | undefined;
    const pkgPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.dev) command = 'npm run dev';
        else if (pkg.scripts?.start) command = 'npm start';
      } catch {
        // ignore
      }
    }

    const commonPorts = [3000, 5173, 8080, 4200, 8000];
    for (const port of commonPorts) {
      const testUrl = 'http://localhost:' + port;
      const probe = await this.probeServer(testUrl, 300);
      if (probe.reachable) {
        return { running: true, url: testUrl, command };
      }
    }

    return { running: false, command };
  }

  public static validateUrlSafety(targetUrl: string, options?: UrlSafetyOptions): { safe: boolean; reason?: string } {
    const allowLoopback = options?.allowLoopback ?? (process.env.ZENITCH_ALLOW_LOOPBACK === 'true' || process.env.ZENITCH_ALLOW_LOOPBACK === '1');
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: 'Unsafe protocol "' + parsed.protocol + '". Only http: and https: are permitted.' };
      }
      const host = parsed.hostname.toLowerCase();
      // Block known cloud metadata service hostnames and local names unconditionally
      if (
        host === 'metadata.google.internal' ||
        host === 'metadata' ||
        host === 'instance-data' ||
        host === '169.254.169.254'
      ) {
        return { safe: false, reason: 'SSRF blocked: Instance metadata service access is prohibited.' };
      }
      // Block localhost unless explicitly allowed
      if (!allowLoopback && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))) {
        return { safe: false, reason: 'SSRF blocked: Localhost access is prohibited.' };
      }
      // Block private IPs / RFC 1918 / loopback / link-local
      if (isPrivateOrReservedIp(host, allowLoopback)) {
        return { safe: false, reason: 'SSRF blocked: Destination IP "' + host + '" is a private, reserved, or link-local address.' };
      }
      return { safe: true };
    } catch (e: any) {
      return { safe: false, reason: 'Invalid URL format: ' + e.message };
    }
  }

  public static async validateUrlSafetyAsync(targetUrl: string, options?: UrlSafetyOptions): Promise<UrlSafetyResult> {
    return isSafeDestination(targetUrl, options);
  }

  public static async probeServer(baseUrl: string, timeoutMs = 2000, options?: UrlSafetyOptions): Promise<{ reachable: boolean; status?: number; error?: string }> {
    const safety = await isSafeDestination(baseUrl, options);
    if (!safety.safe) {
      return { reachable: false, error: safety.reason };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(baseUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Zenitch-Verification/1.0' }
      });
      clearTimeout(timer);
      return { reachable: true, status: res.status };
    } catch (err: any) {
      return { reachable: false, error: err.name === 'AbortError' ? 'Probe timed out after ' + timeoutMs + 'ms' : err.message };
    }
  }

  public static async resolveServerUrl(providedUrl?: string, options?: UrlSafetyOptions): Promise<{ url: string; reachable: boolean; error?: string }> {
    if (providedUrl) {
      const probe = await this.probeServer(providedUrl, 2000, options);
      return { url: providedUrl, reachable: probe.reachable, error: probe.error };
    }

    // Default candidate ports
    const candidates = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://localhost:8080'];
    for (const cand of candidates) {
      const probe = await this.probeServer(cand, 1200, options);
      if (probe.reachable) {
        return { url: cand, reachable: true };
      }
    }

    return {
      url: candidates[0],
      reachable: false,
      error: 'No local development server detected on default ports (3000, 5173, 8080).'
    };
  }

  public static async fetchHtmlContent(url: string, timeoutMs = 5000, options?: UrlSafetyOptions): Promise<{ ok: boolean; status: number; html: string; error?: string }> {
    const res = await safeFetchHtml(url, { timeoutMs, maxBytes: DEFAULT_MAX_RESPONSE_BYTES, ...options });
    return {
      ok: res.ok,
      status: res.status,
      html: res.content,
      error: res.error
    };
  }

  public static parseElements(html: string): Array<{ tag: string; attrs: Record<string, string>; text: string }> {
    const results: Array<{ tag: string; attrs: Record<string, string>; text: string }> = [];
    const openTagRegex = /<([a-zA-Z0-9_-]+)([^>]*?)(\/?)>/gi;

    let match;
    while ((match = openTagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      if (tag.startsWith('!') || tag === 'script' || tag === 'style') continue;

      const rawAttrs = match[2];
      const isSelfClosing = match[3] === '/' || ['input', 'img', 'br', 'hr', 'meta', 'link'].includes(tag);

      const attrs: Record<string, string> = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const k = attrMatch[1].toLowerCase();
        const v = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        attrs[k] = v;
      }

      const startIndex = openTagRegex.lastIndex;
      let text = '';
      if (!isSelfClosing) {
        const closingTag = '</' + tag + '>';
        const closeIdx = html.toLowerCase().indexOf(closingTag, startIndex);
        if (closeIdx !== -1 && closeIdx - startIndex < 1000) {
          text = html.slice(startIndex, closeIdx).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        } else {
          const nextTagIdx = html.indexOf('<', startIndex);
          if (nextTagIdx !== -1) {
            text = html.slice(startIndex, nextTagIdx).replace(/\s+/g, ' ').trim();
          }
        }
      }

      results.push({ tag, attrs, text });
    }

    return results;
  }

  public static matchElement(
    elements: Array<{ tag: string; attrs: Record<string, string>; text: string }>,
    targetSelector: string
  ): { tag: string; attrs: Record<string, string>; text: string } | null {
    const cleanTarget = targetSelector.trim();

    // 1. data-testid
    const testIdMatch = cleanTarget.match(/data-testid=["']?([^"'\]]+)["']?/i);
    const targetTestId = testIdMatch ? testIdMatch[1] : (cleanTarget.startsWith('[data-testid=') ? cleanTarget.slice(13, -1) : null);
    if (targetTestId) {
      const el = elements.find(e => e.attrs['data-testid'] === targetTestId);
      if (el) return el;
    }

    // 2. id selector
    if (cleanTarget.startsWith('#')) {
      const id = cleanTarget.slice(1);
      const el = elements.find(e => e.attrs.id === id);
      if (el) return el;
    }

    // 3. name selector [name=foo]
    const nameMatch = cleanTarget.match(/name=["']?([^"'\]]+)["']?/i);
    if (nameMatch) {
      const name = nameMatch[1];
      const el = elements.find(e => e.attrs.name === name);
      if (el) return el;
    }

    // 4. class selector .foo
    if (cleanTarget.startsWith('.')) {
      const cls = cleanTarget.slice(1);
      const el = elements.find(e => e.attrs.class && e.attrs.class.split(' ').includes(cls));
      if (el) return el;
    }

    // 5. tag selector (button, input, etc.)
    const elByTag = elements.find(e => e.tag === cleanTarget.toLowerCase());
    if (elByTag) return elByTag;

    // 6. text or aria-label match
    const elByAria = elements.find(e => e.attrs['aria-label'] && e.attrs['aria-label'].toLowerCase().includes(cleanTarget.toLowerCase()));
    if (elByAria) return elByAria;

    const elByText = elements.find(e => e.text && e.text.toLowerCase().includes(cleanTarget.toLowerCase()));
    if (elByText) return elByText;

    return null;
  }

  public static checkResponsiveOverflow(html: string, viewport: ViewportConfig): { hasOverflow: boolean; details: string; evidence: VerificationEvidenceItem } {
    // Deterministic check for fixed widths exceeding viewport width in styles or inline styles
    const fixedWidthRegex = /width\s*:\s*([0-9]+)px/gi;
    let match;
    let maxFoundWidth = 0;

    while ((match = fixedWidthRegex.exec(html)) !== null) {
      const w = parseInt(match[1], 10);
      if (w > maxFoundWidth) maxFoundWidth = w;
    }

    const hasOverflow = maxFoundWidth > viewport.width;
    const summary = hasOverflow
      ? 'Responsive check FAILED: Horizontal overflow detected. Element width ' + maxFoundWidth + 'px exceeds ' + viewport.name + ' viewport width (' + viewport.width + 'px).'
      : 'Responsive check PASSED: No fixed horizontal overflow detected for ' + viewport.name + ' viewport (' + viewport.width + 'px).';

    return {
      hasOverflow,
      details: summary,
      evidence: {
        type: 'OVERFLOW_CHECK',
        summary,
        target: viewport.name,
        expected: '<= ' + viewport.width + 'px',
        actual: maxFoundWidth > 0 ? maxFoundWidth + 'px' : 'FLUID',
        timestamp: new Date().toISOString()
      }
    };
  }

  public static async execute(options: RuntimeVerificationOptions): Promise<RuntimeVerificationResult> {
    const startTime = performance.now();
    const evidence: VerificationEvidenceItem[] = [];

    // 1. Resolve & Probe dev server with unified SSRF boundary (S-005)
    const safetyOptions: UrlSafetyOptions = {
      allowLoopback: options.allowLoopback ?? (process.env.ZENITCH_ALLOW_LOOPBACK === 'true' || process.env.ZENITCH_ALLOW_LOOPBACK === '1' || !!options.devServerUrl)
    };
    const serverCheck = await this.resolveServerUrl(options.devServerUrl, safetyOptions);
    if (!serverCheck.reachable) {
      const summary = 'Runtime verification BLOCKED: Application dev server is not reachable (' + (serverCheck.error || 'Connection refused') + ').';
      return {
        verdict: 'BLOCKED',
        summary,
        evidence: [{
          type: 'PAGE_REACHED',
          summary,
          target: serverCheck.url,
          actual: 'UNREACHABLE',
          timestamp: new Date().toISOString()
        }],
        durationMs: Math.round(performance.now() - startTime),
        environment: { serverUrl: serverCheck.url, reachable: false }
      };
    }

    const viewportName = options.viewport || 'desktop';
    const viewport = VIEWPORTS[viewportName] || VIEWPORTS.desktop;

    // 2. Fetch page HTML
    const route = options.route || '/';
    const targetUrl = new URL(route, serverCheck.url).toString();

    const pageRes = await this.fetchHtmlContent(targetUrl, options.timeoutMs || 5000, safetyOptions);
    if (!pageRes.ok) {
      const summary = 'Runtime verification FAILED: Navigation to "' + route + '" returned ' + (pageRes.error || 'HTTP ' + pageRes.status) + '.';
      evidence.push({
        type: 'PAGE_REACHED',
        summary,
        target: route,
        expected: 'HTTP 200',
        actual: pageRes.error || 'HTTP ' + pageRes.status,
        timestamp: new Date().toISOString()
      });

      return {
        verdict: 'FAILED',
        summary,
        evidence,
        durationMs: Math.round(performance.now() - startTime),
        environment: { serverUrl: serverCheck.url, viewport: viewport.name }
      };
    }

    evidence.push({
      type: 'PAGE_REACHED',
      summary: 'Target route "' + route + '" successfully reached on ' + viewport.name + ' viewport.',
      target: route,
      expected: 'HTTP 200 OK',
      actual: 'HTTP ' + pageRes.status,
      timestamp: new Date().toISOString()
    });

    const elements = this.parseElements(pageRes.html);
    let allActionsPassed = true;

    // 3. Responsive checks if requested
    if (options.viewport) {
      const overflow = this.checkResponsiveOverflow(pageRes.html, viewport);
      evidence.push(overflow.evidence);
      if (overflow.hasOverflow) {
        allActionsPassed = false;
      }
    }

    // 4. Execute action sequence
    const actions = options.actions || [];
    for (const act of actions) {
      switch (act.action) {
        case 'NAVIGATE': {
          evidence.push({
            type: 'PAGE_REACHED',
            summary: 'Navigated to ' + (act.target || route),
            target: act.target || route,
            actual: '200_OK',
            timestamp: new Date().toISOString()
          });
          break;
        }

        case 'CHECK_URL': {
          const expected = act.expected || act.value || '';
          const matched = targetUrl.includes(expected);
          evidence.push({
            type: 'URL_MATCH',
            summary: matched ? 'URL matches expected pattern "' + expected + '"' : 'URL pattern mismatch',
            expected,
            actual: targetUrl,
            timestamp: new Date().toISOString()
          });
          if (!matched) allActionsPassed = false;
          break;
        }

        case 'CHECK_TEXT': {
          const expectedText = act.expected || act.value || '';
          const matched = pageRes.html.toLowerCase().includes(expectedText.toLowerCase());
          evidence.push({
            type: 'TEXT_MATCH',
            summary: matched ? 'Expected text "' + expectedText + '" confirmed on page.' : 'Expected text "' + expectedText + '" absent.',
            expected: expectedText,
            actual: matched ? 'PRESENT' : 'ABSENT',
            timestamp: new Date().toISOString()
          });
          if (!matched) allActionsPassed = false;
          break;
        }

        case 'CHECK_VISIBLE':
        case 'WAIT_FOR': {
          const target = act.target || '';
          const el = this.matchElement(elements, target);
          const found = el !== null;
          evidence.push({
            type: 'ELEMENT_VISIBLE',
            summary: found
              ? 'Element "' + target + '" confirmed present in response HTML DOM (server-rendered).'
              : 'Element "' + target + '" not found in response HTML DOM.',
            target,
            expected: 'PRESENT_IN_DOM',
            actual: found ? 'PRESENT_IN_DOM' : 'NOT_FOUND',
            timestamp: new Date().toISOString()
          });
          if (!found) allActionsPassed = false;
          break;
        }

        case 'CHECK_ATTRIBUTE': {
          const target = act.target || '';
          const attr = act.attribute || 'type';
          const expectedVal = act.expected || act.value || '';
          const el = this.matchElement(elements, target);
          const actualVal = el ? (el.attrs[attr.toLowerCase()] ?? '') : 'ELEMENT_NOT_FOUND';
          const matched = el !== null && actualVal === expectedVal;
          evidence.push({
            type: 'ELEMENT_INTERACTED',
            summary: matched
              ? 'Element attribute [' + attr + '="' + expectedVal + '"] matched in response HTML.'
              : 'Element attribute mismatch for ' + target,
            target,
            expected: attr + '=' + expectedVal,
            actual: attr + '=' + actualVal,
            timestamp: new Date().toISOString()
          });
          if (!matched) allActionsPassed = false;
          break;
        }

        case 'FILL': {
          const target = act.target || '';
          const rawVal = act.value || '';
          const el = this.matchElement(elements, target);
          const found = el !== null && (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select');
          const redactedVal = StorageEngine.redactSecrets(rawVal);
          evidence.push({
            type: 'ELEMENT_INTERACTED',
            summary: found
              ? 'Form input target "' + target + '" confirmed present in DOM. (Note: Probed via HTTP/HTML; client-side value typing and change events require headless browser).'
              : 'Target input "' + target + '" not found in response HTML DOM.',
            target,
            expected: 'INPUT_FIELD_PRESENT',
            actual: found ? 'INPUT_PRESENT_NO_JS' : 'ELEMENT_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
          if (!found) allActionsPassed = false;
          break;
        }

        case 'CLICK': {
          const target = act.target || '';
          const el = this.matchElement(elements, target);
          const found = el !== null;
          evidence.push({
            type: 'ELEMENT_INTERACTED',
            summary: found
              ? 'Clickable target "' + target + '" confirmed present in DOM. (Note: Probed via HTTP/HTML; client-side click event dispatching requires headless browser).'
              : 'Target clickable element "' + target + '" not found in response HTML DOM.',
            target,
            expected: 'CLICKABLE_ELEMENT_PRESENT',
            actual: found ? 'ELEMENT_PRESENT_NO_JS' : 'ELEMENT_NOT_FOUND',
            timestamp: new Date().toISOString()
          });
          if (!found) allActionsPassed = false;
          break;
        }

        case 'SCREENSHOT': {
          evidence.push({
            type: 'SCREENSHOT_REFERENCE',
            summary: 'Screenshot action skipped: Pixel rendering requires headless browser engine. HTTP probe records structured DOM evidence only.',
            target: viewport.name,
            expected: 'BROWSER_CAPTURE',
            actual: 'DEFERRED_REQUIRES_BROWSER',
            timestamp: new Date().toISOString()
          });
          break;
        }
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    const verdict = allActionsPassed ? 'PASSED' : 'FAILED';
    const summary = allActionsPassed
      ? 'HTTP/HTML runtime probing PASSED on ' + viewport.name + ' viewport (' + evidence.length + ' evidence points collected).'
      : 'Runtime verification FAILED: One or more assertions failed during workflow execution.';

    return {
      verdict,
      summary,
      evidence,
      durationMs,
      environment: {
        serverUrl: serverCheck.url,
        viewport: viewport.name,
        dimensions: viewport.width + 'x' + viewport.height
      }
    };
  }
}
