import "reflect-metadata";
import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import router from "./src/routes/app";
import { AppDataSource } from "./src/database/connection/dataSource";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(router);

app.listen(PORT, () => {
  console.log(`Application is listening at port ${PORT}`);
});
