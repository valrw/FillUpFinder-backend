import {
  steps0,
  steps1,
  steps2,
  steps3,
  testNearestStops,
} from "../testing/testcases.js";
import { pointDistance } from "../testing/tests.js";
import { getStopsOnGas } from "../directions.js";

import chai from 'chai';
chai.should();

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
  try {
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
  } catch (error) {
      console.log(error);
  }
}

describe("Directions", function() {

  it("Should stop before a step where fuel would run out", function(done) {
    directions(steps0)
      .then((stops) => {
        stops.length.should.equal(1);
        stops[0].should.have.property("latitude", 0);
        stops[0].should.have.property("longitude", 16);
        done();
      })
      .catch((err) => {
        done(err);
      })
  })

  it("Should stop during a step longer than the max full tank distance", function(done) {
    directions(steps1)
      .then((stops) => {
        stops.length.should.equal(1);
        stops[0].should.have.property("latitude", 0);
        stops[0].should.have.property("longitude", 18);
        done();
      })
      .catch((err) => {
        done(err);
      })
  })

  it("Should stop during a step where fuel runs out but tank is over 30% at the start", function(done) {
    directions(steps2)
      .then((stops) => {
        stops.length.should.equal(1);
        stops[0].should.have.property("latitude", 0);
        stops[0].should.have.property("longitude", 18);
        done();
      })
      .catch((err) => {
        done(err);
      })
  })

  it("Should backtrack if no stop is immediately found", function(done) {
    directions(steps3)
      .then((stops) => {
        stops.length.should.equal(1);
        stops[0].should.have.property("latitude", 0);
        stops[0].should.have.property("longitude", 16);
        done();
      })
      .catch((err) => {
        done(err);
      })
  })
})
