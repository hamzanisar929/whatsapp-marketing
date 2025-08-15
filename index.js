require('dotenv').config()
const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')
const app = express();
const PORT = process.env.PORT;

const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
let socketConnectedUser = new Map();

const routes = require('./src/routes/app')(io , socketConnectedUser);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(routes);

// app.listen( PORT , () => {
//     console.log(`Application is listening at port ${PORT}`)
// })

server.listen(PORT, () => {
    console.log(`App is listening at port: ${PORT}`);
});