import { createImageVariantConfig } from '../../util/sdkLoader';
import { isErrorUserPendingApproval, isForbiddenError, storableError } from '../../util/errors';
import { convertUnitToSubUnit, unitDivisor } from '../../util/currency';
import {
  parseDateFromISO8601,
  getExclusiveEndDate,
  addTime,
  subtractTime,
  daysBetween,
  getStartOf,
} from '../../util/dates';
import { constructQueryParamName, isOriginInUse, isStockInUse } from '../../util/search';
import { hasPermissionToViewData, isUserAuthorized } from '../../util/userHelpers';
import { parse } from '../../util/urlHelpers';

import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

// Custom development: Add "Toute la France" automatically when a region is selected in the filter //Dav
// // Locate where you extract pub_serviceAreas from URL / search params.
// // Before passing them to listings.query, inject your “national” key.
// // "Toute la France" service area key
const NATIONAL_SERVICE_AREA_KEY = 'FR';

// Helper: if there are region selections, add the national key
const withNationalIfAnyRegion = value => {
  if (!value) {
    return value;
  }

  // Value might be a string ("ile_de_france,paris") or an array.
  const arr = Array.isArray(value) ? value : `${value}`.split(',').filter(v => v);

  if (arr.length === 0) {
    return value;
  }

  const set = new Set(arr);
  set.add(NATIONAL_SERVICE_AREA_KEY);
  const newArr = Array.from(set);

  // Keep the same type as the original: string or array
  return Array.isArray(value) ? newArr : newArr.join(',');
};


// Pagination page size might need to be dynamic on responsive page layouts
// Current design has max 3 columns 12 is divisible by 2 and 3
// So, there's enough cards to fill all columns on full pagination pages
const RESULT_PAGE_SIZE = 24;

// ================ Action types ================ //

export const SEARCH_LISTINGS_REQUEST = 'app/SearchPage/SEARCH_LISTINGS_REQUEST';
export const SEARCH_LISTINGS_SUCCESS = 'app/SearchPage/SEARCH_LISTINGS_SUCCESS';
export const SEARCH_LISTINGS_ERROR = 'app/SearchPage/SEARCH_LISTINGS_ERROR';

export const SEARCH_MAP_LISTINGS_REQUEST = 'app/SearchPage/SEARCH_MAP_LISTINGS_REQUEST';
export const SEARCH_MAP_LISTINGS_SUCCESS = 'app/SearchPage/SEARCH_MAP_LISTINGS_SUCCESS';
export const SEARCH_MAP_LISTINGS_ERROR = 'app/SearchPage/SEARCH_MAP_LISTINGS_ERROR';

export const SEARCH_MAP_SET_ACTIVE_LISTING = 'app/SearchPage/SEARCH_MAP_SET_ACTIVE_LISTING';

// ================ Reducer ================ //

const initialState = {
  pagination: null,
  searchParams: null,
  searchInProgress: false,
  searchListingsError: null,
  currentPageResultIds: [],
};

const resultIds = data => {
  const listings = data.data;
  return listings
    .filter(l => !l.attributes.deleted && l.attributes.state === 'published')
    .map(l => l.id);
};

const listingPageReducer = (state = initialState, action = {}) => {
  const { type, payload } = action;
  switch (type) {
    case SEARCH_LISTINGS_REQUEST:
      return {
        ...state,
        searchParams: payload.searchParams,
        searchInProgress: true,
        searchMapListingIds: [],
        searchListingsError: null,
      };
    case SEARCH_LISTINGS_SUCCESS:
      return {
        ...state,
        currentPageResultIds: resultIds(payload.data),
        pagination: payload.data.meta,
        searchInProgress: false,
      };
    case SEARCH_LISTINGS_ERROR:
      // eslint-disable-next-line no-console
      console.error(payload);
      return { ...state, searchInProgress: false, searchListingsError: payload };

    case SEARCH_MAP_SET_ACTIVE_LISTING:
      return {
        ...state,
        activeListingId: payload,
      };
    default:
      return state;
  }
};

export default listingPageReducer;

// ================ Action creators ================ //

export const searchListingsRequest = searchParams => ({
  type: SEARCH_LISTINGS_REQUEST,
  payload: { searchParams },
});

export const searchListingsSuccess = response => ({
  type: SEARCH_LISTINGS_SUCCESS,
  payload: { data: response.data },
});

