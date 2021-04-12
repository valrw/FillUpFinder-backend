import { steps1, steps2 } from "./testcases.js";

function main() {
  let steps = steps2;
  setUpSteps(steps);

  let stopsList = [];

  let distSinceStop = 0; // in meters
  let step, stepDist;

  let lastStop = steps[0].points[0];
  let lastStopIndex = { i: 0, k: 0 };
  let pointIndex = 0;

  let i = 0;
  while (i < steps.length) {
    step = steps[i];
    stepDist = step.distance;

    let currPoints = step.points;
    currPoints = currPoints.map((point) => {
      return {
        latitude: point[0],
        longitude: point[1],
      };
    });

    // handle stopping in the middle of a step longer than full tank distance
    // also handle the case where fuel will run out but tank is more than 30% full
    let distCapacity = 7;
    let tankLeft = 1 - distSinceStop / distCapacity;
    const tankLimit = 0.2;

    let distAfterStop = distSinceStop + stepDist;

    // console.log(
    //   "distAfterStop:",
    //   distAfterStop,
    //   "distSinceStop:",
    //   distSinceStop,
    //   "tankLeft:",
    //   tankLeft
    // );
    if (
      (distAfterStop >= distCapacity && tankLeft > tankLimit) ||
      stepDist >= distCapacity ||
      pointIndex != 0
    ) {
      // for indexing future points on this step
      let polyIndex = 0;

      // for accuracy, add distance between all points on the step
      // stepDistLeft tends to be a bit larger than stepDist
      let stepDistLeft = 0;
      let pathDists = [];

      while (stepDistLeft < stepDist && polyIndex < currPoints.length - 1) {
        let startLatLng = currPoints[polyIndex];
        let endLatLng = currPoints[polyIndex + 1];

        stepDistLeft += pointDistance(startLatLng, endLatLng);
        pathDists.push(pointDistance(startLatLng, endLatLng));

        polyIndex++;
      }

      // loop path coordinates until the step can be completed without stopping
      let k = pointIndex;
      pointIndex = 0;
      let backtracked = false;
      while (stepDistLeft >= distCapacity - distSinceStop) {
        // console.log(
        //   "-- DistSinceStop",
        //   distSinceStop,
        //   "currpoint:",
        //   "(" + currPoints[k].latitude + "," + currPoints[k].longitude + ")",
        //   "This dist:",
        //   pathDists[k]
        // );

        distSinceStop += pathDists[k];
        stepDistLeft -= pathDists[k];

        if (distSinceStop >= distCapacity) {
          // should stop before this section of the path, so look for a stop near the beginning of the section
          // find one gas station within 15000 meters (about 9 mi) of this point
          let nearStop = nearestStops(
            currPoints[k].latitude,
            currPoints[k].longitude,
            i
          );
          stopsList.push(nearStop);
          distSinceStop = pathDists[k];

          if (nearStop != undefined) {
            lastStop = nearStop;
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
            i = backtrackResult.i;
            pointIndex = backtrackResult.k;
            distSinceStop = distCapacity + 0.001;
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
        let nearStop = nearestStops(
          steps[i - 1].end.lng,
          steps[i - 1].end.lat,
          i
        );
        stopsList.push(nearStop);

        if (nearStop != undefined) {
          lastStop = nearStop;
          lastStopIndex = { i: i, k: 0 };
        } else {
          let backtrackResult = backtrack(steps, i, 0, lastStop, lastStopIndex);
          // if we backtracked past last stop, return error
          if (backtrackResult == -1) {
            console.log("ERROR");
            return "ERROR";
          }
          i = backtrackResult.i;
          pointIndex = backtrackResult.k;
          distSinceStop = distCapacity + 0.001;
          continue;
        }

        distSinceStop = stepDist;
      }
    }
    i++;
  }
}

export function pointDistance(a, b) {
  let x, y;
  if (a.latitude != undefined) {
    x = a.latitude - b.latitude;
    y = a.longitude - b.longitude;
  } else {
    x = a[1] - b[1];
    y = a[0] - b[0];
  }
  let sq = Math.pow(x, 2) + Math.pow(y, 2);
  return Math.sqrt(sq);
}

function nearestStops(a, b, i) {
  // console.log("* Searching for stop at", a + "," + b);
  if (a == 0 && b == 6) return undefined;
  else return [a, b];
}

function setUpSteps(steps) {
  for (let i = 0; i < steps.length; i++) {
    let currStep = steps[i];
    let lastPoint = currStep.points[currStep.points.length - 1];
    currStep["end"] = { lng: lastPoint[0], lat: lastPoint[1] };
    let distance = 0;
    let points = currStep.points;
    for (let k = 0; k < points.length - 1; k++) {
      let xdif = points[k + 1][0] - points[k][0];
      let ydif = points[k + 1][1] - points[k][1];
      distance += Math.sqrt(Math.pow(xdif, 2) + Math.pow(ydif, 2));
    }
    currStep["distance"] = distance;
  }
}

function backtrack(steps, index, stepIndex, lastStop, lastStopIndex) {
  const backDistance = 3;
  const backtrackLimit = 1.1;

  let i = index;
  let backtrack = 0;
  let k = 0;

  if (stepIndex != 0) {
    k = stepIndex;
    let points = steps[i].points;
    let distances = [];
    for (let i = 0; i < points.length - 1; i++) {
      distances.push(pointDistance(points[i], points[i + 1]));
    }
    while (backtrack < backDistance && k >= 1) {
      k--;
      backtrack += distances[k];
    }
  }

  while (backtrack < backDistance && i >= 1) {
    i -= 1;
    backtrack += steps[i].distance;
    if (backtrack > backDistance * 1.5) {
      backtrack -= steps[i].distance;
      let points = steps[i].points;
      let distances = [];
      for (let i = 0; i < points.length - 1; i++) {
        distances.push(pointDistance(points[i], points[i + 1]));
      }
      k = points.length - 1;
      while (backtrack < backDistance) {
        k--;
        backtrack += distances[k];
      }
    }
  }
  let backtrackPoint = steps[i].points[k];
  if (
    pointDistance(lastStop, backtrackPoint) < backtrackLimit ||
    lastStopIndex.i > index ||
    (lastStopIndex.i == index && lastStopIndex.k > stepIndex)
  ) {
    return -1;
  }
  // console.log("i:", i, "k:", k, "Point:", steps[i].points[k]);
  return { i: i, k: k };
}

main();

// [1,3,6,7]
// [2,3,1]

// 3 bt: 0
// 2 bt: 1
// 1 bt: 4
