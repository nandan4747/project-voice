import e from "express";
import pool from "../db_operations/db.js";
import { encodeCursor, decodeCursor } from "./cursorServices.js";

const uploadSong = async (req, public_url, tags) => {
  const { songName, genre } = req.body;

  const creatorId = req.user.id;

  try {
    const result = await pool.query(
      "INSERT INTO songs (title, genre, song_src, creator_id,tags) VALUES ($1, $2, $3, $4 , $5) RETURNING *",
      [songName, genre, public_url, creatorId, tags],
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
      `SELECT id ,title,likes_count,play_count FROM songs ORDER BY likes_count DESC LIMIT 10`,
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
      `SELECT id, title,likes_count,play_count 
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
      `SELECT id, title,likes_count,play_count 
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
      `select id , title,likes_count,play_count from songs where genre = $1 order by play_count DESC LIMIT 10`,
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
      `SELECT id , title,likes_count,play_count,tags,similarity(title, $1) AS score 
       FROM songs
       WHERE similarity(title, $1) > 0.15
       ORDER BY score DESC 
       LIMIT 10`,
      [searchTerm],
    );

    const songs = result.rows;
    let topMatchTags = [];

    if (songs.length > 0 && songs[0].score > 0.6) {
      topMatchTags = songs[0].tags;
    } else {
      topMatchTags[0] = searchTerm.trim().toLowerCase();
    }
    const similarSongs = await getSongsByTags(topMatchTags, 10);
    songs.push({
      relatedSongs: similarSongs.songs,
      nextCursor: similarSongs.nextCursor,
    });

    return songs;
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
      `SELECT s.id, s.title, ps.added_at,s.likes_count,s.play_count
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
      `SELECT s.id, s.title, ps.added_at,s.likes_count,s.play_count
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

export const getSongsByCreator = async (
  creatorId,
  cursor = null,
  limit = 10,
) => {
  try {
    const params = [parseInt(creatorId)];
    let cursorClause = "";

    if (cursor) {
      const [lastId] = decodeCursor(cursor); // destructure array, grab first element
      cursorClause = `AND id < $2`;
      params.push(parseInt(lastId));
    }

    const query = `
      SELECT id, title, genre, song_src, likes_count, play_count, created_at
      FROM songs
      WHERE creator_id = $1
      ${cursorClause}
      ORDER BY id DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit + 1);

    const result = await pool.query(query, params);
    let songs = result.rows;

    const hasNextPage = songs.length > limit;
    if (hasNextPage) songs = songs.slice(0, limit);

    const nextCursor = hasNextPage
      ? encodeCursor([songs[songs.length - 1].id.toString()]) // pass array
      : null;

    return { songs, nextCursor };
  } catch (error) {
    console.error("Database Error:", error);
    return { dbError: "Something went wrong." };
  }
};

export const getNewReleases = async () => {
  try {
    const result = await pool.query(
      "SELECT id, title,likes_count,play_count, created_at FROM songs ORDER BY created_at DESC, id DESC LIMIT 10",
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
      `SELECT id, title, created_at,likes_count,play_count
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

export const getRecentSongsFromGenre = async (genre) => {
  try {
    const results = await pool.query(
      `SELECT id,title,play_count,likes_count from songs where genre = $1 order by  created_at desc limit 10`,
      [genre],
    );
    const songs = results.rows;
    return { songs };
  } catch (error) {
    console.log("error at getRecentSongsFromGenre", error);
    throw error;
  }
};

export const getSongsWithLowPlayCount = async () => {
  try {
    const results = await pool.query(
      `SELECT id,title,play_count,likes_count from songs order by created_at ,play_count limit 10`,
    );
    return { songs: results.rows };
  } catch (error) {
    console.log("error at getSongsWithLowPlayCount : ", error);
    throw error;
  }
};

export const getSongsByTags = async (tags = [], limit = 10, cursor = null) => {
  try {
    const raw_tags = tags
    const processedTags = raw_tags.flatMap((tag) => tag.split(" "));
    const tags_without_space = tags.map((str) => str.replace(/ /g, ""));
    const finalTags = [...processedTags, ...tags_without_space];

    let queryParams = [finalTags, limit];

    let cursorFilter = "";

    if (cursor) {
      const [lastPlayCount, lastId] = decodeCursor(cursor);
      cursorFilter = `AND (play_count, id) < ($3, $4)`;
      queryParams.push(lastPlayCount, lastId);
    }

    const query = `
      SELECT id, title, play_count, likes_count 
      FROM songs 
      WHERE tags && $1::text[] 
      ${cursorFilter}
      ORDER BY play_count DESC, id DESC 
      LIMIT $2;
    `;

    const result = await pool.query(query, queryParams);
    const songs = result.rows;
    let nextCursor = null;
    if (songs.length > 0) {
      const lastSong = songs[songs.length - 1];
      nextCursor = encodeCursor([lastSong.play_count, lastSong.id]);
    }

    return {
      songs,
      nextCursor,
    };
  } catch (error) {
    console.error("Error at getSongsByTags:", error);
    throw error;
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
