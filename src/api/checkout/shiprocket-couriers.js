'use strict';

const toPaise = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const scaled = value * 100;
  const paise = Math.round(scaled);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  return Number.isSafeInteger(paise) && Math.abs(scaled - paise) <= tolerance
    ? paise
    : null;
};

const ratingTierFor = (rating) => {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return 'unrated';
  if (rating >= 4) return 'preferred';
  if (rating >= 3) return 'normal';
  if (rating >= 2.5) return 'fallback';
  return 'rejected';
};

const estimatedDaysFor = (value) => {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) ? days : null;
};

const finiteNumberOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizeCourier = (courier) => {
  if (!courier || typeof courier !== 'object' || Array.isArray(courier)) {
    return null;
  }

  const courierCompanyId = courier.courier_company_id;
  const courierName =
    typeof courier.courier_name === 'string' ? courier.courier_name.trim() : '';
  const freightChargePaise = toPaise(courier.freight_charge);
  const estimatedDays = estimatedDaysFor(courier.estimated_delivery_days);
  if (
    !Number.isSafeInteger(courierCompanyId) ||
    courierCompanyId <= 0 ||
    !courierName ||
    freightChargePaise === null ||
    estimatedDays === null
  ) {
    return null;
  }

  const rating = finiteNumberOrNull(courier.rating);
  const providerRatePaise = toPaise(courier.rate);

  return {
    courierCompanyId,
    courierName,
    freightChargePaise,
    providerRatePaise,
    providerRateDiffers:
      providerRatePaise === null ? null : providerRatePaise !== freightChargePaise,
    rating,
    ratingTier: ratingTierFor(rating),
    estimatedDays,
    rawMode: Number.isSafeInteger(courier.mode) ? courier.mode : null,
    isSurface:
      typeof courier.is_surface === 'boolean' ? courier.is_surface : null,
    rank: finiteNumberOrNull(courier.rank),
    pickupPriority: finiteNumberOrNull(courier.pickup_priority),
    recommendedLt: null,
  };
};

const normalizeCouriers = (couriers) => {
  if (!Array.isArray(couriers)) {
    throw new TypeError('Shiprocket couriers must be an array');
  }

  const normalizedCouriers = couriers.map(normalizeCourier).filter(Boolean);
  const normalPool = normalizedCouriers.filter(
    ({ ratingTier }) => ratingTier === 'preferred' || ratingTier === 'normal'
  );
  const eligibleCouriers = normalPool.length
    ? normalPool
    : normalizedCouriers.filter(({ ratingTier }) => ratingTier === 'fallback');

  return {
    normalizedCouriers,
    eligibleCouriers,
    invalidCourierCount: couriers.length - normalizedCouriers.length,
  };
};

module.exports = {
  toPaise,
  ratingTierFor,
  estimatedDaysFor,
  normalizeCourier,
  normalizeCouriers,
};
