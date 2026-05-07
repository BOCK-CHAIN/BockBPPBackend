// src/middleware/session.js
const supabase = require("../config/supabase");

async function requireAuth(req, res, next) {
  const sessionId = req.headers["x-session-id"];

  if (!sessionId) {
    return res.status(401).json({ error: "Missing session ID" });
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  if (new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: "Session expired" });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, first_name, last_name")
    .eq("id", session.user_id)
    .single();

  if (userError || !user) {
    return res.status(401).json({ error: "User not found" });
  }

  req.user = user;
  next();
}

// Remove `async` here — this is a factory function that returns middleware,
// not middleware itself. Adding async made it return a Promise instead.
function requireOwner(table) {
  return async function (req, res, next) {
    const { id } = req.params;

    const { data: record, error } = await supabase
      .from(table)
      .select("created_by")
      .eq("id", id)
      .single();

    if (error || !record) {
      return res.status(404).json({ error: "Record not found" });
    }

    if (record.created_by !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You can only edit your own records" });
    }

    next();
  };
}

module.exports = { requireAuth, requireOwner };
