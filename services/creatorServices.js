import pool from "../db_operations/db.js";
import bcrypt from "bcrypt";

export const signUpCreator = async (username, email, password) => {
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
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'creator') RETURNING id, username, email, role",
      [username, email, hashedPassword],
    );

    return { user: result.rows[0] };
  } catch (err) {
    console.error(err);
    throw new Error("Database failed during signup.");
  }
};

export const loginCreator = async (email, password) => {
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

    // 3. Check if they are actually a creator
    if (user.role !== "creator")
      return { error: "This is a Creator-only login." };

    // Return everything except the password
    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword };
  } catch (err) {
    console.error(err);
    throw new Error("Database failed during login.");
  }
};

export const getCreatorDetailsByid = async (user_id) => {
  try {
    const result = await pool.query("SELECT * FROM users where id = $1", [
      user_id,
    ]);
    if (result.rows.length !== 0) {
      const details = result.rows[0];
      const { password_hash, ...userWithoutPassword } = details;
      return {
        dbRes: userWithoutPassword,
      };
    }
    return {
      error: "creator not found",
    };
  } catch (error) {
    console.error("Database error : ", error);
    throw error;
  }
};
