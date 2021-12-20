import * as pkg from "./package.json"; // Use import to embed JSON to the build
import express, { Request } from "express";
import bodyParser from "body-parser";
// import expressJwt from "express-jwt";
import morgan from "morgan";
import mongoose from "mongoose";
import logger from "./logger";
import routes from "./routes";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(`${(process.env.CONFIG_PATH || "../config/")}config.${(process.env.NODE_ENV || "development")}.json`); // Use require or fs loading as to not embed the JSON to the build

// FOR DEBUGGING
import os from "os";

const hostname = os.hostname();

logger.verbose("Version: " + pkg.version);
logger.verbose("Host: " + hostname);
logger.verbose("Environment: " + (process.env.NODE_ENV || "development"));

mongoose.Promise = global.Promise;

mongoose.connect(config.mongo.uri, { autoIndex: true }).then((db) => {
	logger.info(`DB connection opened to: ${db.connection.db.databaseName}`);
	void db.connection.db.stats().then(logger.silly);


	for (const event of ["authenticated", "error", "fullsetup", "parseError", "reconnect", { event: "close", exit: 1 }, { event: "timeout", exit: 1 }]) {
		const eventName = (typeof event === "string") ? event : event.event;
		db.connection.on(eventName, (err) => {
			if (typeof event === "object") {
				logger.error({ eventName });
				logger.error({ dbErr: err });

			} else {
				if (eventName === "reconnect") {
					logger.silly("Reconnected");
				}
				logger.silly({ dbEvent: eventName });
			}
		});
	}
}).catch((reason: TypeError) => {
	logger.error(`DB connection error: ${reason.message}`);
	process.exit(1);
});


// Create Express
const app = express();

if (process.env.NODE_ENV !== "production") {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	app.use(require("response-time")());
}

app.use(bodyParser.urlencoded({limit: "1mb",extended: true}));
app.use(bodyParser.json({limit: "1mb"}));

app.disable("x-powered-by");

app.use((req, res, next) => {
	res.header("Access-Control-Allow-Origin", (typeof config.cors === "object") ? config.cors["Access-Control-Allow-Origin"] : "*");
	res.header("Access-Control-Allow-Methods", "DELETE, PUT, GET, POST, OPTIONS, PATCH");
	if (process.env.NODE_ENV === "production") {
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Entity");
	} else {
		res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Entity, API");
	}
	res.header("Access-Control-Expose-Headers", "Token");
	res.header("X-Version", pkg.version);
	res.header("X-Men", hostname);
	next();
});

const accessLogSkip = ["/status", "/favicon.ico"];

if (process.env.NODE_ENV !== "test" || (process.env.NODE_ENV === "test" && process.env.LOG_LEVEL === "silly")) {
	app.use(morgan(":remote-addr - [:date[clf]] \":method :url HTTP/:http-version\" :status :res[content-length] \":referrer\" \":user-agent\"", {
		stream: {
			write: (message) => logger.log("access", message.trim())
		},
		skip: (req) => {
			return accessLogSkip.includes(req.url);
		}
	}));
}

app.use((err: express.Errback, req: express.Request, res: express.Response, next: express.NextFunction) => {
	if (err) {
		logger.silly(err);
		if (err.name !== "UnauthorizedError") {
			logger.error(err);
		}
		return res.status(401).json({
			error: err.name
		});
	} else {
		next();
	}
});

app.use(routes);

app.get("/", (req, res) => {
	return res.redirect(config.urls.rootRedirect);
});

export { logger };
export default app;
