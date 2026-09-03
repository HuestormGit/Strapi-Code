'use strict';

// Fixture delivery provider. This is the whole swap point for Shiprocket: keep
// getOptions({ destinationPincode, items, packageData }) and the returned shape
// ({ serviceable, options[] }), and the API contract does not change.
//
// Options are deliberately generic — no Standard/Express, no Surface/Air, no
// courier ranking. Those are introduced with the real provider.

const UNSERVICEABLE_PINCODES = new Set(['000000', '999999']);

const getOptions = async ({ destinationPincode }) => {
  if (UNSERVICEABLE_PINCODES.has(destinationPincode)) {
    return { serviceable: false, options: [] };
  }

  return {
    serviceable: true,
    options: [
      {
        id: 'fixture-delivery',
        label: 'Delivery',
        shippingPaise: 4000,
        estimatedDaysMin: 4,
        estimatedDaysMax: 6,
      },
    ],
  };
};

module.exports = { name: 'fixture', UNSERVICEABLE_PINCODES, getOptions };
