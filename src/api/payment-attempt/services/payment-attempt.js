'use strict';

/**
 * payment-attempt service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::payment-attempt.payment-attempt');
