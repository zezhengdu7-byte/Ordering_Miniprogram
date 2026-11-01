'use strict';
const check = (ok, code) => { if (!ok) throw new Error(code); };
function feeSettings(shop) {
  const prices = [shop.cutleryPrice, shop.napkinPrice];
  return { configured: prices.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 100000), cutleryPrice: prices[0] ?? null, napkinPrice: prices[1] ?? null };
}
function createDining(input, shop) {
  const fees = feeSettings(shop); check(fees.configured, 'DINING_FEES_NOT_CONFIGURED');
  check(input.cutleryPrice === fees.cutleryPrice && input.napkinPrice === fees.napkinPrice, 'FEE_CHANGED');
  for (const [key, min] of [['people',1],['cutlery',0],['napkins',0]]) check(Number.isInteger(input[key]) && input[key] >= min && input[key] <= 99, 'INVALID_DINING');
  return { people: input.people, cutlery: input.cutlery, napkins: input.napkins, cutleryPrice: fees.cutleryPrice, napkinPrice: fees.napkinPrice, total: input.cutlery * fees.cutleryPrice + input.napkins * fees.napkinPrice, confirmed: true };
}
function chargeDining(session) {
  check(session.dining?.confirmed, 'DINING_REQUIRED');
  return { ...session.dining, charged: !session.diningFeeOrderId, total: session.diningFeeOrderId ? 0 : session.dining.total };
}
module.exports = { feeSettings, createDining, chargeDining };
