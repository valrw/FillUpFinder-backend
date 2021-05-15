import axios from "axios";
import PolyLine from "@mapbox/polyline";
import haversine from "haversine-distance";
import { convertPolyline } from "./directions.js";

const updateRoute = async (req, res) => {
  const startLat = req.query.startLat;
  const startLong = req.query.startLong;
  const endId = req.query.end;
  const requestUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLong}&destination=place_id:${endId}&key=${process.env.MAPS_API_KEY}`;

  try {
    const response = await axios.get(requestUrl);
    const legs = response.data.routes[0].legs;
    const coords = convertPolyline(legs)[0].coords;

    res.json({
      coords,
      distance: legs[0].distance.value,
      duration: legs[0].duration.value,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
};

export default updateRoute;
