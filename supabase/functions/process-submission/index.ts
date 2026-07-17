// Supabase Edge Function: process-submission
//
// Triggered by a Database Webhook on INSERT into `submissions` (see
// SETUP.md for how to wire that up in the dashboard). Gathers the
// submission's link/text/photos, asks Claude (Haiku) to extract a
// structured product record, and writes it into the existing `products`
// table — the same destination the chat-based flow already writes to.
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   SUPABASE_URL              - project URL (also auto-injected by the platform)
//   SUPABASE_SERVICE_ROLE_KEY - service role key (also auto-injected)
//   ANTHROPIC_API_KEY         - Claude API key

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Boilerplate share-sheet lines to strip out before sending text to Claude.
// Add more patterns here as new apps' share sheets show up.
const BOILERPLATE_PATTERNS = [
  /what do you think of this\?\s*found it on \w+!?/gi,
  /check (this |it )?out on \w+!?/gi,
];

function stripBoilerplate(text: string | null): string {
  if (!text) return "";
  let cleaned = text;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

interface SubmissionRecord {
  id: string;
  link: string | null;
  text: string | null;
  name: string | null;
  submitted_by: string | null;
}

interface ExtractedProduct {
  name: string;
  price: number | null;
  store: string | null;
  category: string;
  description: string;
  cover_image_url: string | null;
}

// Best-effort fallback for submissions that arrived as a bare link with no
// uploaded photos (e.g. the Bulk Paste queue, which never writes to
// `submission_images` — see BulkQueuePanel.js). Tries to pull an og:image /
// twitter:image meta tag from the linked page via a plain fetch.
//
// NOTE: this only works for stores that don't gate behind Cloudflare/bot
// challenges (e.g. Amazon, Muji, H&M). Cloudflare-protected retailers
// (IKEA, HomeBox, Pan Home Stores, Home Centre, Noon) return a JS challenge
// page to a plain fetch and will NOT get an image this way — those still
// need Nimble-based scraping, which this edge function can't reach. For
// those stores, either attach a photo via /submit, or Claude backfills
// image_url manually in a chat session the way it already does today.
async function fetchOgImage(link: string | null): Promise<string | null> {
  if (!link) return null;
  try {
    const res = await fetch(link, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    return match ? match[1] : null;
  } catch {
    return null; // Blocked, timed out, or no match — caller falls back to null.
  }
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let submission: SubmissionRecord;
  try {
    const payload = await req.json();
    // Database Webhook payload shape: { type, table, record, schema, old_record }
    submission = payload.record;
    if (!submission?.id) throw new Error("Missing submission record in payload");
  } catch (err) {
    return new Response(JSON.stringify({ error: `Bad payload: ${err.message}` }), { status: 400 });
  }

  try {
    const { data: images, error: imagesError } = await supabase
      .from("submission_images")
      .select("image_url")
      .eq("submission_id", submission.id);
    if (imagesError) throw imagesError;

    let imageUrls = (images || []).map((i) => i.image_url);

    // No uploaded photos (typical for Bulk Paste) — try a best-effort
    // og:image scrape of the link before asking Claude to pick a cover.
    if (imageUrls.length === 0 && submission.link) {
      const ogImage = await fetchOgImage(submission.link);
      if (ogImage) imageUrls = [ogImage];
    }

    if (!submission.link && !submission.text && !submission.name && imageUrls.length === 0) {
      throw new Error("Submission has no link, text, name, or images to work with");
    }

    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("name")
      .order("name");
    if (categoriesError) throw categoriesError;

    const extracted = await extractProductDetails({
      link: submission.link,
      text: stripBoilerplate(submission.text),
      name: submission.name,
      imageUrls,
      existingCategories: (categories || []).map((c) => c.name),
    });

    const finalName = submission.name || extracted.name;
    if (!finalName) {
      throw new Error("Claude could not extract a product name from this submission");
    }

    const categoryId = await resolveCategoryId(supabase, extracted.category);

    const coverImageUrl =
      extracted.cover_image_url && imageUrls.includes(extracted.cover_image_url)
        ? extracted.cover_image_url
        : imageUrls[0] || null;

    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        name: finalName,
        price: extracted.price,
        store: extracted.store,
        product_link: submission.link,
        description: extracted.description,
        category_id: categoryId,
        image_url: coverImageUrl,
        source: "online",
        raw_brief: submission.text,
        claude_notes: extracted.description,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    // Remaining submitted photos (everything but the chosen cover) become
    // the product's gallery.
    const galleryUrls = imageUrls.filter((url) => url !== coverImageUrl);
    if (galleryUrls.length > 0) {
      const { error: galleryError } = await supabase
        .from("product_images")
        .insert(galleryUrls.map((image_url) => ({ product_id: product.id, image_url })));
      if (galleryError) throw galleryError;
    }

    await supabase
      .from("submissions")
      .update({ status: "processed", product_id: product.id, error: null })
      .eq("id", submission.id);

    return new Response(JSON.stringify({ ok: true, product_id: product.id }), { status: 200 });
  } catch (err) {
    console.error("process-submission failed", err);
    await supabase
      .from("submissions")
      .update({ status: "failed", error: String(err.message || err) })
      .eq("id", submission.id);
    return new Response(JSON.stringify({ ok: false, error: String(err.message || err) }), { status: 200 });
  }
});

async function resolveCategoryId(
  supabase: ReturnType<typeof createClient>,
  categoryName: string,
): Promise<string | null> {
  if (!categoryName) return null;

  const { data: existing } = await supabase
    .from("categories")
    .select("id, name")
    .ilike("name", categoryName)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({ name: categoryName })
    .select()
    .single();
  if (error) {
    // Race with another insert of the same category name — fetch instead.
    const { data: retry } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", categoryName)
      .maybeSingle();
    if (retry) return retry.id;
    throw error;
  }
  return created.id;
}

async function extractProductDetails(input: {
  link: string | null;
  text: string;
  name: string | null;
  imageUrls: string[];
  existingCategories: string[];
}): Promise<ExtractedProduct> {
  const contentBlocks: unknown[] = [];

  for (const url of input.imageUrls) {
    contentBlocks.push({ type: "image", source: { type: "url", url } });
  }

  const promptParts = [
    "Extract structured product data from this submission for a personal shopping/price-tracking database.",
    input.name ? `Name (given directly by the user — use this exact value as "name" in your response, do not rephrase it): ${input.name}` : null,
    input.link ? `Link: ${input.link}` : null,
    input.text ? `Description text: ${input.text}` : null,
    input.imageUrls.length > 0
      ? `${input.imageUrls.length} product photo(s) are attached above, in this order: ${input.imageUrls
          .map((u, i) => `[${i}] ${u}`)
          .join(", ")}`
      : null,
    "Ignore generic app share-sheet boilerplate (e.g. 'What do you think of this? Found it on [App]!') — that is noise, not product content.",
    input.existingCategories.length > 0
      ? `Existing categories in the database (reuse one of these if it fits, instead of inventing a near-duplicate): ${input.existingCategories.join(", ")}`
      : "No existing categories yet — pick a sensible, reusable category name.",
    "Respond with ONLY a JSON object, no other text, matching this shape:",
    `{"name": string, "price": number|null, "store": string|null, "category": string, "description": string, "cover_image_url": string|null}`,
    "For cover_image_url, pick the URL (exactly as given above) of whichever attached photo best represents the product as a listing cover image. Use null if no images were attached.",
  ].filter(Boolean);

  contentBlocks.push({ type: "text", text: promptParts.join("\n\n") });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Claude response had no text content");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not find JSON in Claude response: ${textBlock.text}`);

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    name: parsed.name || "",
    price: typeof parsed.price === "number" ? parsed.price : null,
    store: parsed.store || null,
    category: parsed.category || "Uncategorized",
    description: parsed.description || "",
    cover_image_url: parsed.cover_image_url || null,
  };
}
