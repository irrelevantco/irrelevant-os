import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import robotsParser from "robots-parser";

export const RESEARCH_AGENT =
  "iRRELEVANTBot/1.0 (+https://github.com/irrelevantco/irrelevant-os)";
export type Address = { address: string; family: number };
export type WebResult = {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
};
export type Resolver = (hostname: string) => Promise<Address[]>;
export type PublicTransport = (
  url: URL,
  address: Address,
  limit: number,
) => Promise<WebResult>;

export function researchUrl(raw: string) {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    url.href.length > 2048 ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|lan|test|invalid|onion)$/.test(
      url.hostname,
    )
  )
    throw Error(
      "Research requires a public HTTP(S) business domain without credentials or custom ports.",
    );
  if (
    /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com)$/.test(
      url.hostname,
    )
  )
    throw Error(
      "Research leaves social platforms for manual review; protected social content is not crawled.",
    );
  url.hash = "";
  return url;
}
export function publicAddress(value: string) {
  try {
    return ipaddr.process(value).range() === "unicast";
  } catch {
    return false;
  }
}
const pinnedTransport: PublicTransport = (url, address, limit) =>
  new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": RESEARCH_AGENT,
          Accept: "text/html,text/plain;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit)
            request.destroy(
              Error("Research response exceeded its size limit."),
            );
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          clearTimeout(deadline);
          const headers = Object.fromEntries(
            Object.entries(response.headers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(", ") : (value ?? ""),
            ]),
          );
          resolve({
            url: url.href,
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    const deadline = setTimeout(
      () => request.destroy(Error("Research request timed out.")),
      15000,
    );
    request.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end();
  });

export async function publicGet(
  raw: string,
  options: {
    resolver?: Resolver;
    transport?: PublicTransport;
    limit?: number;
    origin?: string;
    allowed?: (url: URL) => boolean;
  } = {},
) {
  const initial = researchUrl(raw);
  let url = initial;
  const allowedHost = new URL(
    options.origin ?? initial.origin,
  ).hostname.replace(/^www\./, "");
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (options.allowed && !options.allowed(url))
      throw Error("Research redirect target is disallowed by robots.");
    if (
      url.hostname.replace(/^www\./, "") !== allowedHost ||
      (initial.protocol === "https:" && url.protocol !== "https:")
    )
      throw Error("Research redirect left the approved business website.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      (
        options.resolver ??
        ((host) => lookup(host, { all: true, verbatim: true }))
      )(url.hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Research DNS lookup timed out.")),
          5000,
        );
      }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw Error(
        "Research blocked a private, reserved or mixed-address domain.",
      );
    const result = await (options.transport ?? pinnedTransport)(
      url,
      addresses[0],
      options.limit ?? 262144,
    );
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.headers.location || redirects === 3)
        throw Error("Research redirect limit exceeded.");
      url = researchUrl(new URL(result.headers.location, url).href);
      continue;
    }
    if (Buffer.byteLength(result.body) > (options.limit ?? 262144))
      throw Error("Research response exceeded its size limit.");
    if (
      result.headers["content-encoding"] &&
      result.headers["content-encoding"] !== "identity"
    )
      throw Error("Research refused an unexpected compressed response.");
    return result;
  }
  throw Error("Research redirect limit exceeded.");
}

export async function websiteReader(
  website: string,
  options: {
    resolver?: Resolver;
    transport?: PublicTransport;
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  const initial = researchUrl(website);
  const robots = await publicGet(new URL("/robots.txt", initial).href, {
    ...options,
    limit: 65536,
  });
  if (![200, 404, 410].includes(robots.status))
    throw Error(
      "Research could not confirm this website's robots policy; use manual research.",
    );
  if (robots.status === 200 && /<html[\s>]/i.test(robots.body))
    throw Error(
      "Research received an ambiguous robots policy; use manual research.",
    );
  const policy = robotsParser(
    robots.url,
    robots.status === 200 ? robots.body : "",
  );
  const delay = Math.max(1, policy.getCrawlDelay("iRRELEVANTBot") ?? 1);
  if (delay > 10)
    throw Error(
      "Research requires manual review because this website requests a longer crawl delay.",
    );
  let requests = 0;
  const canonical = new URL(robots.url).origin;
  return async (raw: string) => {
    const url = researchUrl(raw);
    if (
      url.hostname.replace(/^www\./, "") !==
      initial.hostname.replace(/^www\./, "")
    )
      throw Error("Research cannot leave the business website.");
    const canonicalUrl = new URL(url.pathname + url.search, canonical);
    if (policy.isAllowed(canonicalUrl.href, "iRRELEVANTBot") === false)
      throw Error("Research is disallowed by the website's robots policy.");
    if (++requests > 3)
      throw Error("Research is limited to three public pages per business.");
    await (
      options.wait ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    )(delay * 1000);
    const result = await publicGet(canonicalUrl.href, {
      ...options,
      origin: canonical,
      // A www alias can have a different robots policy. The robots fetch may
      // establish that canonical origin, but page redirects must not silently
      // reuse one origin's permission on another origin.
      allowed: (url) =>
        url.origin === canonical &&
        policy.isAllowed(url.href, "iRRELEVANTBot") !== false,
    });
    if (
      result.status !== 200 ||
      !/text\/(html|plain)|application\/xhtml\+xml/i.test(
        result.headers["content-type"] ?? "",
      )
    )
      throw Error("Research could not read a public HTML page.");
    // A redirect target must also be allowed; no data is retained if it is denied.
    if (policy.isAllowed(result.url, "iRRELEVANTBot") === false)
      throw Error("Research redirect target is disallowed by robots.");
    return result;
  };
}
