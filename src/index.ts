import { logger } from "./app";
import app from "./app";
import fs from "fs";
import { healthStatus } from "./health";
import express from "express";


const port = (process.env.NODE_ENV === "test") ? process.env.PORT || 3001 : process.env.PORT || 3000;

const isSocket = isNaN(parseInt(port.toString(), 10));

if (isSocket && fs.existsSync(port.toString())) {
	fs.unlinkSync(port.toString());
}

const server = app.listen(port, () => {
	if (isSocket) {
		fs.chmodSync(port.toString(), "775");
		logger.info(`API is up and running on socket ${port}`);
	} else {
		logger.info(`API is up and running on port ${port}`);
	}

	if (typeof process.send === "function") {
		process.send("ready");
	}
});

app.all("/status/", (req, res) => res.status(healthStatus()).send());

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.all("*", (req, res, _next) => {
	res.status(404);
	if (req.accepts("html")) {
		return res.type("html").send("RouteNotFound");
	}
	if (req.accepts("json")) {
		return res.send({
			error: "RouteNotFound",
			message: "The requested route was not found"
		});
	}
	return res.type("txt").send("Not found");
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: express.Errback, req: express.Request, res: express.Response, _next: express.NextFunction) => {
	logger.error({ InternalError: err });
	res.status(500).json({
		error: "InternalError",
		message: "Internal error"
	});
});

server.timeout = 20000;
server.keepAliveTimeout = 1000;

export default server;
