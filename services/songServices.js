import e from "express";
import pool from "../db_operations/db.js";

const uploadSong = async (req, public_url) => {
  const { songName, genre } = req.body;

  const creatorId = req.user.id;

  try {
    const result = await pool.query(
      "INSERT INTO songs (title, genre, song_src, creator_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [songName, genre, public_url, creatorId],
    );
    return result.rows[0];
  } catch (err) {
    console.error("Database Error:", err);
    throw err;
  }
};

export const getSongDetailsById = async (songId) => {
  try {
    const result = await pool.query(
      `select s.*, u.username as creator_name from songs s join users u on s.creator_id = u.id where s.id =  $1`,
      [songId],
    );
    const song = result.rows[0];
    const { isPlayCountUpdated } = await updatePlayCount(songId);
    if (!isPlayCountUpdated) {
      return {
        dbError: "unable to update song state",
      };
    }
    return {
      song,
    };
  } catch (error) {
    console.log("db error : ", error);
    return {
      dbError: "unable to fetch song",
    };
  }
};

const getMostLikedSongs = async () => {
  try {
    const res = await pool.query(
      `SELECT id ,title FROM songs ORDER BY likes_count DESC LIMIT 10`,
    );
    return res.rows;
  } catch (err) {
    console.error("database error :", err);
    throw err;
  }
};
const getMostPlayedSongs = async () => {
  try {
    const res = await pool.query(
      `SELECT id, title, play_count 
       FROM songs 
       ORDER BY play_count DESC, id DESC 
       LIMIT 10`,
    );
    return res.rows;
  } catch (err) {
    console.error("Database error in getMostPlayedSongs:", err);
    throw err;
  }
};

export const getMostPlayedSongsByBatch = async (lastSongId, lastPlayCount) => {
  try {
    const res = await pool.query(
      `SELECT id, title, play_count 
       FROM songs 
       WHERE (play_count, id) < ($1, $2) 
       ORDER BY play_count DESC, id DESC 
       LIMIT 10`,
      [lastPlayCount, lastSongId],
    );
    return res.rows;
  } catch (err) {
    console.error("Database error in getMostPlayedSongsByBatch:", err);
    throw err;
  }
};

const getMostPlayedSongsByGenre = async (genre) => {
  try {
    const res = await pool.query(
      `select id , title from songs where genre = $1 order by play_count DESC LIMIT 10`,
      [genre],
    );
    return res.rows;
  } catch (err) {
    console.error("database error :", err);
    throw err;
  }
};

const searchSongsByTitle = async (searchTerm) => {
  try {
    const result = await pool.query(
      `SELECT id , title ,similarity(title, $1) AS score 
       FROM songs
       WHERE similarity(title, $1) > 0.15
       ORDER BY score DESC 
       LIMIT 10`,
      [searchTerm],
    );

    return result.rows;
  } catch (err) {
    console.error("Search Error:", err);
    throw err;
  }
};

const getPlayListByUserId = async (userId) => {
  try {
    const user_id = parseInt(userId);
    const row = await pool.query("select * from playlists where user_id = $1", [
      user_id,
    ]);
    return {
      playlists: row.rows,
    };
  } catch (err) {
    console.log("db error : ", err);
    return {
      dbError: "unable to find playlist",
    };
  }
};

export const getPlaylistSongs = async (playlistId) => {
  try {
    const res = await pool.query(
      `SELECT s.id, s.title, ps.added_at
       FROM songs s
       JOIN playlist_songs ps ON s.id = ps.song_id
       WHERE ps.playlist_id = $1
       ORDER BY ps.added_at DESC, s.id DESC
       LIMIT 10`,
      [parseInt(playlistId)],
    );
    return { songs: res.rows };
  } catch (err) {
    console.error("Database error fetching playlist songs:", err);
    return { dbError: "Unable to fetch playlist songs." };
  }
};

