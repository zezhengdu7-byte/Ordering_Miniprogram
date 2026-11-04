'use strict';
// 将来的业务云函数必须调用这些校验；本模块不读写数据库，也不代替身份验证。
const flavors = ['标准', '不辣', '微辣', '中辣', '特辣'];
function check(value, message) { if (!value) throw new Error(message); }
function integer(value, min, max, name) {
  check(Number.isSafeInteger(value) && value >= min && value <= max, `INVALID_${name}`);
}
function validateCart(lines) {
  check(Array.isArray(lines) && lines.length <= 50, 'INVALID_CART');
  const keys = new Set();
  for (const line of lines) {
    check(line && typeof line.dishId === 'string' && line.dishId.length > 0, 'INVALID_DISH');
    check(flavors.includes(line.flavor), 'INVALID_FLAVOR');
    integer(line.quantity, 1, 99, 'QUANTITY');
    const key = JSON.stringify([line.dishId, line.flavor]);
    check(!keys.has(key), 'DUPLICATE_CART_LINE'); keys.add(key);
  }
}
// catalog 必须是服务端在同一事务中读取的菜品，绝不能取自客户端提交的价格。
function priceOrder(lines, catalog) {
  validateCart(lines); check(lines.length > 0, 'EMPTY_CART');
  const dishes = new Map(catalog.map(d => [d._id, d]));
  const items = lines.map(line => {
    const dish = dishes.get(line.dishId);
    check(dish && dish.active && dish.onSale && !dish.soldOut, 'DISH_UNAVAILABLE');
    check(dish.spicy || line.flavor === '标准', 'INVALID_FLAVOR');
    const minimum = Math.max(1, dish.minQuantity || ((dish.description || '').includes('5串起点') ? 5 : 1));
    integer(line.quantity, minimum, 99, 'QUANTITY');
    integer(dish.price, 1, 9999900, 'PRICE');
    return { minQuantity: minimum, dishId: line.dishId, flavor: line.flavor, quantity: line.quantity, name: dish.name, unit: dish.unit, unitPrice: dish.price, subtotal: dish.price * line.quantity };
  });
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  integer(total, 1, Number.MAX_SAFE_INTEGER, 'TOTAL');
  return { items, total };
}
function assertVersion(actual, expected) {
  integer(actual, 0, Number.MAX_SAFE_INTEGER, 'VERSION');
  integer(expected, 0, Number.MAX_SAFE_INTEGER, 'VERSION');
  check(actual === expected, 'VERSION_CONFLICT');
}
function assertOrderTransition(order, next) {
  const transitions = { pending: ['accepted', 'cancelled'], accepted: ['completed'], completed: [], cancelled: [] };
  check(transitions[order.status]?.includes(next), 'INVALID_ORDER_TRANSITION');
  if (next === 'cancelled') check(order.paymentStatus === 'unpaid' && !order.activePaymentId && !order.paidPaymentId, 'PAYMENT_MUST_BE_CLOSED');
}
function assertSessionClosable(session, cart, orders) {
  check(session.status === 'open', 'SESSION_CLOSED');
  check(cart.sessionId === session._id, 'SESSION_MISMATCH');
  validateCart(cart.lines); check(cart.lines.length === 0, 'CART_NOT_EMPTY');
  check(orders.every(o => o.sessionId === session._id), 'SESSION_MISMATCH');
  check(orders.every(o => (o.status === 'cancelled' && o.paymentStatus === 'unpaid' && !o.activePaymentId && !o.paidPaymentId) || (o.status === 'completed' && o.paymentStatus === 'paid' && !!o.paidPaymentId)), 'UNSETTLED_ORDERS');
}
module.exports = { validateCart, priceOrder, assertVersion, assertOrderTransition, assertSessionClosable };
