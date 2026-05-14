// src/routes/patents.js
const express = require("express");
const supabase = require("../config/supabase");
const { requireAuth, requireOwner } = require("../middleware/session");

const router = express.Router();

async function uploadFile(
  fileBuffer,
  mimetype,
  originalName,
  folder = "patents",
) {
  const ext = originalName.split(".").pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("bpp-files")
    .upload(fileName, fileBuffer, { contentType: mimetype, upsert: false });
  if (error) throw new Error(`File upload failed: ${error.message}`);
  const { data } = supabase.storage.from("bpp-files").getPublicUrl(fileName);
  return data.publicUrl;
}

async function resolveFileUrl(body) {
  if (body.file_base64 && body.file_name && body.mime_type) {
    const buffer = Buffer.from(body.file_base64, "base64");
    return await uploadFile(buffer, body.mime_type, body.file_name, "patents");
  }
  return body.file_url || null;
}

async function resolveCoverUrl(body) {
  if (body.cover_base64 && body.cover_name && body.cover_mime) {
    const buffer = Buffer.from(body.cover_base64, "base64");
    return await uploadFile(
      buffer,
      body.cover_mime,
      body.cover_name,
      "patents/covers",
    );
  }
  return body.cover_url || null;
}

function parseKeywords(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((k) => k.trim()).filter(Boolean);
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const PATENT_SELECT = `
  id, title, application_number, status,
  filing_date, publication_date, grant_date, validity_date,
  assignee, attorneys,
  abstract, technical_field, background, claims, detailed_description,
  category, keywords, file_url, cover_url, created_by, created_at, updated_at,
  patent_inventors ( inventors ( id, name ) ),
  citations_from:citations!citations_patent_id_fkey (
    cited_patent:patents!citations_cited_patent_id_fkey ( id, title, application_number )
  ),
  cited_by:citations!citations_cited_patent_id_fkey (
    citing_patent:patents!citations_patent_id_fkey ( id, title, application_number )
  )
`;

// GET /patents — everyone can view
router.get("/", requireAuth, async (req, res) => {
  const { search, status, category } = req.query;

  let query = supabase
    .from("patents")
    .select(PATENT_SELECT)
    .order("created_at", { ascending: false });

  if (search && search.trim()) {
    query = query.or(
      `title.ilike.%${search.trim()}%,abstract.ilike.%${search.trim()}%,claims.ilike.%${search.trim()}%,assignee.ilike.%${search.trim()}%`,
    );
  }
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    console.error("GET /patents error:", error);
    return res.status(500).json({ error: "Failed to fetch patents" });
  }
  return res.json({ patents: data });
});

// GET /patents/:id — everyone can view
router.get("/:id", requireAuth, async (req, res) => {
  const { data: patent, error } = await supabase
    .from("patents")
    .select(PATENT_SELECT)
    .eq("id", req.params.id)
    .single();

  if (error || !patent) {
    return res.status(404).json({ error: "Patent not found" });
  }
  return res.json({ patent });
});

