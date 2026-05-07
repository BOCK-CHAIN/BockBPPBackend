const express = require("express");
const supabase = require("../config/supabase");
const { requireAuth } = require("../middleware/session");

const router = express.Router();

// GET /inventors — list all inventors
router.get("/", requireAuth, async (req, res) => {
  const { search } = req.query;

  let query = supabase
    .from("inventors")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (search && search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /inventors error:", error);
    return res.status(500).json({ error: "Failed to fetch inventors" });
  }

  return res.json({ inventors: data });
});

// GET /inventors/:id — inventor detail + all their patents
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const { data: inventor, error } = await supabase
    .from("inventors")
    .select("id, name, created_at")
    .eq("id", id)
    .single();

  if (error || !inventor) {
    return res.status(404).json({ error: "Inventor not found" });
  }

  const { data: links, error: linkErr } = await supabase
    .from("patent_inventors")
    .select(`patents ( id, title, description, file_url, created_at )`)
    .eq("inventor_id", id);

  if (linkErr) {
    console.error("Inventor patents error:", linkErr);
    return res.status(500).json({ error: "Failed to fetch inventor patents" });
  }

  const patents = links.map((l) => l.patents).filter(Boolean);
  return res.json({ inventor, patents });
});

// POST /inventors — any logged-in user can create
router.post("/", requireAuth, async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Inventor name is required" });
  }

  const { data: existing } = await supabase
    .from("inventors")
    .select("id")
    .ilike("name", name.trim())
    .single();

  if (existing) {
    return res
      .status(200)
      .json({ message: "Inventor already exists", inventor: existing });
  }

  const { data: inventor, error } = await supabase
    .from("inventors")
    .insert({ name: name.trim() })
    .select("id, name, created_at")
    .single();

  if (error) {
    console.error("POST /inventors error:", error);
    return res.status(500).json({ error: "Failed to create inventor" });
  }

  return res.status(201).json({ message: "Inventor created", inventor });
});

// PUT /inventors/:id — any logged-in user can update
router.put("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  const { data: inventor, error } = await supabase
    .from("inventors")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id, name, created_at")
    .single();

  if (error) {
    return res.status(404).json({ error: "Inventor not found" });
  }

  return res.json({ message: "Inventor updated", inventor });
});

// DELETE /inventors/:id — any logged-in user can delete
router.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  await supabase.from("patent_inventors").delete().eq("inventor_id", id);

  const { error } = await supabase.from("inventors").delete().eq("id", id);
  if (error) {
    return res.status(500).json({ error: "Failed to delete inventor" });
  }

  return res.json({ message: "Inventor deleted" });
});

module.exports = router;
