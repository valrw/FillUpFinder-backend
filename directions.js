import axios from "axios";
import PolyLine from "@mapbox/polyline";

const directionsResponse = async (req, res) => {
  let startId = req.params.start,
    destinationId = req.params.end;
  let requestUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}&key=${process.env.MAPS_API_KEY}`;
  // send the request to the google maps directions api
  axios
    .get(requestUrl)
    .then(async (response) => {
      // let points = PolyLine.decode(
      //   response.data.routes[0].overview_polyline.points
      // );

      // get the list of points
      let legs = response.data.routes[0].legs;
      let coords = convertPolyline(legs);

      // calculate total distance and total duration
      let distance = 0;
      let duration = 0;

      for (var i = 0; i < legs.length; i++) {
        distance += legs[i].distance.value;
        duration += legs[i].duration.value;
      }

      let stops;
      let stopsList = [];

      const metersPerMile = 1609.344;

      if (req.params.calcOnGas === "true") {
        const mpg = req.params.mpg;
        const fuelCap = req.params.fuelCap;
        const fuelLeft = req.params.fuelLeft;
        const distMiles = distance / metersPerMile; // convert from meters to miles

        const initDist = mpg * (fuelLeft - 0.1 * fuelCap); // distance in miles that can be traveled before first stop
        const fullTankDist = mpg * (0.9 * fuelCap); // distance in miles that can be traveled with a full tank (stop when 10% left)
        stops = 0;

        if (initDist < distMiles) {
          stops = 1 + Math.floor((distMiles - initDist) / fullTankDist);
        }

        let distSinceStop = 0; // in meters
        let firstStop = true; // meaning we should account for how much gas is left initially
        let step, stepDist;

        for (let i = 0; i < legs[0].steps.length; i++) {
          step = legs[0].steps[i];
          stepDist = step.distance.value;

          // TODO: handle stopping multiple times on one stretch
          // currently assuming the step distance is less than initDist and/or fullTankDist

          distSinceStop += stepDist;
          if (distSinceStop >= initDist * metersPerMile) {
            if (firstStop || distSinceStop >= fullTankDist * metersPerMile) {
              // should stop before reaching this point, so backtrack to the last step
              // find one gas station within 15000 meters (about 9 mi) of the last step
              let nearStop = await nearestStops(
                legs[0].steps[i - 1].end_location.lat,
                legs[0].steps[i - 1].end_location.lng,
                15000,
                1
              );

              if (
                nearStop[0] != undefined &&
                nearStop[0].geometry != undefined
              ) {
                let loc = nearStop[0].geometry.location;
                stopsList.push({ latitude: loc.lat, longitude: loc.lng });
              } else {
                console.log(nearStop[0]); // error?
              }

              distSinceStop = stepDist;
            }
          }
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

      let finalUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}`;
      if (stopsList.length > 0) finalUrl += "&waypoints=";
      for (var i = 0; i < stopsList.length; i++) {
        let stop = stopsList[i];
        finalUrl += stop.latitude + "," + stop.longitude;
        if (i < stopsList.length - 1) finalUrl += "|";
      }
      finalUrl += `&key=${process.env.MAPS_API_KEY}`;

      try {
        const response = await axios.get(finalUrl);

        let legs = response.data.routes[0].legs;
        for (var i = 0; i < legs.length; i++) {
          distance += legs[i].distance.value;
          duration += legs[i].duration.value;
        }

        coords = convertPolyline(legs);
      } catch (error) {
        console.log(error);
      }

      let directions = {
        route: coords,
        distance: distance,
        duration: duration,
        stops: stopsList.length,
        stopsList: stopsList,
      };

      res.status(200).send(directions);
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
};

// return an array of up to a certain number of fuel stations near a point
// fuel station is a JSON object with all of the data Google Maps returns for now
// prox should be in meters
const nearestStops = async (latitude, longitude, prox, max) => {
  const requestUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${prox}&type=gas_station&key=${process.env.MAPS_API_KEY}`;
  try {
    const response = await axios.get(requestUrl);
    return response.data.results.slice(
      0,
      Math.min(response.data.results.length, max)
    ); // the first [max] results
  } catch (error) {
    console.log(error);
    return [error];
  }
  /*  axios
    .get(requestUrl)
    .then((response) => {
     console.log(response.data.results.slice(0, Math.min(response.data.results.length, max)));
      return(response.data.results.slice(0, Math.min(response.data.results.length, max)));
    })
    .catch((error) => {
      console.log(error);
      return([error]);
    }) */
};

// Given a response from google maps, generate a polyline for the route
// consisting of LatLng coordinates
function convertPolyline(legs) {
  let points = [];

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

  return coords;
}

export default directionsResponse;
