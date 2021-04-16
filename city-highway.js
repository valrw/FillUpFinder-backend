/* Takes a step from Google Directions and returns true if it is likely to be a "highway";
   false otherwise. */
const isHighway = (step) => {
    // average est speed on step should be at least 40 mph, or ~18 m/s
    return (step.distance.value / step.duration.value > 18);
}

export default isHighway;