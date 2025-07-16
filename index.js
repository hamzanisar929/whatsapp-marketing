require('dotenv').config()
const express = require('express')
const bodyParser = require("body-parser");
const cors = require('cors')
const app = express();
const PORT = process.env.PORT;
const routes = require('./src/routes/app');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(routes);

app.listen( PORT , () => {
    console.log(`Application is listening at port ${PORT}`)
})