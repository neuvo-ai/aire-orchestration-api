const config = require(`${process.env.CONFIG_PATH || "../config/"}config.${process.env.NODE_ENV || "development"}.json`);
import logger from "./logger";
const Salt = require("salt-api");

// TODO: SET bot parameter type
async function runState(bot: any, stateName: string): Promise<Object> {

	const salt = new Salt(config.salt.api);
	try {
		// Same as test.ping
		await salt.ready;
		const stateRunResult = await salt.fun(bot.slug, "state.apply", stateName);

		// Check if return is empty object (Occurs when <minion-id> not exist on master salt-key list) = {"return": [{}]}
		if(JSON.stringify(stateRunResult.return[0]) === "{}") {
			throw ({errorType: "return-is-empty-object", stateRunResult});
		}

		// Get state collection states results
		const minionStateResults = stateRunResult.return[0][bot.slug];

		// Check if minion return false (Occurs when master loses connection to minion) = {return:[{<minion-id>:false}]}
		if(minionStateResults === false) {
			throw ({errorType: "connection-lost", stateRunResult});
		}

		// Check if return is string (Occurs when missing pillar data or state is already running on minion)
		// {"return":[{<minion-id>:["Rendering SLS 'base:mongodb' failed: Jinja variable 'dict object' has no attribute 'databases'"]}]},
		// {"return":[{<minion-id>:["The function \"state.apply\" is running as PID 35502 and was started at 2021, Oct 26 13:59:11.284032 with jid 20211026135911284032"]}]}
		if(Object.keys(minionStateResults).length === 1 && typeof minionStateResults[0] === "string") {
			throw ({errorType: "return-is-string", stateRunResult});
		}

		let failedStates: any = {};

		// Check if results have failed states
		for (const [stepKey, stepValue] of Object.entries(minionStateResults) as [string, any]) {
			if (typeof stepValue === 'object' && typeof stepValue.result !== 'undefined' ) {
				if(stepValue?.result !== true) {
					failedStates[stepKey] = stepValue;
				}
			}
		}

		const totalFailedStates = Object.keys(failedStates).length;

		if(totalFailedStates > 0) {
			// We have failed states
			const failResponse = {status:"failed", failed: totalFailedStates, states:failedStates};
			logger.info(`Failed running state ${stateName} - ${JSON.stringify(failResponse)}`);
			bot.logs.push({ log: `failed-state-${stateName}`, json:failResponse });
			await bot.save();
			throw ({errorType: "failed-running-state", failResponse});
		}

		logger.info(`${stateName} results - ${JSON.stringify(stateRunResult)}`);
		bot.logs.push({ log: `state-${stateName}-results`, json:stateRunResult });
		await bot.save();
		return Promise.resolve(stateRunResult);
	} catch (error) {
		throw error;
	}
}

export default runState;