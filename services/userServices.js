import pool from "../db_operations/db.js";
import bcrypt from "bcrypt";
import { encodeCursor, decodeCursor } from "./cursorServices.js";

export const signUpUser = async (username, email, password) => {
  try {
    // 1. Check if they already exist (No clones allowed)
    const existing = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $2",
      [email, username],
    );
    if (existing.rows.length > 0)
      return { error: "Username or Email already taken, homie." };

    // 2. Hash the password (10 rounds of salt)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Insert as a 'creator'
    const result = await pool.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING id, username, email, role",
      [username, email, hashedPassword],
    );

    return { user: result.rows[0] };
  } catch (err) {
    console.error(err);
    throw new Error("Database failed during signup.");
  }
};

export const loginUser = async (email, password) => {
  try {
    // 1. Find the user
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) return { error: "Invalid credentials." };

    const user = result.rows[0];

    // 2. Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return { error: "Invalid credentials." };

    // Return everything except the password
    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword };
  } catch (err) {
    console.error(err);
    throw new Error("Database failed during login.");
  }
};

export const createPlayList = async (userId, playListName) => {
  try {
    const id = parseInt(userId);
    await pool.query("insert into playlists(user_id,name)values($1,$2)", [
      id,
      playListName,
    ]);
    return true;
  } catch (err) {
    console.log("database error ", err);
    return false;
  }
};

export const AddSongToPlayList = async (playlistId, songId) => {
  try {
    await pool.query(
      "insert into playlist_songs (song_id,playlist_id)values ($1,$2)",
      [songId, playlistId],
    );
    return true;
  } catch (error) {
    console.log("db error : ", error);
    return false;
  }
};

export const getuserDetails = async (id) => {
  try {
    const details = await pool.query("select * from users where id = $1", [id]);
    if (details.rows.length === 0) {
      return {
        error: "user not found",
      };
    }
    const { password_hash, ...userWithoutPassword } = details.rows[0];

    return {
      user: userWithoutPassword,
    };
  } catch (err) {
    console.log("db error :".err);
    return {
      error: "unable to fetch details",
    };
  }
};

export const getLikedSongsByUserId = async (id, cursor = null, limit = 10) => {
  try {
    const params = [id];
    let cursorClause = "";

    if (cursor) {
      const [lastId] = decodeCursor(cursor);
      cursorClause = `AND l.song_id < $2`;
      params.push(parseInt(lastId));
    }

    const query = `
      SELECT s.id, s.title 
      FROM songs s 
      JOIN liked_songs l ON s.id = l.song_id 
      WHERE l.user_id = $1
      ${cursorClause}
      ORDER BY l.song_id DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit + 1);

    const result = await pool.query(query, params);
    let songs = result.rows;

    const hasNextPage = songs.length > limit;
    if (hasNextPage) songs = songs.slice(0, limit);

    const nextCursor = hasNextPage
      ? encodeCursor([songs[songs.length - 1].id.toString()])
      : null;

    return { songs, nextCursor };
  } catch (err) {
    console.error("DB Error (getLikedSongs):", err);
    return {
      error:
        "Unable to fetch liked songs. The database is playing hard to get.",
    };
  }
};

export const updatePassword = async (userId, oldPassword, newPassword) => {
  try {
    // 1. Get the current user's hash
    const userRes = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );

    if (userRes.rows.length === 0) return { error: "User not found" };

    const user = userRes.rows[0];

    // 2. Verify the old password matches
    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) return { error: "Current password is incorrect" };

    // 3. Hash the NEW password
    const saltRounds = 10;
    const newHash = await bcrypt.hash(newPassword, saltRounds);

    // 4. Update the DB
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newHash,
      userId,
    ]);

    return { success: true };
  } catch (err) {
    console.error("Password Update Error:", err);
    return { error: "Internal server error" };
  }
};

export const deleteUserAccount = async (userId) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [userId],
    );

    if (result.rowCount === 0) {
      return { error: "User already vanished or never existed." };
    }

    return { success: true };
  } catch (err) {
    console.error("Account Deletion Error:", err);
    return { error: "Database refused to let you go. Try again later." };
  }
};
