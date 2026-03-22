import express from "express";
import {
  checkLikedByUser,
  getMostLikedSongs,
  getMostPlayedSongs,
  getMostPlayedSongsByGenre,
  getNewReleases,
  getPlayListByUserId,
  getPlaylistWithSongs,
  getSongDetailsById,
  getSongsByCreator,
  searchSongsByTitle,
  toggleLikeSong,
} from "../services/songServices.js";
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
  try {
    const songs = await getMostPlayedSongs();
    res.send({
      type: "most played songs",
      songs: songs,
    });
  } catch (err) {
    res.status(500).send({
      error: "unable to retrive songs",
    });
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
  const playListId = req.query.playListId;
  if (!playListId) {
    return res.status(400).send({
      error: "invalid playlist ",
    });
  }
  const { songs, dbError } = await getPlaylistWithSongs(playListId);
  if (dbError) {
    return res.status(400).send({
      error: dbError,
    });
  }
  return res.send({ songs, song_count: songs.length });
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

router.get("/songs/creator/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).send({
      error: "invalid creator",
    });
  }
  const { songs, dbError } = await getSongsByCreator(id);
  if (dbError) {
    return res.status(400).send({
      dbError,
    });
  }
  res.send({
    songs,
  });
});

router.get("/songs/recent", async (req, res) => {
  const { songs, dbError } = await getNewReleases();
  if (dbError) {
    return res.status(400).send({
      error: dbError,
    });
  }
  res.send({
    songs,
  });
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
  const { songs, error } = await getLikedSongsByUserId(userId);
  if (error) {
    return res.status(500).send({ error });
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

export { router as userRoutes };
