// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(`${(process.env.CONFIG_PATH || "../config/")}config.${(process.env.NODE_ENV || "development")}.json`);
import { createLogger, format, transports } from "winston";
const { combine, timestamp, label, colorize } = format;

let level = "debug"; // Default is to debug

if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging" || process.env.NODE_ENV === "development") {
	level = "error";
} else if (process.env.NODE_ENV === "test") {
	level = "warn";
}

const levels = {
	error: 0,
	warn: 1,
	access: 0,
	info: 2,
	verbose: 3,
	debug: 4,
	silly: 5
};

const colors = {
	error: "red",
	warn: "yellow",
	access: "grey",
	info: "green",
	verbose: "cyan",
	debug: "blue",
	silly: "magenta"
};

const consoleOptions = {
	format: combine(
		colorize({ colors }),
		label(),
		timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		format.printf((info: { message?: string; timestamp?: string; level?: string }) => {
			if (typeof info.message !== "string") {
				let message = "Failed to logify string";
				try {
					message = JSON.stringify(info.message, undefined, " ").substr(0, 512);
				} catch (e) {
					message = info.toString();
				}
				return `${info.timestamp} [${info.level}] ${message}`;
			} else {
				return `${info.timestamp} [${info.level}] ${info.message}`;
			}
		})
	),
	level: (typeof config.logging === "object") ? config.logging.level : false || process.env.LOG_LEVEL || level, // Config file overrides default level
	handleExceptions: (process.env.NODE_ENV === "production") ? true : false,
};

const transport = new transports.Console(consoleOptions);
const logger = createLogger({
	levels,
	transports: transport
});

export default logger;
