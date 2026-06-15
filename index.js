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
      "https://voice-music.vercel.app",
      "https://application-voice-mxxx-by8hy2c0d-nandan4747s-projects.vercel.app",
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
    console.log("connected to db");
  } catch (err) {
    console.error(err);
    console.log("table initializing failed or unable to connect with db");
  }
};

const PORT = process.env.PORT || 10000;
const DOMAIN = process.env.SERVER_DOMAIN;
app.listen(PORT, () => {
  console.log(`server is fired : http://${DOMAIN}:${PORT}/`);
});
startServer();
