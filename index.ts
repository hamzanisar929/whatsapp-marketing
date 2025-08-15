import "reflect-metadata";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { AppDataSource } from "./src/database/connection/dataSource";

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Keep track of connected users
const socketConnectedUser = new Map<string, any>();

// Import routes as a function
const routes = require("./src/routes/app")(io, socketConnectedUser);

// Database connection
AppDataSource.initialize()
  .then(() => {
    console.log("✅ Data Source has been initialized!");
  })
  .catch((err) => {
    console.error("❌ Error during Data Source initialization", err);
  });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static("public"));

// Routes
app.use(routes);

// Socket.IO connection events
io.on('connection' ,(socket)=>{

    socket.on('connectUser' , (user)=>{
        let username = user.username;
        let userId = user.id;
        let socketId = socket.id;
        socketConnectedUser.set( userId , { username , socketId} )
        socketConnectedUser.set( socketId , userId);
    })

    socket.on('disconnect' , ()=>{
      
      let userId = socketConnectedUser.get(socket.id);   
      socketConnectedUser.delete(socket.id)
      socketConnectedUser.delete(userId)
      console.log(`user disconnected successfully ${socket.id}`);
    })
    
    console.log(`socket connection connected, connection id:${socket.id}`)
})

server.listen(PORT, () => {
  console.log(`🚀 Application is listening at port ${PORT}`);
  console.log(`🔌 Socket.IO server is ready for real-time connections`);
});
