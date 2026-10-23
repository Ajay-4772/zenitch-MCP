import dns from 'node:dns';

/**
 * Authoritative production limit for HTTP response streaming (2 MB = 2,097,152 bytes).
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface UrlSafetyOptions {
  allowLoopback?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
  url?: URL;
}

/**
 * Checks whether an IP string belongs to private, loopback, link-local, or reserved ranges.
 */
export function isPrivateOrReservedIp(ip: string, allowLoopback = false): boolean {
  // IPv4 checks
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    if (octets.some(o => o < 0 || o > 255)) return true;
    const [o0, o1] = octets;

    // 0.0.0.0/8 (Current network)
    if (o0 === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (o0 === 127) {
      return !allowLoopback;
    }

    // 10.0.0.0/8 (Private RFC 1918)
    if (o0 === 10) return true;

    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure instance metadata)
    if (o0 === 169 && o1 === 254) return true;

    // 172.16.0.0/12 (Private RFC 1918)
    if (o0 === 172 && o1 >= 16 && o1 <= 31) return true;

    // 192.168.0.0/16 (Private RFC 1918)
    if (o0 === 192 && o1 === 168) return true;

    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (o0 === 100 && o1 >= 64 && o1 <= 127) return true;

    // 224.0.0.0/4 (Multicast / Reserved)
    if (o0 >= 224) return true;

    return false;
  }

  // IPv6 checks (strip surrounding brackets from URL hostname, e.g. [::1] -> ::1)
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (norm === '::' || norm === '::1') {
    return !allowLoopback;
  }
  // Link-local IPv6 (fe80::/10)
  if (norm.startsWith('fe80:') || norm.startsWith('fe8') || norm.startsWith('fe9') || norm.startsWith('fea') || norm.startsWith('feb')) {
    return true;
  }
  // Unique local addresses (fc00::/7)
  if (norm.startsWith('fc') || norm.startsWith('fd')) {
    return true;
  }
  // IPv4-mapped IPv6 (::ffff:192.168.1.1)
  if (norm.startsWith('::ffff:')) {
    const mapped = norm.replace('::ffff:', '');
    return isPrivateOrReservedIp(mapped, allowLoopback);
  }

  return false;
}

/**
 * Validates a destination URL against SSRF attack classes:
 * - Unsafe protocols (only http: and https: permitted)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal, instance-data)
 * - Loopback and localhost (blocked unless explicitly permitted via allowLoopback)
 * - RFC 1918 private subnets
 * - Link-local subnets
 * - DNS rebinding / hostnames resolving to private IPs
 */
export async function isSafeDestination(
  rawUrl: string,
  options?: UrlSafetyOptions
): Promise<UrlSafetyResult> {
  const allowLoopback = options?.allowLoopback ?? (process.env.ZENITCH_ALLOW_LOOPBACK === 'true' || process.env.ZENITCH_ALLOW_LOOPBACK === '1');

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        safe: false,
        reason: "Unsafe protocol '" + parsed.protocol + "'. Only http: and https: protocols are permitted."
      };
    }

    const host = parsed.hostname.toLowerCase();

    // 1. Block known cloud metadata service hostnames and local names unconditionally
    if (
      host === 'metadata.google.internal' ||
      host === 'metadata' ||
      host === 'instance-data' ||
      host === '169.254.169.254'
    ) {
      return {
        safe: false,
        reason: "Destination host '" + host + "' is blocked for SSRF protection: Cloud instance metadata access is prohibited."
      };
    }

    // 2. Loopback hostnames
    if (!allowLoopback && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))) {
      return {
        safe: false,
        reason: "Destination host '" + host + "' is blocked for SSRF protection: Localhost and local domain access is prohibited."
      };
    }

    // 3. Direct IP literal check
    if (isPrivateOrReservedIp(host, allowLoopback)) {
      return {
        safe: false,
        reason: "Destination IP '" + host + "' is a private, reserved, or link-local address."
      };
    }

    // 4. DNS resolution to prevent DNS rebinding or custom domains pointing to private IPs
    try {
      const addresses = await dns.promises.lookup(host, { all: true });
      for (const addr of addresses) {
        if (isPrivateOrReservedIp(addr.address, allowLoopback)) {
          return {
            safe: false,
            reason: "DNS resolution for '" + host + "' resolved to restricted address '" + addr.address + "'."
          };
        }
      }
    } catch (dnsErr: unknown) {
      // If DNS lookup fails and host is not localhost, reject as unreachable/invalid
      if (!allowLoopback || host !== 'localhost') {
        return {
          safe: false,
          reason: "DNS lookup failed for '" + host + "': " + (dnsErr instanceof Error ? dnsErr.message : String(dnsErr))
        };
      }
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, reason: 'Invalid or malformed URL.' };
  }
}

/**
 * Reads response body with strict byte limit to prevent memory exhaustion / decompression bombs.
 */
export async function readResponseWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES
): Promise<{ content: string; truncated: boolean }> {
  if (!response.body) {
    return { content: '', truncated: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  let bytesRead = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          const excess = bytesRead - maxBytes;
          const allowedBytes = value.byteLength - excess;
          if (allowedBytes > 0) {
            result += decoder.decode(value.subarray(0, allowedBytes), { stream: false });
          }
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        } else {
          result += decoder.decode(value, { stream: true });
        }
      }
    }
  } catch (err: unknown) {
    await reader.cancel().catch(() => {});
    throw err;
  }

  return { content: result, truncated };
}

/**
 * Performs a hardened HTTP GET fetch with SSRF verification, redirect checks, timeout, and response byte caps.
 */
export async function safeFetchHtml(
  initialUrl: string,
  options?: UrlSafetyOptions
): Promise<{ content: string; status: number; ok: boolean; truncated: boolean; error?: string }> {
  let currentUrl = initialUrl;
  let redirects = 0;
  const maxRedirects = options?.maxRedirects ?? 3;
  const timeoutMs = options?.timeoutMs ?? 4000;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  while (redirects <= maxRedirects) {
    const safety = await isSafeDestination(currentUrl, options);
    if (!safety.safe) {
      return {
        content: "<!-- Security warning: Network fetch aborted. " + safety.reason + " -->",
        status: 403,
        ok: false,
        truncated: false,
        error: safety.reason
      };
    }

    try {
      const response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Zenitch-Hardened-Fetcher/1.0' },
        redirect: 'manual'
      });

      // Handle redirects securely by evaluating safety of the new destination
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            content: "<!-- Network fetch failed: Redirect HTTP " + response.status + " missing Location header. -->",
            status: response.status,
            ok: false,
            truncated: false,
            error: 'Missing Location header on redirect'
          };
        }
        redirects++;
        if (redirects > maxRedirects) {
          return {
            content: "<!-- Network fetch aborted: Exceeded maximum allowed redirects (" + maxRedirects + "). -->",
            status: 400,
            ok: false,
            truncated: false,
            error: 'Too many redirects'
          };
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        return {
          content: "<!-- Fetch returned HTTP " + response.status + " -->",
          status: response.status,
          ok: false,
          truncated: false,
          error: "HTTP " + response.status
        };
      }

      // Stream body with byte limit
      const { content, truncated } = await readResponseWithLimit(response, maxBytes);
      return {
        content,
        status: response.status,
        ok: true,
        truncated
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: "<!-- Network fetch unavailable: " + msg + " -->",
        status: 0,
        ok: false,
        truncated: false,
        error: msg
      };
    }
  }

  return {
    content: '<!-- Network fetch aborted: Too many redirects. -->',
    status: 400,
    ok: false,
    truncated: false,
    error: 'Too many redirects'
  };
}
