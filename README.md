# FillUpFinder

## How to use the API
### Search for vehicle data
`GET https://fillupfinder.herokuapp.com/api/vehicle/:make/:model/:year`
#### Returns:
    ```
    {
        mpg: average miles per gallon,
        fuelCap: fuel capacity,
        make: make,
        model: model,
        year: year,
    }
    ```

### Search for directions
`GET fillupfinder.herokuapp.com/api/directions/:start/:end/:fuelLeft/:fuelCap/:mpg/:calcOnGas/:numStops?`
#### Returns:
    ```
    {
        route: list of coordinates,
        distance: total distance,
        duration: total duration,
        stops: number of recommended stops,
    }
    ```

## How to run the API
Our backend API uses NodeJS.

Clone the git repository:
`git clone git@github.com:valrw/FillUpFinder-backend.git`
`cd FillUpFinder-backend`

In the project's root directory, run
`npm install`
to install dependencies, then
`node index.js`.

The API will listen on localhost port 9090, and the console should display `listening on 9090`.
It can be called with `http://localhost:9090/api/...`