import express from "express";
import axios from "axios";
import API_KEY from "./api-key.js";
import PolyLine from "@mapbox/polyline";

const app = express();

app.get("/api/vehicle/:make/:model/:year", (req, res) => {
  let make = req.params.make.toLowerCase();
  let model = req.params.model.toLowerCase();
  let year = req.params.year.toLowerCase();

  console.log(make, model, year);

  let getIdUrl = `https://fueleconomy.gov/ws/rest/vehicle/menu/options?make=${make}&model=${model}&year=${year}`;

  axios
    .get(getIdUrl)
    .then((response) => {
      console.log(response);

      // not found as entered
      if (!response.data) {
        // look for variations on the model name
        let getModelsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${make}`;
        axios
          .get(getModelsUrl)
          .then((response) => {
            console.log(response);

            // nothing came up for that make + year
            if (!response.data) {
                res.status(404).send({ message: 'Vehicle not found.' });
            } 
            // match(es) found for that make + year
            // return options for "did you mean" based on whether they include the entered model name
            else {
                let options = [];
              // multiple matches
              if (Array.isArray(response.data.menuItem)) {
                for (let i = 0; i < response.data.menuItem.length; i++) {
                  if (
                    response.data.menuItem[i].value
                      .toLowerCase()
                      .includes(model)
                  ) {
                    options.push(response.data.menuItem[i].value);
                  }
                }
              } else {
                // only one match for that make + year
                if (
                  response.data.menuItem.value.toLowerCase().includes(model)
                ) {
                  options.push(response.data.menuItem);
                }
              }

                if (options.length >= 1) {
                    res.status(300).send(options);
                } else {
                    res.status(404).send({ message: 'Vehicle not found.' });
                }

            }
          })
          .catch((error) => {
              console.log(error);
              res.status(500).send(error);
          })

        }

      // search came back successful
      else {
        let id;
        if (Array.isArray(response.data.menuItem)) {
          id = response.data.menuItem[0].value; // whichever is the first match
        } else {
          id = response.data.menuItem.value;
        }

        // use the ID to look up MPG
        let getMPGUrl = `https://fueleconomy.gov/ws/rest/vehicle/${id}`;
        axios
          .get(getMPGUrl)
          .then((response) => {
            console.log(response);
            let mpg = response.data.comb08; // combination city + highway for primary fuel type
            console.log("MPG is " + mpg);
            let fuelCap = 15; // PLACEHOLDER until we can get fuel tank capacity data
            res.status(200).send({
              mpg: mpg,
              fuelCap: fuelCap,
              make: response.data.make,
              model: response.data.model,
              year: response.data.year,
            });
          })
          .catch((error) => {
            res.status(500).send(error);
          });
      }
    })
    .catch((error) => {
      res.status(500).send(error);
    });
});

app.get(
  "/api/directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?",
  (req, res) => {
    let startId = req.params.start,
      destinationId = req.params.end;
    let requestUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=place_id:${startId}&destination=place_id:${destinationId}&key=${API_KEY}`;
    axios
      .get(requestUrl)
      .then((response) => {
        let points = PolyLine.decode(
          response.data.routes[0].overview_polyline.points
        );
        let coords = points.map((point, index) => {
          return {
            latitude: point[0],
            longitude: point[1],
          };
        });

        let distance = 0;
        let duration = 0;

        let legs = response.data.routes[0].legs;
        for (var i = 0; i < legs.length; i++) {
          distance += legs[i].distance.value;
          duration += legs[i].duration.value;
        }

        let stops;
        if (req.params.calcOnGas) {
            let mpg = req.params.mpg;
            let fuelCap = req.params.fuelCap;
            let fuelLeft = req.params.fuelLeft;
            let distMiles = distance / 1609.344; // convert from meters to miles

            let initDist = mpg * (fuelLeft - 0.1 * fuelCap); // distance in miles that can be traveled before first stop
            stops = 0;

            if (initDist < distMiles) {
                stops = 1 + Math.floor((distMiles - initDist) / (mpg * (0.9 * fuelCap)));
            }
        } else {
            // this doesn't actually work right now
            stops = req.params.numStops;
        }

        let directions = {
          route: coords,
          distance: distance,
          duration: duration,
          stops: stops,
        };
        res.status(200).send(directions);
      })
      .catch((error) => {
        console.log(error);
        res.status(500).send(error);
      });
  }
);

const port = process.env.PORT || 9090;
app.listen(port);

console.log("listening on " + port);
