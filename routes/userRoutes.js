import express from "express";
import {
  checkLikedByUser,
  getMostLikedSongs,
  getMostPlayedSongs,
  getMostPlayedSongsByBatch,
  getMostPlayedSongsByGenre,
  getNewReleases,
  getNewReleasesByLastSongPlayed,
  getPlayListByUserId,
  getPlaylistSongsByBatch,
  getPlaylistSongs,
  getSongDetailsById,
  getSongsByCreator,
  removeSongFromPlayList,
  searchSongsByTitle,
  toggleLikeSong,
  getRecentSongsFromGenre,
  getSongsWithLowPlayCount,
  getSongsByTags,
} from "../services/songServices.js";
import { encodeCursor, decodeCursor } from "../services/cursorServices.js";
import { getCreatorDetailsByid } from "../services/creatorServices.js";
import { authenticateToken, generateToken } from "../authMiddleware.js";
import {
  AddSongToPlayList,
  createPlayList,
  deleteUserAccount,
  getLikedSongsByUserId,
  getuserDetails,
  updatePassword,
} from "../services/userServices.js";
import { loginUser, signUpUser } from "../services/userServices.js";
import pool from "../db_operations/db.js";
const router = express.Router();

router.get("/play/:id", async (req, res) => {
  const { id } = req.params;
  const songId = parseInt(id);
  const { song, dbError } = await getSongDetailsById(songId);
  if (dbError) {
    return res.status(404).send({
      error: dbError,
    });
  }
  res.send({
    song,
  });
});

router.get("/mostplayed", async (req, res) => {
  const { cursor } = req.query;

  try {
    let songs;

    if (!cursor) {
      songs = await getMostPlayedSongs();
    } else {
      const [lastPlayCount, lastId] = decodeCursor(cursor);
      songs = await getMostPlayedSongsByBatch(
        parseInt(lastId),
        parseInt(lastPlayCount),
      );
    }

    let nextCursor = null;
    if (songs && songs.length === 10) {
      const last = songs[songs.length - 1];
      nextCursor = encodeCursor([last.play_count, last.id]);
    }

    res.send({
      type: "most played songs",
      songs,
      nextCursor,
    });
  } catch (err) {
    console.error("MostPlayed Route error:", err);
    res.status(500).send({ error: "Unable to retrieve songs" });
  }
});

router.get("/mostliked", async (req, res) => {
  try {
    const songs = await getMostLikedSongs();
    res.send({
      type: "most liked songs",
      songs: songs,
    });
  } catch (err) {
    res.status(500).send({
      error: "unable to retrive songs",
    });
  }
});

router.get("/recommendation", async (req, res) => {
  const genre = req.query.genre;
  try {
    const songs = await getMostPlayedSongsByGenre(genre);
    res.send({
      type: `most played songs in ${genre}`,
      songs: songs,
    });
  } catch (err) {
    res.status(500).send({
      error: "unable to retrive songs",
    });
  }
});

router.get("/creatordetails", async (req, res) => {
  const creatorid = parseInt(req.query.id);
  const { dbRes, error } = await getCreatorDetailsByid(creatorid);
  if (error) {
    return res.status(404).send({
      error,
    });
  }
  res.send({
    username: dbRes.username,
  });
});

router.get("/search", async (req, res) => {
  const { title } = req.query;

  if (!title)
    return res.status(400).json({ message: "Search for something, homie." });

  try {
    const results = await searchSongsByTitle(title);
    res.json({
      count: results.length,
      results: results,
    });
  } catch (err) {
    res.status(500).json({ message: "Search engine stalled." });
  }
});

router.get(`/related`, async (req, res) => {
  try {
    const { tags, nextCursor } = req.query;

    if (!tags) return res.status(401).send({ error: "absesnce of tags" });

    const tagsArray = tags.trim().toLowerCase().split(/\s+/);
    const results = await getSongsByTags(tagsArray,10, nextCursor || null);

    res.send({ results: results.songs, nextCursor: results.nextCursor });
  } catch (error) {
    res.status(500).send({
      message: "unable to fetch songs",
    });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send({
      error: "invalid credentilas",
    });
  }
  const { user, error } = await loginUser(email, password);
  if (error) {
    return res.status(400).send({
      error: "invalid credentilas",
    });
  }
  const token = generateToken(user);
  res.send({
    message: `welcome ${user.username}`,
    token,
    user,
  });
});

router.post("/signup", async (req, res) => {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).send({
      error: "some details are missing",
    });
  }

  const { user, error } = await signUpUser(username, email, password);
  if (error) {
    return res.status(400).send(error);
  }
  const token = generateToken(user);
  res.send({
    token,
    user,
    message: "user Signed Up successfully",
  });
});

router.post("/newplaylist", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const playListName = req.body.playListName;

  if (!userId || !playListName) {
    return res.status(400).send({
      error: "invalid user or null playlist name",
    });
  }
  const dbRes = await createPlayList(userId, playListName);
  if (dbRes) {
    return res.send({
      message: `playlist with name ${playListName} created successfully `,
    });
  }
  return res.status(500).send({
    error: "unable to create playlist ",
  });
});
router.post("/playlist/add", authenticateToken, async (req, res) => {
  const { playListId, songId } = req.body;

  const pId = parseInt(playListId);
  const sId = parseInt(songId);

  if (!pId || !sId) {
    return res.status(400).send({
      error: "limited details",
    });
  }

  const dbRes = await AddSongToPlayList(pId, sId);
  if (dbRes) {
    return res.send({
      message: "song added to playlist",
    });
  } else {
    return res.status(400).send({
      error: "unable to add the song to the playlist",
    });
  }
});

