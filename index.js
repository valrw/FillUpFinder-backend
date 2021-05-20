import express from "express";
import directionsResponse from "./directions.js";
import customDirections from "./custom-directions.js";
import carResponse from "./car-search.js";
import "dotenv/config.js";

// require('dotenv').config();
const app = express();

app.get("/api/vehicle/:make/:model/:year", carResponse);

app.get(
  "/api/directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?/:removedStops?",
  directionsResponse
);

app.get(
  "/api/custom-directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?/:removedStops?",
  customDirections
)

const port = process.env.PORT || 9090;
app.listen(port);

console.log("listening on " + port);
