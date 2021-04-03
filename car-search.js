import express from "express";
import axios from "axios";

const carResponse = (req, res) => {
  let make = req.params.make;
  let model = req.params.model.toLowerCase();
  let year = req.params.year;

  console.log(make, model, year);

  // correct some mismatches in makes between APIs
  let searchMake = make;
  if (make == "alpina") {
    searchMake = "BMW Alpina";
  }
  else if (make == "avanti") {
    searchMake = "Avanti Motor Corporation";
  }
  else if (make == "bitter") {
    searchMake = "Bitter Gmbh and Co. Kg";
  }
  else if (make == "mclaren") {
    searchMake = "McLaren Automotive";
  }
  else if (make == "tvr") {
    searchMake = "TVR Engineering Ltd";
  }

  // look for model names contianing the input
  const getModelsUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${searchMake}`;

  axios
    .get(getModelsUrl)
    .then((response) => {
      // nothing came up for that make + year
      if (!response.data) {
        res.status(404).send({ message: "Vehicle not found." });
      }
      // match(es) found for that make + year
      // return options that match the autocompleted CarQuery data
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
            options.push(response.data.menuItem.value);
          }
        }

        if (options.length >= 1) {
          // get fuel capacity data (the same for all of them)
          const litersPerGallon = 3.7854;
          let fuelCap = 15; // default value
          axios
          .get(`https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${make}&model=${model}&year=${year}`)
          .then(async (response) => {
            fuelCap = response.data.Trims[0].model_fuel_cap_l;
            if (fuelCap != null) {
              fuelCap = parseFloat(fuelCap);
              // sometimes it actually comes back in gallons instead of liters
              if (fuelCap >= 30) { fuelCap /= litersPerGallon; } // a reasonable size in liters
            }

            let optionsData = [];
            for (let i = 0; i < options.length; i++) {
              try {
                const idResponse = await axios.get(`https://fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${searchMake}&model=${options[i]}`);
                let id;
                console.log(idResponse);
                if (Array.isArray(idResponse.data.menuItem)) {
                  id = idResponse.data.menuItem[0].value; // whichever is the first match
                } else {
                  id = idResponse.data.menuItem.value;
                }

                try {
                  const mpgResponse = await axios.get(`https://fueleconomy.gov/ws/rest/vehicle/${id}`);
                  let mpg = mpgResponse.data.comb08; // combination city + highway for primary fuel type

                  optionsData.push({ "make": mpgResponse.data.make, "model": options[i], "year": year, "mpg": mpg, "fuelCap": fuelCap });

                } catch {
                  console.log(error);
                  res.status(500).send(error);
                }

              } catch (error) {
                  console.log(error);
                  res.status(500).send(error);
              }
            }

            console.log(optionsData);
            res.status(200).send(await Promise.all(optionsData));
          })
          .catch((error) => {
            console.log(error);
          })

          // nothing matched the model name as entered
        } else {
          res.status(404).send({ message: "Vehicle not found." });
        }
      }
    })
    .catch((error) => {
      console.log(error);
      res.status(500).send(error);
    });
};

export default carResponse;
