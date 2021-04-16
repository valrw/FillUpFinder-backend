export const steps3 = [
  {
    points: [
      [0, 0],
      [0, 6],
      [0, 11],
      [0, 16],
      [0, 17],
    ],
    start_location: {
      lat: 0,
      lng: 0,
    },
    end_location: {
      lat: 0,
      lng: 17,
    },
    distance: {
      value: 17,
    },
    duration: {
      value: 0.15
    },
  },
  {
    points: [
      [0, 17],
      [0, 18],
      [0, 19],
      [0, 20],
    ],
    start_location: {
      lat: 0,
      lng: 17,
    },
    end_location: {
      lat: 0,
      lng: 20,
    },
    distance: {
      value: 3,
    },
    duration: {
      value: 0.15
    },
  },
]

/* For testing normal stopping behavior:
   stop in the middle of a step during which fuel
   will run out if the tank is more than 30% full
   when the step begins.
   Should produce a stop at (0, 18). */
export const steps2 = [
  {
    points: [
      [0, 0],
      [0, 3],
      [0, 6],
      [0, 9],
      [0, 12],
    ],
    start_location: {
      lat: 0,
      lng: 0,
    },
    end_location: {
      lat: 0,
      lng: 12,
    },
    distance: {
      value: 12,
    },
    duration: {
      value: 0.15
    },
  },
  {
    points: [
      [0, 12],
      [0, 14],
      [0, 16],
      [0, 18],
      [0, 20],
    ],
    start_location: {
      lat: 0,
      lng: 12,
    },
    end_location: {
      lat: 0,
      lng: 20,
    },
    distance: {
      value: 8,
    },
    duration: {
      value: 0.15
    },
  },
];

/* For testing normal stopping behavior:
   stop in the middle of a step that is longer
   than the maximum distance with a full tank.
   Should produce a stop at (0, 18). */
export const steps1 = [
  {
    points: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    start_location: {
      lat: 0,
      lng: 0,
    },
    end_location: {
      lat: 0,
      lng: 4,
    },
    distance: {
      value: 4,
    },
    duration: {
      value: 0.15
    },
  },
  {
    points: [
      [0, 4],
      [0, 11],
      [0, 18],
      [0, 21],
      [0, 25],
    ],
    start_location: {
      lat: 0,
      lng: 4,
    },
    end_location: {
      lat: 0,
      lng: 25,
    },
    distance: {
      value: 21,
    },
    duration: {
      value: 0.15
    },
  },
];

/* For testing normal stopping behavior:
   stop at the beginning of a step where gas
   will run out during the next step and the
   tank is 30% or less full.
   Should produce a stop at (0, 16). */
export const steps0 = [
  {
    points: [
      [0, 0],
      [0, 4],
      [0, 8],
      [0, 12],
      [0, 16],
    ],
    start_location: {
      lat: 0,
      lng: 0,
    },
    end_location: {
      lat: 0,
      lng: 16,
    },
    distance: {
      value: 16,
    },
    duration: {
      value: 0.15
    },
  },
  {
    points: [
      [0, 16],
      [0, 17],
      [0, 18],
      [0, 19],
      [0, 20],
    ],
    start_location: {
      lat: 0,
      lng: 16,
    },
    end_location: {
      lat: 0,
      lng: 20,
    },
    distance: {
      value: 4,
    },
    duration: {
      value: 0.15
    },
  },
]

export const testNearestStops = async (latitude, longitude) => {
  const genericStop = {
    geometry: {
      location: {
        lat: -1,
        lng: -1,
      },
    },
    name: "name",
    photos: [],
    vicinity: "vicinity",
    place_id: "place_id",
  }
  if (latitude == 0 && (longitude == 16 || longitude == 18)) {
    genericStop.geometry.location = { lat: latitude, lng: longitude };
    return([genericStop]);
  } else {
    return("NO STOPS FOUND");
  }
} 