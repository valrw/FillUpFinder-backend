import express from "express";
import directionsResponse from "./directions.js";
import carResponse from "./car-search.js";
import updateRoute from "./update-route.js";
import "dotenv/config.js";

// require('dotenv').config();
const app = express();

app.get("/api/vehicle/:make/:model/:year", carResponse);

app.get(
  "/api/directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?/:removedStops?",
  directionsResponse
);

app.get("/api/update/", updateRoute);

const port = process.env.PORT || 9090;
app.listen(port);

console.log("listening on " + port);
