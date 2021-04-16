import axios from "axios";
import PolyLine from "@mapbox/polyline";
import haversine from "haversine-distance";
import isHighway from "./city-highway.js";

const searchRadius = 15000;
const metersPerMile = 1609.344;
const backDistance = 15000;
const backtrackLimit = 20000;

const directionsResponse = async (req, res) => {
  let startId = req.params.start,
    destinationId = req.params.end;
  let requestUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}&key=${process.env.MAPS_API_KEY}`;
  // send the request to the google maps directions api
  axios
    .get(requestUrl)
    .then(async (response) => {
      // get the list of points
      const legs = response.data.routes[0].legs;
      let coords = convertPolyline(legs)[0].coords;

      // calculate total distance and total duration
      let distance = 0;
      let duration = 0;
      let steps = [];

      console.log(`start ${coords[0].latitude}, ${coords[0].longitude}`)
      console.log(`end ${coords[coords.length-1].latitude}, ${coords[coords.length-1].longitude}`)

      for (var i = 0; i < legs.length; i++) {
        distance += legs[i].distance.value;
        duration += legs[i].duration.value;
        steps = steps.concat(legs[i].steps);
      }

      const mpgCity = req.query.mpgCity ? req.query.mpgCity : req.params.mpg;
      const mpgHighway = req.query.mpgHighway ? req.query.mpgHighway : req.params.mpg;

      let stopsList = [];
      let stopsBlacklist = [];
      if (req.params.removedStops != undefined)
        stopsBlacklist = req.params.removedStops.split(",");

      if (req.params.calcOnGas == "true") {
        stopsList = await getStopsOnGas(
          distance,
          steps,
          req.params.mpg,
          mpgCity,
          mpgHighway,
          req.params.fuelCap,
          req.params.fuelLeft,
          nearestStops,
          haversine,
          stopsBlacklist,
          backDistance,
          backtrackLimit
        );
      } else {
        stopsList = await getSetNumberStops(
          coords,
          req.params.numStops,
          stopsBlacklist
        );
      }

      let zoomBounds = getZoomBounds(response.data.routes[0].bounds);
      const directions = await updateRoute(
        startId,
        destinationId,
        stopsList,
        coords,
        distance,
        duration,
        zoomBounds
      );

      res.status(200).send(directions);
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
};

// add stops to route
// returns a JSON object with a new route including the stops
export const getStopsOnGas = async (
  distance,
  steps, // array of JSON objects for each step as returned by Maps API
  mpg,
  mpgCity,
  mpgHighway,
  fuelCap,
  fuelLeft,
  stopsFunction = nearestStops, // for finding stops near a point
  distFunction = haversine,
  stopsBlacklist,
  backDistance,
  backtrackLimit
) => {
  let stopsList = [];

  mpg = mpgHighway; // use mpgHighway as the default...perhaps this is confusing
  const distAdjustCity = mpgHighway / mpgCity;

  const initDist = mpg * (fuelLeft - 0.1 * fuelCap) * metersPerMile; // distance in meters that can be traveled before first stop
  const fullTankDist = mpg * (0.9 * fuelCap) * metersPerMile; // distance in meters that can be traveled with a full tank (stop when 10% left)

  let distSinceStop = 0; // in meters
  let firstStop = true; // meaning we should account for how much gas is left initially
  let step, stepDist;

  // For backtracking
  let prevStop = [steps[0].start_location.lat, steps[0].start_location.lng];
  let prevStopIndex = { i: 0, k: 0 }; // index in directions array of last stop
  let kIndex = 0;

  let i = 0;
  while (i < steps.length) {
    step = steps[i];
    stepDist = step.distance.value ? step.distance.value : step.distance;
    if (!isHighway(step)) { stepDist *= distAdjustCity }; // increase step dist for a city so we can use the same mpg throughout

    let currPoints =
      "polyline" in step ? PolyLine.decode(step.polyline.points) : step.points;
    currPoints = currPoints.map((point) => {
      return {
        latitude: point[0],
        longitude: point[1],
      };
    });

    // handle stopping in the middle of a step longer than full tank distance
    // also handle the case where fuel will run out but tank is more than 30% full
    const tankLimit = 0.3;

    let distCapacity = firstStop ? initDist : fullTankDist;
    let tankLeft = distCapacity / fullTankDist - distSinceStop / fullTankDist;

    if (
      (distSinceStop + stepDist >= distCapacity && tankLeft > tankLimit) ||
      stepDist >= distCapacity ||
      kIndex != 0
    ) {
      // for accuracy, add distance between all points on the step
      // stepDistLeft tends to be a bit larger than stepDist
      let ans = getDistArray(currPoints, distFunction);
      let stepDistLeft = ans.sum * (!isHighway(step) ? distAdjustCity : 1);
      let pathDists = ans.distances.map((dist) => {
        return dist * (!isHighway(step) ? distAdjustCity : 1)
      });

      // if we are backtracking, set k to backtrack point
      let k = kIndex;
      kIndex = 0;
      let backtracked = false;

      // loop path coordinates until the step can be completed without stopping
      while (
        stepDistLeft >= distCapacity - distSinceStop &&
        k < pathDists.length
      ) {
        distSinceStop += pathDists[k];
        stepDistLeft -= pathDists[k];

        if (distSinceStop > distCapacity) {
          // should stop before this section of the path, so look for a stop near the beginning of the section
          // find one gas station within 15000 meters (about 9 mi) of this point
          let nearStop = await stopsFunction(
            currPoints[k].latitude,
            currPoints[k].longitude,
            searchRadius,
            5
          );

          let stopToAdd = nearStop[0];
          let stopIndex = 1;
          while (
            stopToAdd != undefined &&
            stopsBlacklist.includes(stopToAdd.place_id)
          ) {
            stopToAdd = nearStop[stopIndex];
            stopIndex++;
          }

          if (stopToAdd != undefined && stopToAdd.geometry != undefined) {
            var thisStop = getStop(stopToAdd);

            firstStop = false;
            stopsList.push(thisStop);
            distSinceStop = pathDists[k];
            prevStop = [thisStop.latitude, thisStop.longitude];
            prevStopIndex = { i: i, k: k };
          } else {
            let backtrackResult = backtrack(
              steps,
              i,
              k,
              prevStop,
              prevStopIndex,
              backDistance,
              backtrackLimit,
              distFunction
            );
            // if we backtracked past last stop, return error
            if (backtrackResult == -1) {
              console.log("ERROR");
              return "ERROR";
            }
            // set i, k, to new point that we backtracked to
            i = backtrackResult.i;
            kIndex = backtrackResult.k;
            // set distSinceStop to max to ensure we stop at point
            distSinceStop = fullTankDist + 1;

            // if we backtracked to the end of a step, go to start of next step
            let currPoints =
              "polyline" in steps[i]
                ? PolyLine.decode(steps[i].polyline.points)
                : steps[i].points;
            if (kIndex == currPoints.length - 1) {
              i++;
              kIndex = 0;
            }
            backtracked = true;
            break;
          }
        }
        k++;
      }

      // account for distance traveled since the last stop on this stretch
      if (backtracked) continue;
      distSinceStop = 0;
      let currDists = pathDists.slice(k);
      for (let j = 0; j < currDists.length; j++) {
        distSinceStop += pathDists[j];
      }
    } else {
      distSinceStop += stepDist;
      if (distSinceStop > distCapacity) {
        // should stop before reaching this point, so backtrack to the last step
        // find one gas station within 15000 meters (about 9 mi) of the last step
        let nearStop = await stopsFunction(
          steps[i - 1].end_location.lat,
          steps[i - 1].end_location.lng,
          searchRadius,
          5
        );


        let stopToAdd = nearStop[0];
        let stopIndex = 1;
        while (
          stopToAdd != undefined &&
          stopsBlacklist.includes(stopToAdd.place_id)
        ) {
          stopToAdd = nearStop[stopIndex];
          stopIndex++;
        }

        if (stopToAdd != undefined && stopToAdd.geometry != undefined) {
          var thisStop = getStop(stopToAdd);
          firstStop = false;
          stopsList.push(thisStop);
          prevStop = [thisStop.latitude, thisStop.longitude];
          prevStopIndex = { i: i, k: 0 };
        } else {
          let backtrackResult = backtrack(
            steps,
            i,
            0,
            prevStop,
            prevStopIndex,
            backDistance,
            backtrackLimit,
            distFunction
          );
          // if we backtracked past last stop, return error
          if (backtrackResult == -1) {
            console.log("ERROR");
            return "ERROR";
          }
          // set i, k, to new point that we backtracked to
          i = backtrackResult.i;
          kIndex = backtrackResult.k;
          // set distSinceStop to max to ensure we stop at point
          distSinceStop = fullTankDist + 1;
          continue;
        }

        distSinceStop = stepDist;
      }
    }
    i++;
  }

  return stopsList;
};

const getSetNumberStops = async (
  coords, // array of JSON objects for each step as returned by Maps API
  numStops,
  stopsBlacklist,
  stopsFunction = nearestStops,
  distFunction = haversine
) => {
  const stops = parseInt(numStops);
  let stopsList = [];

  // Calculate where the stops are

  // First get total distance
  let totalDist = 0;
  for (var i = 1; i < coords.length; i++) {
    totalDist += distFunction(coords[i], coords[i - 1]);
  }

  // Find a number of points spread evenly along the route
  let goalDist = totalDist / (stops + 1);
  let currDist = 0;
  let stopSearchList = [];
  for (var i = 1; i < coords.length; i++) {
    currDist += distFunction(coords[i], coords[i - 1]);
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
    let stopToAdd = undefined;

    while (stopToAdd == undefined && searchRadius * currMult < goalDist / 2) {
      let nearStop = await stopsFunction(
        currStop.latitude,
        currStop.longitude,
        searchRadius * currMult,
        10
      );

      stopToAdd = nearStop[0];
      let stopIndex = 1;
      while (
        stopToAdd != undefined &&
        stopsBlacklist.includes(stopToAdd.place_id)
      ) {
        stopToAdd = nearStop[stopIndex];
        stopIndex++;
      }
      currMult += multIncrementer;
    }

    if (stopToAdd != undefined && stopToAdd.geometry != undefined) {
      var thisStop = getStop(stopToAdd);

      stopsList.push(thisStop);
    } else {
      console.log("No gas stations found");
      res.status(500).send({ message: "No gas stations found" });
      return;
    }
  }
  return stopsList;
};

// Search for a new route with the stops included
const updateRoute = async (
  startId,
  destinationId,
  stopsList,
  prevCoords,
  prevDist,
  prevDuration,
  prevBounds
) => {
  let finalUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}`;
  if (stopsList.length > 0) finalUrl += "&waypoints=";
  for (var i = 0; i < stopsList.length; i++) {
    let stop = stopsList[i];
    finalUrl += stop.latitude + "," + stop.longitude;
    if (i < stopsList.length - 1) finalUrl += "|";
  }
  finalUrl += `&key=${process.env.MAPS_API_KEY}`;

  let segments = prevCoords;
  let zoomBounds = prevBounds;

  try {
    const response = await axios.get(finalUrl);
    const legs = response.data.routes[0].legs;
    segments = convertPolyline(legs);

    for (var i = 0; i < legs.length; i++) {
      segments[i]["distance"] = legs[i].distance.value;
      segments[i]["duration"] = legs[i].duration.value;
    }

    zoomBounds = getZoomBounds(response.data.routes[0].bounds);
  } catch (error) {
    console.log(error);
  }

  let directions = {
    route: segments,
    stops: stopsList.length,
    stopsList: stopsList,
    zoomBounds: zoomBounds,
  };

  return directions;
};

