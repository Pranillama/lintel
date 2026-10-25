import { httpRouter } from "convex/server";
import { findBills, getBillExplanation, listOpenBills } from "./voice/tools";

const http = httpRouter();

http.route({ path: "/voice/open", method: "GET", handler: listOpenBills });
http.route({ path: "/voice/find", method: "GET", handler: findBills });
http.route({ pathPrefix: "/voice/bill/", method: "GET", handler: getBillExplanation });

export default http;
