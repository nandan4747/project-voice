import express from "express";
import "dotenv/config";
import { creatorRoutes } from "./routes/creatorRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { db_init } from "./db_operations/db_init.js";
import cors from "cors";

const app = express();
app.use(
  cors({
    origin: [
      "https://voicemusic.netlify.app",
      "http://localhost:5173",
      "https://voice-music.vercel.app/",
    ],
    credentials: true,
  }),
);
app.use(express.json());

app.use("/creator", creatorRoutes);
app.use("/user", userRoutes);

app.get("/", (req, res) => {
  res.json({ message: "server is online" });
});

const startServer = async () => {
  try {
    console.log("initializing tables");
    await db_init();
    console.log("table initializing success");
  } catch (err) {
    console.error(err);
    console.log("table initializing failed");
  }
};

const PORT = process.env.PORT || 10000;
const DOMAIN = process.env.SERVER_DOMAIN;
app.listen(PORT, () => {
  console.log(`server is fired : http://${DOMAIN}:${PORT}/`);
});
startServer();
