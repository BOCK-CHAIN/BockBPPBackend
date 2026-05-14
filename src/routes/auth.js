// src/routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const supabase = require("../config/supabase");
const { requireAuth } = require("../middleware/session");

const router = express.Router();

// POST /auth/register
router.post("/register", async (req, res) => {
  const { email, password, first_name, last_name, dob, gender, hex_id } =
    req.body;

  if (
    !email ||
    !password ||
    !first_name ||
    !last_name ||
    !dob ||
    !gender ||
    !hex_id
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      hex_id,
      email,
      password_hash,
      first_name,
      last_name,
      dob,
      gender,
    })
    .select("id, email, first_name, last_name")
    .single();

  if (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Registration failed" });
  }

  return res.status(201).json({ message: "Registered successfully", user });
});

// POST /auth/login — hex_id + password
router.post("/login", async (req, res) => {
  const { hex_id, password } = req.body;

  if (!hex_id || !password) {
    return res.status(400).json({ error: "Hex ID and password are required" });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, password_hash, first_name, last_name")
    .eq("hex_id", hex_id)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Invalid Hex ID or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid Hex ID or password" });
  }

  const sessionId = crypto.randomBytes(16).toString("hex");

  const { error: sessionError } = await supabase
    .from("sessions")
    .insert({ id: sessionId, user_id: user.id });

  if (sessionError) {
    console.error("Session error:", sessionError);
    return res.status(500).json({ error: "Login failed" });
  }

  return res.status(200).json({
    session_id: sessionId,
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    },
  });
});

// POST /auth/logout
router.post("/logout", async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  if (!sessionId)
    return res.status(400).json({ error: "No session ID provided" });
  await supabase.from("sessions").delete().eq("id", sessionId);
  return res.status(200).json({ message: "Logged out successfully" });
});

// DELETE /auth/account — delete the logged-in user's account
router.delete("/account", requireAuth, async (req, res) => {
  const userId = req.user.id;

  // 1. Delete all sessions for this user
  const { error: sessionError } = await supabase
    .from("sessions")
    .delete()
    .eq("user_id", userId);

  if (sessionError) {
    console.error("Delete sessions error:", sessionError);
    return res.status(500).json({ error: "Failed to delete account" });
  }

  // 2. Delete the user
  const { error: userError } = await supabase
    .from("users")
    .delete()
    .eq("id", userId);

  if (userError) {
    console.error("Delete user error:", userError);
    return res.status(500).json({ error: "Failed to delete account" });
  }

  return res.status(200).json({ message: "Account deleted successfully" });
});

module.exports = router;
