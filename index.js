import express from "express";
import axios from "axios";
import API_KEY from "./api-key.js";
import PolyLine from "@mapbox/polyline";
import directionsResponse from "./directions.js";
import carResponse from "./car-search.js";

const app = express();

app.get("/api/vehicle/:make/:model/:year", (req, res) => {
  carResponse;
});

app.get(
  "/api/directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?",
  directionsResponse
);

const port = process.env.PORT || 9090;
app.listen(port);

console.log("listening on " + port);