export const searchListingsError = e => ({
  type: SEARCH_LISTINGS_ERROR,
  error: true,
  payload: e,
});

export const searchListings = (searchParams, config) => (dispatch, getState, sdk) => {
  dispatch(searchListingsRequest(searchParams));

  // SearchPage can enforce listing query to only those listings with valid listingType
  // NOTE: this only works if you have set 'enum' type search schema to listing's public data fields
  //       - listingType
  //       Same setup could be expanded to 2 other extended data fields:
  //       - transactionProcessAlias
  //       - unitType
  //       ...and then turned enforceValidListingType config to true in configListing.js
  // Read More:
  // https://www.sharetribe.com/docs/how-to/manage-search-schemas-with-flex-cli/#adding-listing-search-schemas
  const searchValidListingTypes = (listingTypes, listingTypePathParam, isListingTypeVariant) => {
    return isListingTypeVariant
      ? {
          pub_listingType: listingTypePathParam,
        }
      : config.listing.enforceValidListingType
      ? {
          pub_listingType: listingTypes.map(l => l.listingType),
          // pub_transactionProcessAlias: listingTypes.map(l => l.transactionType.alias),
          // pub_unitType: listingTypes.map(l => l.transactionType.unitType),
        }
      : {};
  };

  const constructCategoryPropertiesForAPI = (queryParamPrefix, categories, level, params) => {
    const levelKey = `${queryParamPrefix}${level}`;
    const levelValue =
      typeof params?.[levelKey] !== 'undefined' ? `${params?.[levelKey]}` : undefined;
    const foundCategory = categories.find(cat => cat.id === levelValue);
    const subcategories = foundCategory?.subcategories || [];
    // Note: we might need to prepare nested categories too: categoryLevel1, categoryLevel2, categoryLevel3
    return foundCategory && subcategories.length > 0
      ? {
          [levelKey]: levelValue,
          ...constructCategoryPropertiesForAPI(queryParamPrefix, subcategories, level + 1, params),
        }
      : foundCategory
      ? { [levelKey]: levelValue }
      : {};
  };

  /**
   * Category filter params are prepared here. We omit invalid category names.
   * I.e. params that are not part of the currently configured category tree.
   *
   * @param {string} paramName - The name of the parameter to prepare.
   * @param {Object} params - The search params object.
   * @returns {Object} The prepared parameter object.
   */
  const prepareCategoryParams = (paramName, params) => {
    const categoryConfig = config.search.defaultFilters?.find(f => f.schemaType === 'category');
    const categories = config.categoryConfiguration.categories;
    const { key, scope } = categoryConfig || {};
    const categoryParamPrefix = constructQueryParamName(key, scope);
    return paramName.startsWith(categoryParamPrefix)
      ? constructCategoryPropertiesForAPI(categoryParamPrefix, categories, 1, params)
      : {};
  };

  const constructIntegerRangePropertyForAPI = (queryParamPrefix, params) => {
    const integerValue = params?.[queryParamPrefix];
    const [min, max] = integerValue ? integerValue.split(',') : [];
    // NOTE: long filter needs exclusive max value on API side
    const inclusiveMin = Number.parseInt(min, 10);
    const exclusiveMax = Number.parseInt(max, 10) + 1;

    // NOTE: currently we don't validate the range values against the integer range config,
    // but we might want to do that in the future.

    return Number.isInteger(inclusiveMin) && Number.isInteger(exclusiveMax)
      ? { [queryParamPrefix]: [inclusiveMin, exclusiveMax].join(',') }
      : {};
  };

  /**
   * Integer range filter values are converted to API params of type 'long'.
   *
   * The range end must be exclusive. E.g. 1000,2000 -> 1000,2001
   *
   * NOTE: currently we don't validate the range values against the integer range config,
   * but we might want to do that in the future.
   *
   * @param {string} paramName - The name of the parameter to prepare.
   * @param {Object} params - The search params object.
   * @returns {Object} The prepared parameter object.
   */
  const prepareIntegerRangeParam = (paramName, params) => {
    const integerRangeConfig = config.listing.listingFields?.find(f => f.schemaType === 'long');
    const { key, scope } = integerRangeConfig || {};
    const integerParamPrefix = constructQueryParamName(key, scope);
    return paramName.startsWith(integerParamPrefix)
      ? constructIntegerRangePropertyForAPI(integerParamPrefix, params)
      : {};
  };

  // This function goes through given params and if there's a specific handler for the parameter type,
  // it calls the handler to prepare the property for API.
  // Otherwise, it just passes the param through.
  const prepareAPIParams = (params, paramHandlers) => {
    const pickedKeys = Object.entries(params).reduce((picked, [k, v]) => {
      const preparedParams = paramHandlers.reduce((picked, fn) => {
        return { ...picked, ...fn(k, params) };
      }, {});

      // If the param is not handled by any of the handlers, we pass it through.
      const currentParam = Object.keys(preparedParams).length > 0 ? preparedParams : { [k]: v };

      return { ...picked, ...currentParam };
    }, {});

    return pickedKeys;
  };

  const priceSearchParams = priceParam => {
    const inSubunits = value => convertUnitToSubUnit(value, unitDivisor(config.currency));
    const values = priceParam ? priceParam.split(',') : [];
    return priceParam && values.length === 2
      ? {
          price: [inSubunits(values[0]), inSubunits(values[1]) + 1].join(','),
        }
      : {};
  };

  const datesSearchParams = datesParam => {
    const searchTZ = 'Etc/UTC';
    const datesFilter = config.search.defaultFilters.find(f => f.key === 'dates');
    const values = datesParam ? datesParam.split(',') : [];
    const hasValues = datesFilter && datesParam && values.length === 2;
    const { dateRangeMode, availability } = datesFilter || {};
    const isNightlyMode = dateRangeMode === 'night';
    const isEntireRangeAvailable = availability === 'time-full';

    // SearchPage need to use a single time zone but listings can have different time zones
    // We need to expand/prolong the time window (start & end) to cover other time zones too.
    //
    // NOTE: you might want to consider changing UI so that
    //   1) location is always asked first before date range
    //   2) use some 3rd party service to convert location to time zone (IANA tz name)
    //   3) Make exact dates filtering against that specific time zone
    //   This setup would be better for dates filter,
    //   but it enforces a UX where location is always asked first and therefore configurability
    const getProlongedStart = date => subtractTime(date, 14, 'hours', searchTZ);
    const getProlongedEnd = date => addTime(date, 12, 'hours', searchTZ);

    const startDate = hasValues ? parseDateFromISO8601(values[0], searchTZ) : null;
    const endRaw = hasValues ? parseDateFromISO8601(values[1], searchTZ) : null;
    const endDate =
      hasValues && isNightlyMode
        ? endRaw
        : hasValues
        ? getExclusiveEndDate(endRaw, searchTZ)
        : null;

    const today = getStartOf(new Date(), 'day', searchTZ);
    const possibleStartDate = subtractTime(today, 14, 'hours', searchTZ);
    const hasValidDates =
      hasValues &&
      startDate.getTime() >= possibleStartDate.getTime() &&
      startDate.getTime() <= endDate.getTime();

    const dayCount = isEntireRangeAvailable ? daysBetween(startDate, endDate) : 1;
    const day = 1440;
    const hour = 60;
    // When entire range is required to be available, we count minutes of included date range,
    // but there's a need to subtract one hour due to possibility of daylight saving time.
    // If partial range is needed, then we just make sure that the shortest time unit supported
    // is available within the range.
    // You might want to customize this to match with your time units (e.g. day: 1440 - 60)
    const minDuration = isEntireRangeAvailable ? dayCount * day - hour : hour;
    return hasValidDates
      ? {
          start: getProlongedStart(startDate),
          end: getProlongedEnd(endDate),
          // Availability can be time-full or time-partial.
          // However, due to prolonged time window, we need to use time-partial.
          availability: 'time-partial',
          // minDuration uses minutes
          minDuration,
        }
      : {};
  };

  const stockFilters = datesMaybe => {
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // If dates filter is not in use,
    //   1) Add minStock filter with default value (1)
    //   2) Add relaxed stockMode: "match-undefined"
    // The latter is used to filter out all the listings that explicitly are out of stock,
    // but keeps bookable and inquiry listings.
    return hasDatesFilterInUse ? {} : { minStock: 1, stockMode: 'match-undefined' };
  };

  const seatsSearchParams = (seats, datesMaybe) => {
    const seatsFilter = config.search.defaultFilters.find(f => f.key === 'seats');
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // Seats filter cannot be applied without dates
    return hasDatesFilterInUse && seatsFilter ? { seats } : {};
  };

  const {
    perPage,
    price,
    dates,
    seats,
    sort,
    mapSearch,
    listingTypePathParam,
    isListingTypeVariant,
    ...restOfParams
  } = searchParams;

  // // Custom development: Add "Toute la France" automatically when a region is selected in the filter //Dav

  // The params related to default filters are prepared one-by-one
  // We could consider moving them to the prepareAPIParams function too.
  const priceMaybe = priceSearchParams(price);
  const datesMaybe = datesSearchParams(dates);
  const stockMaybe = stockFilters(datesMaybe);
  const seatsMaybe = seatsSearchParams(seats, datesMaybe);
  const sortMaybe = sort === config.search.sortConfig.relevanceKey ? {} : { sort };

  // 1) First, let the helpers prepare category & integer-range params
  const apiParamsFromRest = prepareAPIParams(restOfParams, [
    prepareCategoryParams,
    prepareIntegerRangeParam,
  ]);

  // 2) Then, if pub_serviceAreas is present, augment it with the national key
  const apiParamsWithZones = (() => {
    const { pub_serviceAreas, ...others } = apiParamsFromRest;
    return pub_serviceAreas
      ? { ...others, pub_serviceAreas: withNationalIfAnyRegion(pub_serviceAreas) }
      : apiParamsFromRest;
  })();

  const params = {
    // The params that are related to listing fields and categories are prepared here.
    // Note: apiParamsWithZones already contains the modified pub_serviceAreas
    ...apiParamsWithZones,

    // Listing-type constraints
    ...searchValidListingTypes(
      config.listing.listingTypes,
      listingTypePathParam,
      isListingTypeVariant
    ),

    // Default filters (price, dates, stock, seats, sort)
    ...priceMaybe,
    ...datesMaybe,
    ...stockMaybe,
    ...seatsMaybe,
    ...sortMaybe,

    perPage,
  };


  return sdk.listings
    .query(params)
    .then(response => {
      const listingFields = config?.listing?.listingFields;
      const sanitizeConfig = { listingFields };

      dispatch(addMarketplaceEntities(response, sanitizeConfig));
      dispatch(searchListingsSuccess(response));
      return response;
    })
    .catch(e => {
      const error = storableError(e);
      dispatch(searchListingsError(error));
      if (!(isErrorUserPendingApproval(error) || isForbiddenError(error))) {
        throw e;
      }
    });
};

