import express from "express";
import { uploadSong } from "../services/songServices.js";
import { authenticateToken } from "../authMiddleware.js";
import { signUpCreator } from "../services/creatorServices.js";
import { generateToken } from "../authMiddleware.js";
import { getCreatorDetailsByid } from "../services/creatorServices.js";
import { getSongById,deleteSongFromDb } from "../services/songServices.js";
const router = express.Router();

import { createClient } from "@supabase/supabase-js";
import multer from "multer";

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
const upload = multer({ storage: multer.memoryStorage() });

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
  "/v1/auth/upload",
  authenticateToken,
  isCreator,
  upload.single("songFile"),
  async (req, res) => {
    try {
      const { songName, genre, tags } = req.body;
      const file = req.file;

      if (!file)
        return res
          .status(400)
          .json({ message: "No song file provided, homie." });

      const fileName = `${Date.now()}_${file.originalname.replace(/\s/g, "_")}`;
      const { data, error } = await supabase.storage
        .from("songs")
        .upload(`uploads/${fileName}`, file.buffer, {
          contentType: file.mimetype,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("songs")
        .getPublicUrl(`uploads/${fileName}`);

      const songSrc = urlData.publicUrl;

      let proccessedTags = [];
      if (tags) {
        proccessedTags = tags
          .split(/#+/)
          .map((tag) => tag.trim())
          .filter(Boolean);

        //console.log(proccessedTags);
      }

      const newSong = await uploadSong(req, songSrc, proccessedTags);
      res.status(201).json({
        message: "Song uploaded and live!",
        song: newSong,
      });
    } catch (err) {
      console.error("Upload Route Error:", err);
      res.status(500).json({
        message: "Failed to upload the song. The matrix is glitching.",
        error: err.message,
      });
    }
  },
);

/* deleting songs from supabase and db route */

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
        return res
          .status(404)
          .json({ message: "Song not found. You can't kill what's already dead." });
      }

      if (song.creator_id !== creatorId) {
        return res
          .status(403)
          .json({ message: "Nice try, hacker. You can only delete your own tracks." });
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
  }
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
