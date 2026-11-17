import { z } from "zod";
export const FREE_CATEGORIES = {
  cleaning: "Cleaning",
  hvac: "HVAC",
  plumber: "Plumbing",
  roofer: "Roofing",
  electrician: "Electrical services",
  gardener: "Landscaping",
  builder: "General contractor",
} as const;
export const US_STATES =
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  );
export const freeDiscoverySchema = z.object({
  provider: z.literal("osm").default("osm"),
  category: z.enum([
    "cleaning",
    "hvac",
    "plumber",
    "roofer",
    "electrician",
    "gardener",
    "builder",
  ]),
  city: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(
      /^[\p{L} .'-]+$/u,
      "Enter a city name, not a contact or street address.",
    ),
  state: z
    .string()
    .refine((value) => US_STATES.includes(value), "Choose a US state."),
  count: z.coerce.number().int().min(1).max(10),
});
