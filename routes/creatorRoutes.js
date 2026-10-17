import express from "express";
import {
  insertToPendingSongs,
  confirmSongUploaded,
} from "../services/songServices.js";
import { authenticateToken } from "../authMiddleware.js";
import { signUpCreator } from "../services/creatorServices.js";
import { generateToken } from "../authMiddleware.js";
import { getCreatorDetailsByid } from "../services/creatorServices.js";
import {
  getSongById,
  deleteSongFromDb,
  checkUploadStatus,
} from "../services/songServices.js";
const router = express.Router();

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/flac",
  "audio/webm",
];

import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const isCreator = (req, res, next) => {
  if (req.user.role === "creator") {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Creator only." });
  }
};

router.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const { user, error } = await signUpCreator(username, email, password);
    if (error) return res.status(400).json({ message: error });

    const token = generateToken(user);
    res.status(201).json({ message: "Creator created!", token, user });
  } catch (err) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post(
  "/v1/auth/upload/sign",
  authenticateToken,
  isCreator,
  async (req, res) => {
    try {
      const { fileName, contentType, songName, genre, tags } = req.body;

      if (!fileName || !songName || !ALLOWED_TYPES.includes(contentType)) {
        return res.status(400).json({ message: "Invalid request." });
      }

      const safeName = fileName.replace(/[^\w.\-]/g, "_");
      const path = `uploads/${req.user.id}/${Date.now()}_${safeName}`;

      const { data, error } = await supabase.storage
        .from("songs")
        .createSignedUploadUrl(path);
      if (error) throw error;

      const processedTags = tags
        ? tags
            .split(/#+/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      await insertToPendingSongs({
        path,
        userId: req.user.id,
        songName,
        genre,
        processedTags,
      });

      res.json({ path: data.path, token: data.token });
    } catch (err) {
      console.error("Sign Route Error:", err);
      res.status(500).json({ message: "Could not create upload URL." });
    }
  },
);

router.post("/v1/webhooks/song-uploaded", async (req, res) => {
  if (req.get("x-webhook-secret") !== process.env.WEBHOOK_SECRET) {
    return res.sendStatus(401);
  }

  const { path } = req.body;
  const { success } = await confirmSongUploaded(path, supabase);
  return res.sendStatus(success ? 200 : 500);
});

router.get(
  "/v1/auth/upload/status",
  authenticateToken,
  isCreator,
  async (req, res) => {
    try {
      const { path } = req.query;
      if (
        !path ||
        path.includes("..") ||
        !path.startsWith(`uploads/${req.user.id}/`)
      ) {
        return res.status(403).json({ message: "Invalid path." });
      }
      const result = await checkUploadStatus(req.user.id, path);

      return res.json(result);
    } catch (err) {
      console.error("Status Route Error:", err);
      res.status(500).json({ message: "Could not check status." });
    }
  },
);

router.delete(
  "/v1/auth/song/:id",
  authenticateToken,
  isCreator,
  async (req, res) => {
    try {
      const songId = req.params.id;
      const creatorId = req.user.id;

      const song = await getSongById(songId);

      if (!song) {
        return res.status(404).json({
          message: "Song not found. You can't kill what's already dead.",
        });
      }

      if (song.creator_id !== creatorId) {
        return res.status(403).json({
          message: "Nice try, hacker. You can only delete your own tracks.",
        });
      }

      const urlParts = song.song_src.split("/songs/");
      if (urlParts.length < 2) {
        throw new Error("Malformatted song URL.");
      }
      const storagePath = urlParts[1];

      // 4. Handle the Supabase deletion right here in the controller
      const { error: storageError } = await supabase.storage
        .from("songs")
        .remove([storagePath]);

      if (storageError) {
        console.error("Supabase Deletion Error:", storageError);
        throw storageError;
      }

      await deleteSongFromDb(songId);

      res.status(200).json({
        message: "Song completely scrubbed. It never happened.",
      });
    } catch (err) {
      console.error("Delete Route Error:", err);
      res.status(500).json({
        message: "Failed to delete the song. The matrix is glitching again.",
        error: err.message,
      });
    }
  },
);

router.get("/details", async (req, res) => {
  try {
    const userId = parseInt(req.query.id);
    const { dbRes, error } = await getCreatorDetailsByid(userId);
    if (error) {
      return res.status(404).send(error);
    }
    return res.send(dbRes);
  } catch (err) {
    return res.status(500).send({
      message: "could not read details",
    });
  }
});
export { router as creatorRoutes };
