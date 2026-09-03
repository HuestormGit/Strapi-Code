'use strict';

const ascending = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const descending = (left, right) => ascending(right, left);

const standardOrder = (left, right) =>
  ascending(left.freightChargePaise, right.freightChargePaise) ||
  descending(left.rating, right.rating) ||
  ascending(left.estimatedDays, right.estimatedDays) ||
  ascending(left.courierCompanyId, right.courierCompanyId);

const expressOrder = (left, right) =>
  ascending(left.estimatedDays, right.estimatedDays) ||
  descending(left.rating, right.rating) ||
  ascending(left.freightChargePaise, right.freightChargePaise) ||
  ascending(left.courierCompanyId, right.courierCompanyId);

const validateCourier = (courier, index) => {
  const fail = (field) => {
    throw new TypeError(`eligibleCouriers[${index}].${field} is invalid`);
  };

  if (!courier || typeof courier !== 'object' || Array.isArray(courier)) {
    fail('record');
  }
  if (!Number.isSafeInteger(courier.courierCompanyId) || courier.courierCompanyId <= 0) {
    fail('courierCompanyId');
  }
  if (typeof courier.courierName !== 'string' || !courier.courierName.trim()) {
    fail('courierName');
  }
  if (!Number.isSafeInteger(courier.freightChargePaise) || courier.freightChargePaise < 0) {
    fail('freightChargePaise');
  }
  if (typeof courier.rating !== 'number' || !Number.isFinite(courier.rating)) {
    fail('rating');
  }
  if (!Number.isSafeInteger(courier.estimatedDays) || courier.estimatedDays <= 0) {
    fail('estimatedDays');
  }
};

const selectDeliveryCouriers = (eligibleCouriers) => {
  if (!Array.isArray(eligibleCouriers)) {
    throw new TypeError('eligibleCouriers must be an array');
  }
  eligibleCouriers.forEach(validateCourier);

  if (eligibleCouriers.length === 0) {
    return { standardCourier: null, expressCourier: null };
  }

  const standardCourier = [...eligibleCouriers].sort(standardOrder)[0];
  const expressCourier = [...eligibleCouriers]
    .filter(
      (courier) =>
        courier.courierCompanyId !== standardCourier.courierCompanyId &&
        courier.estimatedDays < standardCourier.estimatedDays
    )
    .sort(expressOrder)[0] || null;

  return { standardCourier, expressCourier };
};

module.exports = { selectDeliveryCouriers };
