// src/routes/library.js
const express = require("express");
const supabase = require("../config/supabase");
const { requireAuth, requireOwner } = require("../middleware/session");

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function uploadFile(fileBuffer, mimetype, originalName, folder) {
  const ext = originalName.split(".").pop();
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("bpp-files")
    .upload(fileName, fileBuffer, { contentType: mimetype, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from("bpp-files").getPublicUrl(fileName);
  return data.publicUrl;
}

async function resolveFile(body, field, nameField, mimeField, folder) {
  if (body[field] && body[nameField] && body[mimeField]) {
    const buffer = Buffer.from(body[field], "base64");
    return await uploadFile(buffer, body[mimeField], body[nameField], folder);
  }
  return (
    body[`${folder === "library-covers" ? "cover_url" : "file_url"}`] || null
  );
}

const BOOK_SELECT = `
  id, title, author, genre, description,
  year, language, publisher, pages, isbn,
  cover_url, file_url, created_by, uploaded_by,
  created_at, updated_at,
  uploader:users!library_created_by_fkey ( id, first_name, last_name )
`;

// ─── GET /library — everyone can view ─────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { search, genre, year, language } = req.query;

  let query = supabase
    .from("library")
    .select(BOOK_SELECT)
    .order("created_at", { ascending: false });

  if (search && search.trim()) {
    query = query.or(
      `title.ilike.%${search.trim()}%,author.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`,
    );
  }
  if (genre) query = query.eq("genre", genre);
  if (year) query = query.eq("year", parseInt(year));
  if (language) query = query.eq("language", language);

  const { data, error } = await query;
  if (error) {
    console.error("GET /library error:", error);
    return res.status(500).json({ error: "Failed to fetch books" });
  }
  return res.json({ books: data });
});

// ─── GET /library/similar?genre=&exclude= — for "similar books" section ───────
router.get("/similar", requireAuth, async (req, res) => {
  const { genre, exclude } = req.query;
  if (!genre) return res.json({ books: [] });

  let query = supabase
    .from("library")
    .select(BOOK_SELECT)
    .eq("genre", genre)
    .order("created_at", { ascending: false })
    .limit(8);

  if (exclude) query = query.neq("id", exclude);

  const { data, error } = await query;
  if (error)
    return res.status(500).json({ error: "Failed to fetch similar books" });
  return res.json({ books: data });
});

// ─── GET /library/:id — everyone can view ─────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const { data: book, error } = await supabase
    .from("library")
    .select(BOOK_SELECT)
    .eq("id", req.params.id)
    .single();

  if (error || !book) return res.status(404).json({ error: "Book not found" });
  return res.json({ book });
});

// ─── POST /library — any logged-in user can upload ────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const {
    title,
    author,
    genre,
    description,
    year,
    language,
    publisher,
    pages,
    isbn,
  } = req.body;

  if (!title || !author || !genre) {
    return res
      .status(400)
      .json({ error: "Title, author and genre are required" });
  }

  // Resolve PDF file
  let file_url = null;
  if (req.body.file_base64 && req.body.file_name && req.body.mime_type) {
    try {
      const buffer = Buffer.from(req.body.file_base64, "base64");
      file_url = await uploadFile(
        buffer,
        req.body.mime_type,
        req.body.file_name,
        "library",
      );
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  } else if (req.body.file_url) {
    file_url = req.body.file_url;
  }

  // Resolve cover image
  let cover_url = null;
  if (req.body.cover_base64 && req.body.cover_name && req.body.cover_mime) {
    try {
      const buffer = Buffer.from(req.body.cover_base64, "base64");
      cover_url = await uploadFile(
        buffer,
        req.body.cover_mime,
        req.body.cover_name,
        "library-covers",
      );
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  } else if (req.body.cover_url) {
    cover_url = req.body.cover_url;
  }

  const { data: book, error } = await supabase
    .from("library")
    .insert({
      title,
      author,
      genre,
      description: description || null,
      year: year ? parseInt(year) : null,
      language: language || "English",
      publisher: publisher || null,
      pages: pages ? parseInt(pages) : null,
      isbn: isbn || null,
      file_url,
      cover_url,
      uploaded_by: req.user.id,
      created_by: req.user.id,
    })
    .select(BOOK_SELECT)
    .single();

  if (error) {
    console.error("POST /library error:", error);
    return res.status(500).json({ error: "Failed to upload book" });
  }
  return res.status(201).json({ message: "Book uploaded", book });
});

// ─── PUT /library/:id — only the uploader can edit ────────────────────────────
router.put("/:id", requireAuth, requireOwner("library"), async (req, res) => {
  const { id } = req.params;

  const { data: existing, error: fetchErr } = await supabase
    .from("library")
    .select("id, file_url, cover_url")
    .eq("id", id)
    .single();

  if (fetchErr || !existing)
    return res.status(404).json({ error: "Book not found" });

  const {
    title,
    author,
    genre,
    description,
    year,
    language,
    publisher,
    pages,
    isbn,
  } = req.body;

  // Resolve PDF
  let file_url = existing.file_url;
  if (req.body.file_base64 && req.body.file_name && req.body.mime_type) {
    try {
      const buffer = Buffer.from(req.body.file_base64, "base64");
      file_url = await uploadFile(
        buffer,
        req.body.mime_type,
        req.body.file_name,
        "library",
      );
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Resolve cover
  let cover_url = existing.cover_url;
  if (req.body.cover_base64 && req.body.cover_name && req.body.cover_mime) {
    try {
      const buffer = Buffer.from(req.body.cover_base64, "base64");
      cover_url = await uploadFile(
        buffer,
        req.body.cover_mime,
        req.body.cover_name,
        "library-covers",
      );
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const updates = { file_url, cover_url, updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (author !== undefined) updates.author = author;
  if (genre !== undefined) updates.genre = genre;
  if (description !== undefined) updates.description = description || null;
  if (year !== undefined) updates.year = year ? parseInt(year) : null;
  if (language !== undefined) updates.language = language || "English";
  if (publisher !== undefined) updates.publisher = publisher || null;
  if (pages !== undefined) updates.pages = pages ? parseInt(pages) : null;
  if (isbn !== undefined) updates.isbn = isbn || null;

  const { data: book, error } = await supabase
    .from("library")
    .update(updates)
    .eq("id", id)
    .select(BOOK_SELECT)
    .single();

  if (error) {
    console.error("PUT /library error:", error);
    return res.status(500).json({ error: "Failed to update book" });
  }
  return res.json({ message: "Book updated", book });
});

// ─── DELETE /library/:id — only the uploader can delete ───────────────────────
router.delete(
  "/:id",
  requireAuth,
  requireOwner("library"),
  async (req, res) => {
    const { error } = await supabase
      .from("library")
      .delete()
      .eq("id", req.params.id);
    if (error) {
      console.error("DELETE /library error:", error);
      return res.status(500).json({ error: "Failed to delete book" });
    }
    return res.json({ message: "Book deleted" });
  },
);

module.exports = router;
