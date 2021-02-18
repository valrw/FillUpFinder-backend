import axios from "axios";
import PolyLine from "@mapbox/polyline";

const directionsResponse = (req, res) => {
  let startId = req.params.start,
    destinationId = req.params.end;
  let requestUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}&key=${process.env.MAPS_API_KEY}`;
  // send the request to the google maps directions api
  axios
    .get(requestUrl)
    .then((response) => {
      // let points = PolyLine.decode(
      //   response.data.routes[0].overview_polyline.points
      // );

      // get the list of points
      let points = [];
      let legs = response.data.routes[0].legs;

      for (var i = 0; i < legs.length; i++) {
        let steps = legs[i].steps;
        for (var j = 0; j < steps.length; j++) {
          var stepPoints = PolyLine.decode(steps[j].polyline.points);
          points.push(...stepPoints);
        }
      }

      let coords = points.map((point, index) => {
        return {
          latitude: point[0],
          longitude: point[1],
        };
      });

      // calculate total distance and total duration
      let distance = 0;
      let duration = 0;

      for (var i = 0; i < legs.length; i++) {
        distance += legs[i].distance.value;
        duration += legs[i].duration.value;
      }

      let stops;
      let stopsList = [];

      if (req.params.calcOnGas === "true") {
        let mpg = req.params.mpg;
        let fuelCap = req.params.fuelCap;
        let fuelLeft = req.params.fuelLeft;
        let distMiles = distance / 1609.344; // convert from meters to miles

        let initDist = mpg * (fuelLeft - 0.1 * fuelCap); // distance in miles that can be traveled before first stop
        stops = 0;

        if (initDist < distMiles) {
          stops =
            1 + Math.floor((distMiles - initDist) / (mpg * (0.9 * fuelCap)));
        }
      }
      // When there is a set number of stops
      else {
        stops = parseInt(req.params.numStops);
        const longToLat = 53 / 69.172;

        // Calculate where the stops are

        // First get total distance
        let totalDist = 0;
        for (var i = 1; i < coords.length; i++) {
          totalDist += Math.abs(coords[i].latitude - coords[i - 1].latitude);
          totalDist += Math.abs(
            longToLat * (coords[i].longitude - coords[i - 1].longitude)
          );
        }

        let goalDist = totalDist / (stops + 1);
        let currDist = 0;
        for (var i = 1; i < coords.length; i++) {
          currDist += Math.abs(coords[i].latitude - coords[i - 1].latitude);
          currDist += Math.abs(
            longToLat * (coords[i].longitude - coords[i - 1].longitude)
          );
          if (currDist > goalDist) {
            stopsList.push(coords[i]);
            currDist = 0;
          }
        }
      }

      console.log(stopsList);

      let directions = {
        route: coords,
        distance: distance,
        duration: duration,
        stops: stops,
        stopsList: stopsList,
      };

      res.status(200).send(directions);
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
};

// return up to a certain number of fuel stations along a route with prices
const nearestStops = (route, prox, max) => {

}

export default directionsResponse;
