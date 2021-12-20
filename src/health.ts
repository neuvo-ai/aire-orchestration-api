import logger from "./logger";

let falling = false;

if (process.env.IGNORE_SIGS !== "true") {
	process.on("SIGINT", () => kill("SIGINT"));
	process.on("SIGTERM", () => kill("SIGTERM"));
	process.on("SIGUSR2", () => falling = true);
} else {
	logger.warn("Running without SIG handling!");
}

let killstatus = false;

const gracefulTimeout = (process.env.NODE_ENV === "development") ? 1000 : 35000;

const kill = (sig: string, code = 0): void => {
	if (!killstatus) {
		killstatus = true;
		logger.warn(`${sig} called, going down!!`);
		falling = true;

		setTimeout(() => {
			logger.warn("Timeout reached, closing server");
			process.exit(code);
		}, gracefulTimeout);
	} else if (sig === "SIGINT") {
		logger.error("Going down forcefully");
		process.exit(1);
	}
};

const healthStatus = (): number => {
	return (falling) ? 410 : 200;
};

export { kill, healthStatus };