// POST /patents — any logged-in user can create
router.post("/", requireAuth, async (req, res) => {
  const {
    title,
    status = "Draft",
    filing_date,
    publication_date,
    grant_date,
    validity_date,
    assignee,
    attorneys,
    abstract,
    technical_field,
    background,
    claims,
    detailed_description,
    category,
    keywords: rawKeywords,
    inventor_ids = [],
    cited_patent_ids = [],
  } = req.body;

  if (!title) return res.status(400).json({ error: "Title is required" });

  let file_url = null;
  let cover_url = null;
  try {
    file_url = await resolveFileUrl(req.body);
    cover_url = await resolveCoverUrl(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data: patent, error } = await supabase
    .from("patents")
    .insert({
      title,
      status,
      filing_date: filing_date || null,
      publication_date: publication_date || null,
      grant_date: grant_date || null,
      validity_date: validity_date || null,
      assignee: assignee || null,
      attorneys: attorneys || null,
      abstract: abstract || null,
      technical_field: technical_field || null,
      background: background || null,
      claims: claims || null,
      detailed_description: detailed_description || null,
      category: category || null,
      keywords: parseKeywords(rawKeywords),
      file_url,
      cover_url,
      created_by: req.user.id,
    })
    .select(PATENT_SELECT)
    .single();

  if (error) {
    console.error("POST /patents error:", error);
    return res.status(500).json({ error: "Failed to create patent" });
  }

  if (inventor_ids.length > 0) {
    await supabase.from("patent_inventors").insert(
      inventor_ids.map((inv_id) => ({
        patent_id: patent.id,
        inventor_id: inv_id,
      })),
    );
  }

  if (cited_patent_ids.length > 0) {
    await supabase.from("citations").insert(
      cited_patent_ids.map((cited_id) => ({
        patent_id: patent.id,
        cited_patent_id: cited_id,
      })),
    );
  }

  return res.status(201).json({ message: "Patent created", patent });
});

// PUT /patents/:id — only the owner can edit
router.put("/:id", requireAuth, requireOwner("patents"), async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: fetchErr } = await supabase
    .from("patents")
    .select("id, file_url, cover_url")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: "Patent not found" });
  }

  const {
    title,
    status,
    filing_date,
    publication_date,
    grant_date,
    validity_date,
    assignee,
    attorneys,
    abstract,
    technical_field,
    background,
    claims,
    detailed_description,
    category,
    keywords: rawKeywords,
    inventor_ids,
    cited_patent_ids,
  } = req.body;

  let file_url = existing.file_url;
  let cover_url = existing.cover_url;
  try {
    const resolvedFile = await resolveFileUrl(req.body);
    if (resolvedFile) file_url = resolvedFile;
    const resolvedCover = await resolveCoverUrl(req.body);
    if (resolvedCover) cover_url = resolvedCover;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (status !== undefined) updates.status = status;
  if (filing_date !== undefined) updates.filing_date = filing_date || null;
  if (publication_date !== undefined)
    updates.publication_date = publication_date || null;
  if (grant_date !== undefined) updates.grant_date = grant_date || null;
  if (validity_date !== undefined)
    updates.validity_date = validity_date || null;
  if (assignee !== undefined) updates.assignee = assignee || null;
  if (attorneys !== undefined) updates.attorneys = attorneys || null;
  if (abstract !== undefined) updates.abstract = abstract || null;
  if (technical_field !== undefined)
    updates.technical_field = technical_field || null;
  if (background !== undefined) updates.background = background || null;
  if (claims !== undefined) updates.claims = claims || null;
  if (detailed_description !== undefined)
    updates.detailed_description = detailed_description || null;
  if (category !== undefined) updates.category = category || null;
  if (rawKeywords !== undefined) updates.keywords = parseKeywords(rawKeywords);
  updates.file_url = file_url;
  updates.cover_url = cover_url;

  const { data: patent, error } = await supabase
    .from("patents")
    .update(updates)
    .eq("id", id)
    .select(PATENT_SELECT)
    .single();

  if (error) {
    console.error("PUT /patents error:", error);
    return res.status(500).json({ error: "Failed to update patent" });
  }

  if (Array.isArray(inventor_ids)) {
    await supabase.from("patent_inventors").delete().eq("patent_id", id);
    if (inventor_ids.length > 0) {
      await supabase.from("patent_inventors").insert(
        inventor_ids.map((inv_id) => ({
          patent_id: id,
          inventor_id: inv_id,
        })),
      );
    }
  }

  if (Array.isArray(cited_patent_ids)) {
    await supabase.from("citations").delete().eq("patent_id", id);
    if (cited_patent_ids.length > 0) {
      await supabase.from("citations").insert(
        cited_patent_ids.map((cited_id) => ({
          patent_id: id,
          cited_patent_id: cited_id,
        })),
      );
    }
  }

  return res.json({ message: "Patent updated", patent });
});

// DELETE /patents/:id — only the owner can delete
router.delete(
  "/:id",
  requireAuth,
  requireOwner("patents"),
  async (req, res) => {
    const { id } = req.params;

    await supabase.from("patent_inventors").delete().eq("patent_id", id);
    await supabase.from("citations").delete().eq("patent_id", id);
    await supabase.from("citations").delete().eq("cited_patent_id", id);

    const { error } = await supabase.from("patents").delete().eq("id", id);
    if (error) {
      console.error("DELETE /patents error:", error);
      return res.status(500).json({ error: "Failed to delete patent" });
    }

    return res.json({ message: "Patent deleted" });
  },
);

module.exports = router;
