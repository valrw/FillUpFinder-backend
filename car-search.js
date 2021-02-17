import express from "express";
import axios from "axios";

const carResponse = (req, res) => {
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
              res.status(404).send({ message: "Vehicle not found." });
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
                res.status(404).send({ message: "Vehicle not found." });
              }
            }
          })
          .catch((error) => {
            console.log(error);
            res.status(500).send(error);
          });
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
};

export default carResponse;
