// src/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const patentsRoutes = require("./routes/patents");
const inventorsRoutes = require("./routes/inventors");
const scholarRoutes = require("./routes/scholar");
const libraryRoutes = require("./routes/library");
const contributionsRoutes = require("./routes/contributions");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-session-id"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "50mb" }));

app.use("/auth", authRoutes);
app.use("/patents", patentsRoutes);
app.use("/inventors", inventorsRoutes);
app.use("/scholar", scholarRoutes);
app.use("/library", libraryRoutes);
app.use("/contributions", contributionsRoutes);

app.get("/", (req, res) => res.json({ status: "BPP API running" }));
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log(`BPP backend running on port ${PORT}`));
