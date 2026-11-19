import { load } from "cheerio";
import { createHash } from "node:crypto";
import { websiteReader, type WebResult } from "./public-web";
import { PILLARS } from "../reviews";
import { z } from "zod";

export type ResearchPage = {
  url: string;
  title: string;
  description: string;
  excerpt: string;
  links: { text: string; url: string }[];
  formCount: number;
  noAI: boolean;
  noFollow: boolean;
  observed_at: string;
  content_hash: string;
};
export function extractResearchPage(page: WebResult): ResearchPage {
  const $ = load(page.body);
  const noFollow = /nofollow|none/i.test(
    `${page.headers["x-robots-tag"] ?? ""} ${$('meta[name="robots"]').attr("content") ?? ""}`,
  );
  const noAI = /noai/i.test(
    `${page.headers["x-robots-tag"] ?? ""} ${$('meta[name="robots"]').attr("content") ?? ""}`,
  );
  $("script,style,noscript,svg,iframe,template,header nav,footer nav").remove();
  const links = $("a[href]")
    .toArray()
    .slice(0, 250)
    .flatMap((element) => {
      const href = $(element).attr("href") ?? "";
      try {
        const url = new URL(href, page.url);
        return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol)
          ? [
              {
                text: $(element)
                  .text()
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 160),
                url: url.href.slice(0, 2048),
              },
            ]
          : [];
      } catch {
        return [];
      }
    });
  return {
    url: page.url,
    noFollow,
    title: $("title").first().text().trim().slice(0, 300),
    description:
      $('meta[name="description"]').attr("content")?.slice(0, 1000) ?? "",
    excerpt: $("body").text().replace(/\s+/g, " ").trim().slice(0, 6000),
    links,
    formCount: $("form").length,
    noAI,
    observed_at: new Date().toISOString(),
    content_hash: createHash("sha256").update(page.body).digest("hex"),
  };
}
export function researchReview(pages: ResearchPage[]) {
  const main = pages[0];
  if (!main) throw Error("Research did not capture a public page.");
  const social = pages
    .flatMap((p) => p.links)
    .filter((l) =>
      /^https?:\/\/(www\.)?(facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com)\//i.test(
        l.url,
      ),
    );
  const contact = pages.find(
    (p) =>
      p.formCount ||
      p.links.some((l) =>
        /^(mailto:|tel:)|contact|book|estimate|quote|appointment/i.test(
          l.url + " " + l.text,
        ),
      ),
  );
  return PILLARS.map((pillar) => ({
    pillar,
    observation:
      pillar === "Digital Presence"
        ? `The captured public page has the title “${main.title || "(no title captured)"}”. ${main.description ? `Its description says: “${main.description.slice(0, 700)}”.` : "No meta description was captured in the returned HTML."} This is a static HTML observation; mobile performance, ranking and private analytics were not measured.`
        : pillar === "Social Presence"
          ? social.length
            ? `The captured website links to ${[...new Set(social.map((l) => new URL(l.url).hostname))].join(", ")}. Social profiles were not scraped; current activity, review counts and engagement need manual verification.`
            : "No link to a recognized social platform was captured in the pages checked. This does not establish that the company has no social presence."
          : contact
            ? `The captured page includes ${contact.formCount ? "an HTML form" : "a contact, booking or inquiry link"}. The form was not submitted and no conversion or response rate was measured.`
            : "No contact, booking or inquiry link was captured in the pages checked. Other pages or JavaScript may provide one; verify manually before drawing a conclusion.",
    recommendation:
      pillar === "Digital Presence"
        ? "Review this page on a phone and desktop, confirm the service description, and make the next inquiry step clear where needed."
        : pillar === "Social Presence"
          ? "Manually review the linked or independently found public profiles for current service information and authorized examples of work."
          : "Test the public inquiry path with the business's permission, then discuss any useful booking or follow-up changes with the owner.",
    source_url:
      pillar === "Customer Growth" && contact ? contact.url : main.url,
    verification_status: "unverified" as const,
    confidence: "low" as const,
    last_researched_date: main.observed_at.slice(0, 10),
  }));
}
export async function researchBusiness(
  website: string,
  readerFactory = websiteReader,
) {
  const started = Date.now();
  const read = await readerFactory(website),
    pages = [extractResearchPage(await read(website))];
  const first = pages[0];
  const additional = [
    ...new Set(
      first.links
        .filter((link) => {
          try {
            return (
              new URL(link.url).origin === new URL(first.url).origin &&
              /contact|about|services|booking/i.test(new URL(link.url).pathname)
            );
          } catch {
            return false;
          }
        })
        .map((l) => l.url),
    ),
  ]
    .filter((url) => url !== first.url)
    .slice(0, 2);
  for (const url of first.noFollow ? [] : additional) {
    if (Date.now() - started > 40000) break;
    try {
      pages.push(extractResearchPage(await read(url)));
    } catch {
      /* A denied/failed secondary page is not evidence of a weakness. */
    }
  }
  return {
    provider: "public-web-v1",
    public_contacts: [
      ...new Map(
        pages
          .flatMap((page) =>
            page.links.flatMap((link) => {
              if (!link.url.startsWith("mailto:")) return [];
              try {
                const email = decodeURIComponent(new URL(link.url).pathname)
                  .trim()
                  .toLowerCase();
                return z.email().max(254).safeParse(email).success
                  ? [{ email, source_url: page.url }]
                  : [];
              } catch {
                return [];
              }
            }),
          )
          .map((contact) => [contact.email, contact]),
      ).values(),
    ].slice(0, 5),
    title: "Three-point public-web research",
    points: researchReview(pages),
    suggested_offer:
      "Discuss scope after verifying the review and learning the business's priorities.",
    pages: pages.map((page) => ({
      ...page,
      links: page.links
        .filter((link) =>
          /contact|book|estimate|quote|appointment|facebook|instagram|linkedin|youtube|tiktok/i.test(
            link.url + " " + link.text,
          ),
        )
        .slice(0, 8),
    })),
    warning:
      "Unverified research proposal. Human source verification and owner approval are required. No budget, performance loss, revenue or private analytics are inferred.",
  };
}
