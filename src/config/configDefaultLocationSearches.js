import { types as sdkTypes } from '../util/sdkLoader';

const { LatLng, LatLngBounds } = sdkTypes;

// An array of locations to show in the LocationAutocompleteInput when
// the input is in focus but the user hasn't typed in any search yet.
//
// Each item in the array should be an object with a unique `id` (String) and a
// `predictionPlace` (util.types.place) properties.
//
// NOTE: these are highly recommended, since they
//       1) help customers to find relevant locations, and
//       2) reduce the cost of using map providers geocoding API

// const defaultLocations = [
  // {
  //   id: 'default-helsinki',
  //   predictionPlace: {
  //     address: 'Helsinki, Finland',
  //     bounds: new LatLngBounds(new LatLng(60.29783, 25.25448), new LatLng(59.92248, 24.78287)),
  //   },
  // },
  // {
  //   id: 'default-turku',
  //   predictionPlace: {
  //     address: 'Turku, Finland',
  //     bounds: new LatLngBounds(new LatLng(60.53045, 22.38197), new LatLng(60.33361, 22.06644)),
  //   },
  // },
  // {
  //   id: 'default-tampere',
  //   predictionPlace: {
  //     address: 'Tampere, Finland',
  //     bounds: new LatLngBounds(new LatLng(61.83657, 24.11838), new LatLng(61.42728, 23.5422)),
  //   },
  // },
  // {
  //   id: 'default-oulu',
  //   predictionPlace: {
  //     address: 'Oulu, Finland',
  //     bounds: new LatLngBounds(new LatLng(65.56434, 26.77069), new LatLng(64.8443, 24.11494)),
  //   },
  // },
  // {
  //   id: 'default-ruka',
  //   predictionPlace: {
  //     address: 'Ruka, Finland',
  //     bounds: new LatLngBounds(new LatLng(66.16997, 29.16773), new LatLng(66.16095, 29.13572)),
  //   },
  // },
// ];

const defaultLocations = [
  {
    id: 'default-paris',
    predictionPlace: {
      address: 'Paris, France',
      bounds: new LatLngBounds(
        new LatLng(48.9021449, 2.4699208), // NE
        new LatLng(48.815573, 2.224199)   // SW
      ),
    },
  },
  {
    id: 'default-brest',
    predictionPlace: {
      address: 'Brest, France',
      bounds: new LatLngBounds(
        new LatLng(48.4400, -4.4000), // NE
        new LatLng(48.3600, -4.5500)  // SW
      ),
    },
  },  
  {
    id: 'default-lille',
    predictionPlace: {
      address: 'Lille, France',
      bounds: new LatLngBounds(
        new LatLng(50.6700, 3.1250), // NE
        new LatLng(50.5900, 2.9800)  // SW
      ),
    },
  },
  {
    id: 'default-lyon',
    predictionPlace: {
      address: 'Lyon, France',
      bounds: new LatLngBounds(
        new LatLng(45.8280, 4.9350), // NE
        new LatLng(45.7100, 4.7700)  // SW
      ),
    },
  },
  {
    id: 'default-montpellier',
    predictionPlace: {
      address: 'Montpellier, France',
      bounds: new LatLngBounds(
        new LatLng(43.6600, 3.9500), // NE
        new LatLng(43.5600, 3.7800)  // SW
      ),
    },
  },
  {
    id: 'default-nice',
    predictionPlace: {
      address: 'Nice, France',
      bounds: new LatLngBounds(
        new LatLng(43.7400, 7.3000), // NE
        new LatLng(43.6700, 7.2000)  // SW
      ),
    },
  },
  {
    id: 'default-tours',
    predictionPlace: {
      address: 'Tours, France',
      bounds: new LatLngBounds(
        new LatLng(47.4300, 0.7400), // NE
        new LatLng(47.3300, 0.6200)  // SW
      ),
    },
  },
];

export default defaultLocations;
