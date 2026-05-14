// src/routes/contributions.js
const express = require("express");
const supabase = require("../config/supabase");
const { requireAuth } = require("../middleware/session");

const router = express.Router();

async function fetchContributionsByUserId(userId) {
  const [
    { data: patents, error: patentsErr },
    { data: papers, error: papersErr },
    { data: books, error: booksErr },
  ] = await Promise.all([
    supabase
      .from("patents")
      .select("id, title, status, category, filing_date, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("scholar")
      .select("id, title, status, venue_type, year, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),

    supabase
      .from("library")
      .select("id, title, author, genre, created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (patentsErr) console.error("contributions patents error:", patentsErr);
  if (papersErr) console.error("contributions papers error:", papersErr);
  if (booksErr) console.error("contributions books error:", booksErr);

  return {
    patents: patents ?? [],
    papers: papers ?? [],
    books: books ?? [],
  };
}

// GET /contributions/mine
router.get("/mine", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const contributions = await fetchContributionsByUserId(userId);
  return res.json(contributions);
});

// GET /contributions/user/:userId
router.get("/user/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;
  const contributions = await fetchContributionsByUserId(userId);
  return res.json(contributions);
});

module.exports = router;
