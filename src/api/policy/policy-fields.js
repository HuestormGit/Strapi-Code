'use strict';

// The four legal pages the storefront serves. The React routes are built
// against exactly these strings and the Policy Page content type constrains
// `slug` to the same list, so the two can never drift: a slug outside this set
// cannot be saved in the Admin, and would 404 here if it somehow were.
const POLICY_SLUGS = [
  'terms-and-conditions',
  'privacy-policy',
  'shipping-policy',
  'refund-policy',
];

// The whitelist behind {{placeholder}} substitution, and at the same time the
// exact shape of the `business` object the public endpoint returns. Policy
// Settings is never exposed as a raw entity: only these keys leave the server,
// so adding a field to that single type does not publish it by accident.
const BUSINESS_FIELDS = [
  'brandName',
  'legalEntityName',
  'registeredAddress',
  'businessAddress',
  'supportEmail',
  'supportPhone',
  'grievanceOfficerName',
  'grievanceEmail',
  'grievancePhone',
  'fssaiLicenseNumber',
  'dispatchTimeline',
  'estimatedDeliveryTimeline',
  'refundProcessingTimeline',
  'cancellationWindow',
  'issueReportingWindow',
  'shippingChargesPolicy',
  'governingJurisdiction',
];

module.exports = { POLICY_SLUGS, BUSINESS_FIELDS };