// return an array of up to a certain number of fuel stations near a point
// fuel station is a JSON object with all of the data Google Maps returns for now
// prox should be in meters
const nearestStops = async (latitude, longitude, prox, max) => {
  const requestUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${prox}&type=gas_station&key=${process.env.MAPS_API_KEY}`;
  try {
    console.log(`Searching at ${latitude} ${longitude} and radius is ${prox}`);
    const response = await axios.get(requestUrl);
    return response.data.results.slice(
      0,
      Math.min(response.data.results.length, max)
    ); // the first [max] results
  } catch (error) {
    //console.log(error);
    console.log(requestUrl);
    return [error];
  }
};

function getStop(nearStop) {
  let loc = nearStop.geometry.location;
  let thisStop = {
    latitude: loc.lat,
    longitude: loc.lng,
    name: nearStop.name,
    photos: nearStop.photos,
    vicinity: nearStop.vicinity,
    placeId: nearStop.place_id,
  };

  if (nearStop.opening_hours != undefined) {
    thisStop["open_now"] = nearStop.opening_hours.open_now;
  }

  if (
    nearStop.rating != undefined &&
    nearStop.user_ratings_total != undefined
  ) {
    thisStop["rating"] = nearStop.rating;
    thisStop["num_ratings"] = nearStop.user_ratings_total;
  }

  return thisStop;
}

// Given a response from google maps, generate a polyline for the route
// consisting of LatLng coordinates
function convertPolyline(legs) {
  let segments = [];

  for (var i = 0; i < legs.length; i++) {
    let points = [];
    let steps = legs[i].steps;
    for (var j = 0; j < steps.length; j++) {
      var stepPoints =
        "polyline" in steps[j]
          ? PolyLine.decode(steps[j].polyline.points)
          : steps[j].points;
      points.push(...stepPoints);
    }

    let coords = points.map((point, index) => {
      return {
        latitude: point[0],
        longitude: point[1],
      };
    });
    var leg = { coords: coords };
    segments.push(leg);
  }

  return segments;
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

function backtrack(
  steps,
  index,
  stepIndex,
  prevStop,
  prevStopIndex,
  backDistance,
  backtrackLimit,
  distFunction = haversine
) {
  // const backDistance = 30000;
  // const backtrackLimit = 50000;

  //console.log("Started backtracking at i:" + index + ", k:" + stepIndex);

  let i = index;
  let backtrack = 0;
  let k = 0;
  let points =
    "polyline" in steps[i]
      ? PolyLine.decode(steps[i].polyline.points)
      : steps[i].points; // used for testing

  // if we are backtracking in the middle of a step, go back through the step
  if (stepIndex != 0) {
    k = stepIndex;

    let newPoints = points.map((point, index) => {
      return {
        latitude: point[0],
        longitude: point[1],
      };
    });
    let distances = getDistArray(newPoints, distFunction).distances;
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
      let gmapsDist = steps[i].distance.value;
      backtrack -= gmapsDist;

      points =
        "polyline" in steps[i]
          ? PolyLine.decode(steps[i].polyline.points)
          : steps[i].points;

      let newPoints = points.map((point, index) => {
        return {
          latitude: point[0],
          longitude: point[1],
        };
      });
      let distances = getDistArray(newPoints, distFunction).distances;

      k = points.length - 1;
      while (backtrack < backDistance) {
        k--;
        backtrack += distances[k];
      }
    }
  }
  // get the point we backtracked to
  let backPointsList =
    "polyline" in steps[i]
      ? PolyLine.decode(steps[i].polyline.points)
      : steps[i].points;
  let backtrackPoint = backPointsList[k];

  // Ensure that the point is not too close to or behind the last stop
  if (
    distFunction(prevStop, backtrackPoint) < backtrackLimit ||
    prevStopIndex.i > i ||
    (prevStopIndex.i == i && prevStopIndex.k > k)
  ) {
    return -1;
  }
  // return index of the point in the steps:points array
  // console.log(
  //   "Backtracked from i:" + index + ",k:" + stepIndex + " to i:" + i + ",k:" + k
  // );
  return { i: i, k: k };
}

function getDistArray(points, distFunction) {
  let distances = [];
  let sum = 0;

  for (let j = 0; j < points.length - 1; j++) {
    let currDist = distFunction(points[j], points[j + 1]);
    sum += currDist;
    distances.push(currDist);
  }

  return { distances: distances, sum: sum };
}

export default directionsResponse;