export const getPlaylistSongsByBatch = async (
  playlistId,
  lastAddedAt,
  lastSongId,
) => {
  try {
    const res = await pool.query(
      `SELECT s.id, s.title, ps.added_at
       FROM songs s
       JOIN playlist_songs ps ON s.id = ps.song_id
       WHERE ps.playlist_id = $1
         AND (ps.added_at, s.id) < ($2, $3)
       ORDER BY ps.added_at DESC, s.id DESC
       LIMIT 10`,
      [parseInt(playlistId), lastAddedAt, lastSongId],
    );
    return { songs: res.rows };
  } catch (err) {
    console.error("Database error fetching playlist songs batch:", err);
    return { dbError: "Unable to fetch playlist songs." };
  }
};

export const toggleLikeSong = async (userId, songId) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Check if the user already liked this song
    const checkLike = await client.query(
      "SELECT 1 FROM liked_songs WHERE user_id = $1 AND song_id = $2",
      [userId, songId],
    );

    const alreadyLiked = checkLike.rows.length > 0;

    if (alreadyLiked) {
      // 2. If liked: REMOVE the like and DECREMENT the count
      await client.query(
        "DELETE FROM liked_songs WHERE user_id = $1 AND song_id = $2",
        [userId, songId],
      );
      await client.query(
        "UPDATE songs SET likes_count = likes_count - 1 WHERE id = $1",
        [songId],
      );
    } else {
      // 3. If NOT liked: ADD the like and INCREMENT the count
      await client.query(
        "INSERT INTO liked_songs (user_id, song_id) VALUES ($1, $2)",
        [userId, songId],
      );
      await client.query(
        "UPDATE songs SET likes_count = likes_count + 1 WHERE id = $1",
        [songId],
      );
    }

    await client.query("COMMIT"); // Save all changes
    return { success: true, liked: !alreadyLiked };
  } catch (err) {
    await client.query("ROLLBACK"); // Something broke, undo everything!
    console.error("Like Toggle Error:", err);
    throw err;
  } finally {
    client.release();
  }
};

export const checkLikedByUser = async (userId, songId) => {
  try {
    const checkLike = await pool.query(
      "SELECT 1 FROM liked_songs WHERE user_id = $1 AND song_id = $2",
      [userId, songId],
    );
    const alreadyLiked = checkLike.rows.length > 0;
    return {
      alreadyLiked,
    };
  } catch (error) {
    console.log("db error : ", error);
    return {
      alreadyLiked: false,
    };
  }
};

const updatePlayCount = async (songId) => {
  try {
    await pool.query(
      "update songs set play_count = play_count+1 where id = $1 ",
      [songId],
    );
    return {
      isPlayCountUpdated: true,
    };
  } catch (err) {
    console.log("db error : ", err);
    return {
      isPlayCountUpdated: false,
    };
  }
};

export const getSongsByCreator = async (creatorId) => {
  try {
    const result = await pool.query(
      "select * from songs where creator_id = $1",
      [parseInt(creatorId)],
    );
    const songs = result.rows;
    return {
      songs,
    };
  } catch (error) {
    console.log("db error : ", error);
    return {
      dbError: "No songs with this creator",
    };
  }
};

export const getNewReleases = async () => {
  try {
    const result = await pool.query(
      "SELECT id, title, created_at FROM songs ORDER BY created_at DESC, id DESC LIMIT 10",
    );
    return { songs: result.rows };
  } catch (err) {
    console.log("db error : ", err);
    return { dbError: "unable to fetch recent uploads" };
  }
};

export const getNewReleasesByLastSongPlayed = async (lastSongId) => {
  try {
    const result = await pool.query(
      `SELECT id, title, created_at 
       FROM songs 
       WHERE (created_at, id) < (SELECT created_at, id FROM songs WHERE id = $1)
       ORDER BY created_at DESC, id DESC 
       LIMIT 10`,
      [lastSongId],
    );
    return { songs: result.rows };
  } catch (error) {
    console.error("db error:", error);
    return { dbError: "unable to fetch" };
  }
};

export const removeSongFromPlayList = async (songId, playlistId) => {
  try {
    await pool.query(
      `DELETE FROM playlist_songs where playlist_id = $1 and song_id = $2 `,
      [playlistId, songId],
    );
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

export {
  uploadSong,
  getMostLikedSongs,
  getMostPlayedSongs,
  getMostPlayedSongsByGenre,
  searchSongsByTitle,
  getPlayListByUserId,
};
