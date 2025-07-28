import "reflect-metadata";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { createServer } from "http";
import router from "./src/routes/app";
import { AppDataSource } from "./src/database/connection/dataSource";
import SocketServer from "./src/app/socket/SocketServer";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.IO server
const socketServer = new SocketServer(server);

// Make socket server globally available
declare global {
  var socketServer: SocketServer;
}
global.socketServer = socketServer;

// Initialize database connection
AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");
  })
  .catch((err) => {
    console.error("Error during Data Source initialization", err);
  });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static('public'));

app.use(router);

server.listen(PORT, () => {
  console.log(`🚀 Application is listening at port ${PORT}`);
  console.log(`🔌 Socket.IO server is ready for real-time connections`);
});
