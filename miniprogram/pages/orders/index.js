"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const order_page_1 = require("../../utils/order-page");
const page = (0, order_page_1.orderPage)(false);
page.data.filters = [
    ...page.data.filters.filter(item => item.id === 'all'),
    ...page.data.filters.filter(item => item.id !== 'all')
];
Page(page);
