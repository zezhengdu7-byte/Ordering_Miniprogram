"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../../utils/auth");
const order_page_1 = require("../../utils/order-page");
Page((0, auth_1.merchantPage)((0, order_page_1.orderPage)(true)));