router.get("/playlists", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  if (!userId) {
    return res.status(400).send({
      error: "invalid user",
    });
  }
  const { playlists, dbError } = await getPlayListByUserId(userId);
  if (dbError) {
    return res.status(500).send(dbError);
  }
  res.send({ playlists });
});

router.get("/playlist/songs", authenticateToken, async (req, res) => {
  const { playListId, cursor } = req.query;

  if (!playListId) {
    return res.status(400).send({ error: "Invalid playlist" });
  }

  try {
    let songs, dbError;

    if (!cursor) {
      ({ songs, dbError } = await getPlaylistSongs(playListId));
    } else {
      const [lastAddedAt, lastSongId] = decodeCursor(cursor);
      ({ songs, dbError } = await getPlaylistSongsByBatch(
        playListId,
        lastAddedAt,
        parseInt(lastSongId),
      ));
    }

    if (dbError) {
      return res.status(400).send({ error: dbError });
    }

    let nextCursor = null;
    if (songs.length === 10) {
      const last = songs[songs.length - 1];
      nextCursor = encodeCursor([last.added_at.toISOString(), last.id]);
    }

    return res.send({ songs, nextCursor, playListId });
  } catch (err) {
    console.error("Playlist songs route error:", err);
    return res.status(500).send({ error: "Unable to retrieve songs" });
  }
});

router.post("/like/:songId", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { songId } = req.params;

  try {
    const result = await toggleLikeSong(userId, songId);
    res.json({
      message: result.liked
        ? "Song added to your favorites!"
        : "Removed from favorites.",
      isLiked: result.liked,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Could not update your love for this song." });
  }
});

router.get("/likeflag/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const song_id = parseInt(id);
  const { alreadyLiked } = await checkLikedByUser(userId, song_id);
  return res.send({
    alreadyLiked,
  });
});

router.get("/songs/creator", async (req, res) => {
  const { id, cursor } = req.query;
  if (!id) {
    return res.status(400).send({
      error: "invalid creator",
    });
  }
  const { songs, dbError, nextCursor } = await getSongsByCreator(
    id,
    cursor || null,
  );
  if (dbError) {
    return res.status(400).send({
      dbError,
    });
  }
  if (nextCursor) {
    return res.send({
      songs,
      nextCursor,
    });
  }
  res.send({
    songs,
  });
});

router.get("/songs/recent", async (req, res) => {
  const { cursor } = req.query;

  try {
    let result;

    if (!cursor) {
      result = await getNewReleases();
    } else {
      const [lastTimestamp, lastId] = decodeCursor(cursor);
      result = await getNewReleasesByLastSongPlayed(parseInt(lastId));
    }

    if (result.dbError) {
      return res.status(400).send({ error: result.dbError });
    }

    let nextCursor = null;
    if (result.songs && result.songs.length === 10) {
      const last = result.songs[result.songs.length - 1];
      nextCursor = encodeCursor([last.created_at, last.id]);
    }

    res.send({
      songs: result.songs,
      nextCursor,
    });
  } catch (err) {
    console.error("Router error:", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

router.get("/details", authenticateToken, async (req, res) => {
  const userId = parseInt(req.user.id);

  const { user, error } = await getuserDetails(userId);
  if (error) {
    return res.status(400).send({ error });
  }
  res.send(user);
});

router.get("/songs/liked", authenticateToken, async (req, res) => {
  const userId = parseInt(req.user.id);
  const { cursor } = req.query;
  const { songs, error, nextCursor } = await getLikedSongsByUserId(
    userId,
    cursor || null,
  );
  if (error) {
    return res.status(500).send({ error });
  }
  if (nextCursor) {
    return res.send({
      songs,
      nextCursor,
    });
  }
  res.send({
    songs,
  });
});

router.put("/update-password", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Both old and new passwords are required" });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters long" });
  }

  const result = await updatePassword(userId, oldPassword, newPassword);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.send({
    message: "Password updated successfully! Don't forget it this time.",
  });
});

router.delete("/delete-account", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const result = await deleteUserAccount(userId);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.send({ message: "Account deleted. See you in the next life!" });
});

router.delete("/playlist/song", authenticateToken, async (req, res) => {
  const { songId, playListId } = req.query;

  if (!songId || !playListId) {
    return res.status(400).send({ error: "incomplete details" });
  }

  const result = await removeSongFromPlayList(
    parseInt(songId),
    parseInt(playListId),
  );
  return res.send({ success: result });
});

router.get("/songs/recent/genre", async (req, res) => {
  try {
    const { genre } = req.query;
    const songs = await getRecentSongsFromGenre(genre);
    res.send(songs);
  } catch (error) {
    res.status(500).send({
      error: "unable to fetch songs",
    });
  }
});

router.get("/songs/forgottenhits", async (req, res) => {
  try {
    const songs = await getSongsWithLowPlayCount();
    res.send(songs);
  } catch (error) {
    res.status(500).send({
      error: "unable to fecth songs",
    });
  }
});

export { router as userRoutes };