export const setActiveListing = listingId => ({
  type: SEARCH_MAP_SET_ACTIVE_LISTING,
  payload: listingId,
});

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  // In private marketplace mode, this page won't fetch data if the user is unauthorized
  const { listingType: listingTypePathParam } = params || {};
  const state = getState();
  const currentUser = state.user?.currentUser;
  const isAuthorized = currentUser && isUserAuthorized(currentUser);
  const hasViewingRights = currentUser && hasPermissionToViewData(currentUser);
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const canFetchData =
    !isPrivateMarketplace || (isPrivateMarketplace && isAuthorized && hasViewingRights);
  if (!canFetchData) {
    return Promise.resolve();
  }

  const queryParams = parse(search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  const { page = 1, address, origin, ...rest } = queryParams;
  const originMaybe = isOriginInUse(config) && origin ? { origin } : {};

  const listingTypeVariantMaybe = listingTypePathParam
    ? { listingTypePathParam, isListingTypeVariant: true }
    : {};

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const aspectRatio = aspectHeight / aspectWidth;

  const searchListingsCall = searchListings(
    {
      ...rest,
      ...originMaybe,
      ...listingTypeVariantMaybe,
      page,
      perPage: RESULT_PAGE_SIZE,
      include: ['author', 'images'],
      'fields.listing': [
        'title',
        'geolocation',
        'price',
        'deleted',
        'state',
        'publicData.listingType',
        'publicData.transactionProcessAlias',
        'publicData.unitType',
        'publicData.cardStyle',
        // These help rendering of 'purchase' listings,
        // when transitioning from search page to listing page
        'publicData.pickupEnabled',
        'publicData.shippingEnabled',
        'publicData.priceVariationsEnabled',
        'publicData.priceVariants',
      ],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
      'fields.image': [
        'variants.scaled-small',
        'variants.scaled-medium',
        `variants.${variantPrefix}`,
        `variants.${variantPrefix}-2x`,
      ],
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
      'limit.images': 1,
    },
    config
  );
  return dispatch(searchListingsCall);
};
