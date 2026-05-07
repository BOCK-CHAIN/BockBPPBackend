// src/routes/scholar.js
const express = require("express");
const supabase = require("../config/supabase");
const { requireAuth, requireOwner } = require("../middleware/session");

const router = express.Router();

async function uploadFile(fileBuffer, mimetype, originalName) {
  const ext = originalName.split(".").pop();
  const fileName = `scholar/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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
    return await uploadFile(buffer, body.mime_type, body.file_name);
  }
  return body.file_url || null;
}

function parseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((k) => k.trim()).filter(Boolean);
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const SCHOLAR_SELECT = `
  id, title, abstract, year, status,
  authors, venue, venue_type, volume, issue, pages,
  doi, issn, isbn, keywords,
  institution, department, advisor, degree,
  file_url, created_by, created_at, updated_at,
  references_made:scholar_references!scholar_references_paper_id_fkey (
    cited_paper:scholar!scholar_references_cited_paper_id_fkey ( id, title, year, authors )
  ),
  cited_by:scholar_references!scholar_references_cited_paper_id_fkey (
    citing_paper:scholar!scholar_references_paper_id_fkey ( id, title, year, authors )
  )
`;

// GET /scholar — everyone can view
router.get("/", requireAuth, async (req, res) => {
  const { search, venue_type, year, status } = req.query;

  let query = supabase
    .from("scholar")
    .select(SCHOLAR_SELECT)
    .order("year", { ascending: false })
    .order("created_at", { ascending: false });

  if (search && search.trim()) {
    query = query.or(
      `title.ilike.%${search.trim()}%,abstract.ilike.%${search.trim()}%,venue.ilike.%${search.trim()}%`,
    );
  }
  if (venue_type) query = query.eq("venue_type", venue_type);
  if (year) query = query.eq("year", parseInt(year));
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("GET /scholar error:", error);
    return res.status(500).json({ error: "Failed to fetch papers" });
  }
  return res.json({ papers: data });
});

// GET /scholar/:id — everyone can view
router.get("/:id", requireAuth, async (req, res) => {
  const { data: paper, error } = await supabase
    .from("scholar")
    .select(SCHOLAR_SELECT)
    .eq("id", req.params.id)
    .single();

  if (error || !paper) {
    return res.status(404).json({ error: "Paper not found" });
  }
  return res.json({ paper });
});

// POST /scholar — any logged-in user can create
router.post("/", requireAuth, async (req, res) => {
  const {
    title,
    abstract,
    year,
    status = "Draft",
    authors: rawAuthors,
    venue,
    venue_type,
    volume,
    issue,
    pages,
    doi,
    issn,
    isbn,
    keywords: rawKeywords,
    institution,
    department,
    advisor,
    degree,
    cited_paper_ids = [],
  } = req.body;

  if (!title) return res.status(400).json({ error: "Title is required" });

  const authors = parseArray(rawAuthors);
  if (authors.length === 0) {
    return res.status(400).json({ error: "At least one author is required" });
  }

  let file_url = null;
  try {
    file_url = await resolveFileUrl(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const { data: paper, error } = await supabase
    .from("scholar")
    .insert({
      title,
      abstract: abstract || null,
      year: year ? parseInt(year) : null,
      status,
      authors,
      venue: venue || null,
      venue_type: venue_type || null,
      volume: volume || null,
      issue: issue || null,
      pages: pages || null,
      doi: doi || null,
      issn: issn || null,
      isbn: isbn || null,
      keywords: parseArray(rawKeywords),
      institution: institution || null,
      department: department || null,
      advisor: advisor || null,
      degree: degree || null,
      file_url,
      created_by: req.user.id, // ← track owner
    })
    .select(SCHOLAR_SELECT)
    .single();

  if (error) {
    console.error("POST /scholar error:", error);
    return res.status(500).json({ error: "Failed to create paper" });
  }

  if (cited_paper_ids.length > 0) {
    await supabase.from("scholar_references").insert(
      cited_paper_ids.map((cid) => ({
        paper_id: paper.id,
        cited_paper_id: cid,
      })),
    );
  }

  return res.status(201).json({ message: "Paper created", paper });
});

// PUT /scholar/:id — only the owner can edit
router.put("/:id", requireAuth, requireOwner("scholar"), async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: fetchErr } = await supabase
    .from("scholar")
    .select("id, file_url")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: "Paper not found" });
  }

  const {
    title,
    abstract,
    year,
    status,
    authors: rawAuthors,
    venue,
    venue_type,
    volume,
    issue,
    pages,
    doi,
    issn,
    isbn,
    keywords: rawKeywords,
    institution,
    department,
    advisor,
    degree,
    cited_paper_ids,
  } = req.body;

  let file_url = existing.file_url;
  try {
    const resolved = await resolveFileUrl(req.body);
    if (resolved) file_url = resolved;
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const updates = {};
  if (title !== undefined) updates.title = title;
  if (abstract !== undefined) updates.abstract = abstract || null;
  if (year !== undefined) updates.year = year ? parseInt(year) : null;
  if (status !== undefined) updates.status = status;
  if (rawAuthors !== undefined) updates.authors = parseArray(rawAuthors);
  if (venue !== undefined) updates.venue = venue || null;
  if (venue_type !== undefined) updates.venue_type = venue_type || null;
  if (volume !== undefined) updates.volume = volume || null;
  if (issue !== undefined) updates.issue = issue || null;
  if (pages !== undefined) updates.pages = pages || null;
  if (doi !== undefined) updates.doi = doi || null;
  if (issn !== undefined) updates.issn = issn || null;
  if (isbn !== undefined) updates.isbn = isbn || null;
  if (rawKeywords !== undefined) updates.keywords = parseArray(rawKeywords);
  if (institution !== undefined) updates.institution = institution || null;
  if (department !== undefined) updates.department = department || null;
  if (advisor !== undefined) updates.advisor = advisor || null;
  if (degree !== undefined) updates.degree = degree || null;
  updates.file_url = file_url;

  const { data: paper, error } = await supabase
    .from("scholar")
    .update(updates)
    .eq("id", id)
    .select(SCHOLAR_SELECT)
    .single();

  if (error) {
    console.error("PUT /scholar error:", error);
    return res.status(500).json({ error: "Failed to update paper" });
  }

  if (Array.isArray(cited_paper_ids)) {
    await supabase.from("scholar_references").delete().eq("paper_id", id);
    if (cited_paper_ids.length > 0) {
      await supabase
        .from("scholar_references")
        .insert(
          cited_paper_ids.map((cid) => ({ paper_id: id, cited_paper_id: cid })),
        );
    }
  }

  return res.json({ message: "Paper updated", paper });
});

// DELETE /scholar/:id — only the owner can delete
router.delete(
  "/:id",
  requireAuth,
  requireOwner("scholar"),
  async (req, res) => {
    const { id } = req.params;

    await supabase.from("scholar_references").delete().eq("paper_id", id);
    await supabase.from("scholar_references").delete().eq("cited_paper_id", id);

    const { error } = await supabase.from("scholar").delete().eq("id", id);
    if (error) {
      console.error("DELETE /scholar error:", error);
      return res.status(500).json({ error: "Failed to delete paper" });
    }

    return res.json({ message: "Paper deleted" });
  },
);

// GET /scholar/author/:name
router.get("/author/:name", requireAuth, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { data, error } = await supabase
    .from("scholar")
    .select(SCHOLAR_SELECT)
    .contains("authors", [name])
    .order("year", { ascending: false });

  if (error) {
    return res.status(500).json({ error: "Failed to fetch author papers" });
  }
  return res.json({ author: name, papers: data });
});

module.exports = router;
