// Supabase Edge Function: ingest-products
//
// Write endpoint for the scheduled "Shopping DB submissions processor"
// routine. The routine scrapes and extracts product details (it needs
// Nimble for bot-protected retail pages), then POSTs the results here
// instead of writing to Supabase itself, so the unattended run never hits a
// tool-approval prompt. This function owns every database write: category
// lookup/creation, the `products` insert, and the `submissions` status update.
//
// Request body:
//   {
//     "items": [{ "submission_id", "name", "price", "currency", "store",
//                 "category", "description", "image_url" }],
//     "failures": [{ "submission_id", "error" }]
//   }
//
// Idempotent: a submission that is no longer `pending` is skipped, so a
// retried or re-run call cannot create duplicate products.
//
// Auth: deployed with JWT verification on, so callers send the project's
// anon key as `Authorization: Bearer <key>`.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface IngestItem {
  submission_id: string;
  name: string;
  price?: number | null;
  currency?: string | null;
  store?: string | null;
  category?: string | null;
  description?: string | null;
  image_url?: string | null;
}

interface IngestFailure {
  submission_id: string;
  error: string;
}

type Outcome = { submission_id: string; status: "processed" | "failed" | "skipped"; product_id?: string; error?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  let body: { items?: IngestItem[]; failures?: IngestFailure[] };
  try {
    body = await req.json();
  } catch (err) {
    return Response.json({ ok: false, error: `Bad payload: ${err.message}` }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const results: Outcome[] = [];

  for (const item of body.items || []) {
    results.push(await ingestItem(supabase, item));
  }

  for (const failure of body.failures || []) {
    const { data, error } = await supabase
      .from("submissions")
      .update({ status: "failed", error: failure.error })
      .eq("id", failure.submission_id)
      .eq("status", "pending")
      .select("id");
    if (error) {
      results.push({ submission_id: failure.submission_id, status: "failed", error: error.message });
    } else {
      results.push({ submission_id: failure.submission_id, status: data?.length ? "failed" : "skipped" });
    }
  }

  return Response.json({ ok: true, results });
});

async function ingestItem(supabase: ReturnType<typeof createClient>, item: IngestItem): Promise<Outcome> {
  try {
    if (!item.submission_id || !item.name) throw new Error("submission_id and name are required");

    const { data: submission, error: lookupError } = await supabase
      .from("submissions")
      .select("id, link, text, status")
      .eq("id", item.submission_id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!submission) throw new Error("Submission not found");
    if (submission.status !== "pending") return { submission_id: item.submission_id, status: "skipped" };

    const categoryId = await resolveCategoryId(supabase, item.category);

    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        name: item.name,
        price: typeof item.price === "number" ? item.price : null,
        currency: item.currency || null,
        store: item.store || null,
        product_link: submission.link,
        description: item.description || null,
        category_id: categoryId,
        image_url: item.image_url || null,
        source: "online",
        raw_brief: submission.text,
        claude_notes: item.description || null,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from("submissions")
      .update({ status: "processed", product_id: product.id, error: null })
      .eq("id", item.submission_id);
    if (updateError) throw updateError;

    return { submission_id: item.submission_id, status: "processed", product_id: product.id };
  } catch (err) {
    const message = String(err.message || err);
    console.error("ingest-products failed", item.submission_id, message);
    return { submission_id: item.submission_id, status: "failed", error: message };
  }
}

async function resolveCategoryId(
  supabase: ReturnType<typeof createClient>,
  categoryName: string | null | undefined,
): Promise<string | null> {
  if (!categoryName) return null;

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .ilike("name", categoryName)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("categories")
    .insert({ name: categoryName })
    .select("id")
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
