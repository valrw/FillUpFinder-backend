import axios from "axios";
import PolyLine from "@mapbox/polyline";
import haversine from "haversine-distance";
// import GeoPoint from "geopoint";

const searchRadius = 15000;
const metersPerMile = 1609.344;

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
        let steps = legs[0];

        let lastStop = [
          steps[0].start_location.lat,
          steps[0].start_location.lng,
        ];
        let lastStopIndex = { i: 0, k: 0 };
        let pointIndex = 0;

        // keep track of place in polyline
        let i = 0;
        while (i < steps.length) {
          step = steps[i];
          stepDist = step.distance.value;

          let currPoints = PolyLine.decode(step.polyline.points);
          currPoints = currPoints.map((point) => {
            return {
              latitude: point[0],
              longitude: point[1],
            };
          });

          // handle stopping in the middle of a step longer than full tank distance
          // also handle the case where fuel will run out but tank is more than 30% full
          const tankLimit = 0.3;

          let distAfterStop = distSinceStop + stepDist;
          let tankLeft = 1 - distSinceStop / fullTankDist;
          let distCapacity = fullTankDist * metersPerMile;
          if (firstStop) {
            tankLeft = initDist / fullTankDist - distSinceStop / fullTankDist;
            distCapacity = initDist * metersPerMile;
          }

          if (
            (distAfterStop >= distCapacity && tankLeft > tankLimit) ||
            stepDist >= distCapacity ||
            pointIndex != 0
          ) {
            // for accuracy, add distance between all points on the step
            // stepDistLeft tends to be a bit larger than stepDist
            let stepDistLeft = 0;
            let pathDists = [];

            let polyIndex = 0;
            while (stepDistLeft < stepDist && polyIndex < currPoints.length) {
              let startLatLng = currPoints[polyIndex];
              let endLatLng = currPoints[polyIndex + 1];

              stepDistLeft += haversine(startLatLng, endLatLng);
              pathDists.push(haversine(startLatLng, endLatLng));

              polyIndex++;
            }

            // if we are backtracking, set k to backtrack point
            let k = pointIndex;
            pointIndex = 0;
            let backtracked = false;

            // loop path coordinates until the step can be completed without stopping
            while (stepDistLeft >= distCapacity - distSinceStop) {
              distSinceStop += pathDists[k];
              stepDistLeft -= pathDists[k];

              if (distSinceStop >= distCapacity) {
                // should stop before this section of the path, so look for a stop near the beginning of the section
                // find one gas station within 15000 meters (about 9 mi) of this point
                let nearStop = await nearestStops(
                  currPoints[k].latitude,
                  currPoints[k].longitude,
                  searchRadius,
                  1
                );

                if (
                  nearStop[0] != undefined &&
                  nearStop[0].geometry != undefined
                ) {
                  let loc = nearStop[0].geometry.location;
                  let thisStop = {
                    latitude: loc.lat,
                    longitude: loc.lng,
                    name: nearStop[0].name,
                    photos: nearStop[0].photos,
                    vicinity: nearStop[0].vicinity,
                  };

                  if (nearStop[0].opening_hours != undefined) {
                    thisStop["open_now"] = nearStop[0].opening_hours.open_now;
                  }

                  firstStop = false;
                  stopsList.push(thisStop);
                  distSinceStop = pathDists[k];
                  lastStop = [thisStop.latitude, thisStop.longitude];
                  lastStopIndex = { i: i, k: k };
                } else {
                  let backtrackResult = backtrack(
                    steps,
                    i,
                    k,
                    lastStop,
                    lastStopIndex
                  );
                  // if we backtracked past last stop, return error
                  if (backtrackResult == -1) {
                    console.log("ERROR");
                    return "ERROR";
                  }
                  // set i, k, to new point that we backtracked to
                  i = backtrackResult.i;
                  pointIndex = backtrackResult.k;
                  // set distSinceStop to max to ensure we stop at point
                  distSinceStop = distCapacity + 1;

                  // if we backtracked to the end of a step, go to start of next step
                  if (pointIndex == steps[i].points.length - 1) {
                    i++;
                    pointIndex = 0;
                  }
                  backtracked = true;
                  break;
                }
              }
              k++;
            }

            // account for distance traveled since the last stop on this stretch
            if (backtracked) continue;
            let currDists = pathDists.slice(k);
            for (let i = 0; i < currDists; i++) {
              distSinceStop += pathDists[i];
            }
          } else {
            distSinceStop += stepDist;
            if (distSinceStop >= distCapacity) {
              // should stop before reaching this point, so backtrack to the last step
              // find one gas station within 15000 meters (about 9 mi) of the last step
              let nearStop = await nearestStops(
                steps[i - 1].end_location.lat,
                steps[i - 1].end_location.lng,
                searchRadius,
                1
              );

              if (
                nearStop[0] != undefined &&
                nearStop[0].geometry != undefined
              ) {
                let loc = nearStop[0].geometry.location;
                let thisStop = {
                  latitude: loc.lat,
                  longitude: loc.lng,
                  name: nearStop[0].name,
                  photos: nearStop[0].photos,
                  vicinity: nearStop[0].vicinity,
                };

                if (nearStop[0].opening_hours != undefined) {
                  thisStop["open_now"] = nearStop[0].opening_hours.open_now;
                }
                firstStop = false;
                stopsList.push(thisStop);
                lastStop = [thisStop.latitude, thisStop.longitude];
                lastStopIndex = { i: i, k: 0 };
              } else {
                let backtrackResult = backtrack(
                  steps,
                  i,
                  0,
                  lastStop,
                  lastStopIndex
                );
                // if we backtracked past last stop, return error
                if (backtrackResult == -1) {
                  console.log("ERROR");
                  return "ERROR";
                }
                // set i, k, to new point that we backtracked to
                i = backtrackResult.i;
                pointIndex = backtrackResult.k;
                // set distSinceStop to max to ensure we stop at point
                distSinceStop = distCapacity + 1;
                continue;
              }

              distSinceStop = stepDist;
            }
          }
          i++;
        }
      }
      // When there is a set number of stops
      else {
        stops = parseInt(req.params.numStops);
        const longToLat = 53 / 69.172;
        const latToMeters = 110567;

        // Calculate where the stops are

        // First get total distance
        let totalDist = 0;
        for (var i = 1; i < coords.length; i++) {
          totalDist += Math.abs(coords[i].latitude - coords[i - 1].latitude);
          totalDist += Math.abs(
            longToLat * (coords[i].longitude - coords[i - 1].longitude)
          );
        }

        // Find a number of points spread evenly along the route
        let goalDist = totalDist / (stops + 1);
        let currDist = 0;
        let stopSearchList = [];
        for (var i = 1; i < coords.length; i++) {
          currDist += Math.abs(coords[i].latitude - coords[i - 1].latitude);
          currDist += Math.abs(
            longToLat * (coords[i].longitude - coords[i - 1].longitude)
          );
          if (currDist > goalDist) {
            stopSearchList.push(coords[i]);
            currDist = 0;
          }
        }

        // Search for stops near the points that were found
        for (var i = 0; i < stopSearchList.length; i++) {
          let currStop = stopSearchList[i];

          const multIncrementer = 1.5;
          let currMult = 1;
          let nearStop = [];

          while (
            nearStop[0] == undefined &&
            searchRadius * currMult < (goalDist * latToMeters) / 2
          ) {
            nearStop = await nearestStops(
              currStop.latitude,
              currStop.longitude,
              searchRadius * currMult,
              1
            );
            currMult *= multIncrementer;
          }

          if (nearStop[0] != undefined && nearStop[0].geometry != undefined) {
            let loc = nearStop[0].geometry.location;
            let thisStop = {
              latitude: loc.lat,
              longitude: loc.lng,
              name: nearStop[0].name,
              photos: nearStop[0].photos,
              vicinity: nearStop[0].vicinity,
            };

            if (nearStop[0].opening_hours != undefined) {
              thisStop["open_now"] = nearStop[0].opening_hours.open_now;
            }

            stopsList.push(thisStop);
          } else {
            res.status(500).send({ message: "No gas stations found" });
            console.log("No gas stations found");
            return;
          }
        }
      }

      // Search for a new route with the stops included
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

      let zoomBounds = getZoomBounds(response.data.routes[0].bounds);

      let directions = {
        route: coords,
        distance: distance,
        duration: duration,
        stops: stopsList.length,
        stopsList: stopsList,
        zoomBounds: zoomBounds,
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

function getZoomBounds(bounds) {
  const deltaMultiplier = 1.3; // How much to zoom out

  let avgLat = (bounds.northeast.lat + bounds.southwest.lat) / 2;
  let avgLong = (bounds.northeast.lng + bounds.southwest.lng) / 2;

  let latDelta = bounds.northeast.lat - bounds.southwest.lat;
  let lngDelta = bounds.northeast.lng - bounds.southwest.lng;

  // Ok to set both latDelta and lngDelta, since map will use largest one
  return {
    latitude: avgLat,
    longitude: avgLong,
    latitudeDelta: latDelta * deltaMultiplier,
    longitudeDelta: lngDelta * deltaMultiplier,
  };
}

function backtrack(steps, index, stepIndex, lastStop, lastStopIndex) {
  const backDistance = 30000;
  const backtrackLimit = 50000;

  let i = index;
  let backtrack = 0;
  let k = 0;

  // if we are backtracking in the middle of a step, go back through the step
  if (stepIndex != 0) {
    k = stepIndex;
    let points = PolyLine.decode(steps[i].polyline.points);
    let distances = [];
    for (let i = 0; i < points.length - 1; i++) {
      distances.push(haversine(points[i], points[i + 1]));
    }
    while (backtrack < backDistance && k >= 1) {
      k--;
      backtrack += distances[k];
    }
  }

  // backtrack through multiple steps
  while (backtrack < backDistance && i >= 1) {
    i -= 1;
    backtrack += steps[i].distance.value;
    // if the step we just took is large, backtrack through the step
    if (backtrack > backDistance * 1.5) {
      backtrack -= steps[i].distance.value;
      let points = PolyLine.decode(steps[i].polyline.points);
      let distances = [];
      for (let i = 0; i < points.length - 1; i++) {
        distances.push(haversine(points[i], points[i + 1]));
      }
      k = points.length - 1;
      while (backtrack < backDistance) {
        k--;
        backtrack += distances[k];
      }
    }
  }
  // get the point we backtracked to
  let backPointsList = PolyLine.decode(steps[i].polyline.points);
  let backtrackPoint = backPointsList[k];
  // Ensure that the point is not too close to or behind the last stop
  if (
    haversine(lastStop, backtrackPoint) < backtrackLimit ||
    lastStopIndex.i > index ||
    (lastStopIndex.i == index && lastStopIndex.k > stepIndex)
  ) {
    return -1;
  }
  // return index of the point in the steps:points array
  return { i: i, k: k };
}

export default directionsResponse;
