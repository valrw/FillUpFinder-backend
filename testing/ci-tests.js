import {
  steps0,
  steps1,
  steps2,
  steps3,
  testNearestStops,
} from "./testcases.js";
import { pointDistance } from "./tests.js";
import { getStopsOnGas } from "../directions.js";

async function directions(steps) {
  const metersPerMile = 1609.344;
  const mpg = 20 / metersPerMile; // adjusting for getStopsOnGas function
  const fuelCap = 1;
  const fuelLeft = 1;

  // like convertPolyline
  let coords = [];
  let distance = 0;
  for (var i = 0; i < steps.length; i++) {
    coords.push(...steps[i].points);
    distance += steps[i].distance;
  }

  let stopsList = [];
  // calcOnGas
  stopsList = await getStopsOnGas(
    distance,
    steps,
    mpg,
    fuelCap,
    fuelLeft,
    testNearestStops,
    pointDistance,
    "",
    1
  );
  return stopsList;
}

async function main() {
  console.log("Running first test...");
  const stops0 = await directions(steps0);
  const pass0 =
    stops0.length == 1 && stops0[0].latitude == 0 && stops0[0].longitude == 16
      ? "PASS"
      : "FAIL";
  console.log(
    "Stops at " + stops0[0].latitude + ", " + stops0[0].longitude + ": " + pass0
  );
  console.log("-------------------------");

  console.log("Running second test...");
  const stops1 = await directions(steps1);
  const pass1 =
    stops1.length == 1 && stops1[0].latitude == 0 && stops1[0].longitude == 18
      ? "PASS"
      : "FAIL";
  console.log(
    "Stops at " + stops1[0].latitude + ", " + stops1[0].longitude + ": " + pass1
  );
  console.log("-------------------------");

  console.log("Running third test...");
  const stops2 = await directions(steps2);
  const pass2 =
    stops2.length == 1 && stops2[0].latitude == 0 && stops2[0].longitude == 18
      ? "PASS"
      : "FAIL";
  console.log(
    "Stops at " + stops2[0].latitude + ", " + stops2[0].longitude + ": " + pass2
  );
  console.log("-------------------------");

  console.log("Running fourth test...");
  const stops3 = await directions(steps3);
  const pass3 =
    stops3.length == 1 && stops3[0].latitude == 0 && stops3[0].longitude == 16
      ? "PASS"
      : "FAIL";
  console.log(
    "Stops at " + stops3[0].latitude + ", " + stops3[0].longitude + ": " + pass3
  );
}

main();
