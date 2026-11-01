"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("./utils/store");
const auth_1 = require("./utils/auth");
const table_service_1 = require("./utils/table-service");
App({ onLaunch() { (0, store_1.initialize)(); (0, auth_1.initAuth)(); }, onShow(options) { void (0, table_service_1.handleTableEntry)(options); } });
