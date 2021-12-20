const config = require(`${process.env.CONFIG_PATH || "../../config/"}config.${process.env.NODE_ENV || "development"}.json`);

import express from "express";
import { param, validationResult, matchedData } from "express-validator";
const router = express.Router();
import logger from "../logger";
import _ from "lodash";
import { Types } from "mongoose";
import { Bot } from "../models/bot";
import { DNS } from "../models/dns";
import { Pillar } from "../models/pillar";
const Salt = require("salt-api");
const generatePassword = require("generate-password");
import runState from "../runstate";

let stateRunCount = 0; // Used to count state run if needed to try re-run state


const checkIfBotsToDelete = async() => {

	logger.info("Check if bots to delete")

	try {
		// Get removed bots
		const removedBots = await Bot.find({status: "removing"}).sort("-createdAt").limit(3000).select("_id name slug status createdAt updatedAt removedAt");

		// Exit if no removed bots found
		if(removedBots.length < 1) {
			logger.info("No bots to delete")
			return;
		}

		logger.info(`Bots do delete count: ${removedBots.length}`);

		process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
		const salt = new Salt(config.salt.api);
		await salt.ready;

		// Loop bots and check if removedAt is over deleteMinutes
		for (const removedBot of removedBots) {

			const removedTime = removedBot.removedAt.getTime();
			const timeNow = new Date().getTime();
			const diffTime = timeNow - removedTime;

			const oneMinute = 1000 * 60 // One minute in milliseconds
			const minutesFromMarkedRemove = diffTime / oneMinute

			// 60 minuts * 24 hours x 2days = 2880 minutes
			const deleteMinutes = 60 * 24 * 2; // If bot is marked to delete after over deleteMinutes ago delete bot server

			let timeLeftToDelete: any = deleteMinutes-Math.floor(minutesFromMarkedRemove)
			if(timeLeftToDelete > 60) {
				timeLeftToDelete = `${Math.ceil(timeLeftToDelete/60)} hours`
			} else {
				timeLeftToDelete = `${timeLeftToDelete} minutes`
			}

			if(minutesFromMarkedRemove < deleteMinutes) {
				// Just show log bot will be deleted
				logger.info(`[BOT] '${removedBot.name}' marked deleted to ${Math.floor(minutesFromMarkedRemove)} minutes ago, (Delete process starts in ${timeLeftToDelete})`);
			}

			// Check if bot was removed over deleteMinutes ago
			if(minutesFromMarkedRemove > deleteMinutes) {

				// Delete bot from server
				logger.info(`[BOT TO DELETE] '${removedBot.name}' marked to removed over ${Math.floor(minutesFromMarkedRemove)} minutes ago, starting to remove bot.`);

				try {
					const botDeleteResult =  await salt.fun(config.salt.masterId, `cloud.destroy`, removedBot.slug);
					const bot = await Bot.findById(new Types.ObjectId(removedBot._id));
					bot.status = "deleted";
					bot.deletedAt = new Date().toISOString();
					bot.logs.push({ log: "bot-delete-results", json: botDeleteResult });
					await bot.save();
					const masterPillar = await Pillar.findById(config.salt.masterId);

					// Remove bot from master pillar instances
					const newInstances = masterPillar.instances.filter((instance: { name: string; }) => instance.name !== removedBot.slug)
					masterPillar.instances = newInstances;
					masterPillar.save();
					logger.info(`Removed bot from master pillar instances`);
					logger.info(`Bot delete results - ${JSON.stringify(botDeleteResult)}`);

					// Confirm bot is deleted
					logger.info("Confirm, bot got deleted. Get all cloud servers: cloud.query");
					const cloudServers = await salt.fun(config.salt.masterId, `cloud.query`);
					// Get only bot servers, filter master out
					const botServers = Object.keys(cloudServers.return[0][config.salt.masterId].hetzner.hetzner).filter(server => server !== config.salt.masterId);
					const foundBot = botServers.find(bot => bot[0] === removedBot.slug)

					if(typeof foundBot === "undefined") {
						logger.info(`Confirmed bot: ${removedBot.slug} is deleted`);
						bot.logs.push({ log: "bot-deleted-confirmed"});
						await bot.save();
					}

					// Bot deleteing has failed
					if(typeof foundBot !== "undefined") {
						logger.error(`Bot: ${removedBot.slug} deleting has failed.`)
						bot.status = "errored";
						bot.logs.push({ log: "bot-delete-failed"});
						await bot.save();
					}

				} catch (error) {
					logger.error(`Error deleting bot : '${removedBot.name}', ErrorMessage: ${error.message}`);
				}
			}
		}
	} catch (error) {
		logger.error(error.message)
		return
	}
};

// Check if deleted bots
checkIfBotsToDelete();
setInterval(() => {
	checkIfBotsToDelete();
}, 600000); // Ten minutes


// TODO: Limit which servers can send to this endpoint
// This is the instigator for new minions (bots) Set to change
router.post("/:id", [param("id", "Invalid ID").isMongoId()], async (req: express.Request, res: express.Response) => {
	const errors = validationResult(req);
	const values = matchedData(req);

	if (!errors.isEmpty()) {
		return res.status(400).json({
			error: "ValidatingError",
			message: "Validating parameters failed",
			errors: _.uniqWith(errors.array(), _.isEqual),
		});
	}

	// TODO: bot variable type from any to?
	let bot: any;

	try {
		// Send ok status back to dashboard-api so it isn't left hanging
		res.status(200).json({ success: true });
		// Get bot information
		logger.info("Getting bot information");
		bot = await Bot.findById(new Types.ObjectId(values.id));
		logger.info(`Bot data: ${JSON.stringify(bot)}`);

		if (bot === undefined) {
			// The bot doesn't exist
			return;
		}

		process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"; // TODO: import custom cert

		const salt = new Salt(config.salt.api);

		await salt.ready;
		// Same as running `salt "*" test.ping` in the command line

		const hostname = `${config.dns.prefix}${bot.slug}${config.dns.suffix}`;
		const rootURL = `${config.dns.scheme}${hostname}`;


		// Progress statuses
		/*
		created: The bot has just been created and is waiting for orchestration
		pending: The orchestration has noticed and started the creation process
		deploying: The salt cloud deployment is in progress
		installing-system-updates: Make sure system is up to date, update packages, Remove unnecessary packages to minimize potential security issues
		configuring-system-settings: Configuring system security and settings, Set server timezone
		installing-nodejs-nginx: Installing Nginx and NodeJS
		installing-firewall: Make sure firewalld is installed and start firewalld service, Set allowed ports to public zone, block ping
		installing-mongodb: Installing MongoDB, Create databases and users, Create admin user, Set auth enabled
		installing-rasa: Installing Rasa
		installing-botfront: Installing Botfront, Import Botfront database dump to botfront database
		configuring-ssh-port: Set custom SSH port
		deployed: Final state if all is well
		errored: If anything goes catastrophically wrong during any of the processes. If this state is on, it can not be changed. This is a fatal non-recoverable failure and should only be used for those.
		*/
		bot.status = "pending";
		await bot.save();

		// TODO: CRITICAL, USE update here to merge arrays instead of checking each time to avoid race conditions

		// Add instance to master's pillar data
		// await Pillar.updateOne(
		//   { _id: config.salt.masterId },
		//   {
		//     $set: {
		//       instances: {
		//         $cond: [
		//           { $in: [bot.slug, ["$instances.name"]] },
		//           [{ name: "test" }],
		//           { $concatArrays: ["$instances", [{ name: bot.slug, test: true }]] },
		//         ],
		//       },
		//     },
		//   }
		// );

		const masterPillar = await Pillar.findById(config.salt.masterId);
		if (!masterPillar.instances.find((instance: { name: any }) => instance.name === bot.slug)) {
			masterPillar.instances.push({ name: bot.slug });
			masterPillar.save();
		}

		// Create pillar data for the new instance
		const minion = new Pillar();
		minion._id = bot.slug;
		minion.rasa = {
			authtoken: "", // There is a bug in Botfront and we can't set a secret yet
		};
		minion.botfront = {
			root_url: rootURL,
			username: bot.credentials.server.botfront[0].name,
			password: bot.credentials.server.botfront[0].password,
			firstname: bot.credentials.server.botfront[0].name,
			lastname: bot.credentials.server.botfront[0].name,
		};

		// Generate 2 passwords
		// One for mongo admin
		// One for botfront database
		const passwords = generatePassword.generateMultiple(2, {
			length: 20,
			uppercase: true,
			numbers: true,
			symbols: false
		});

		minion.mongodb = {
			server: {
				admin: {
					password: passwords[0]
				},
				databases: [
					{
						name: "botfront",
						users: {
							botfront: {
								password: passwords[1]
							}
						}
					}
				],
			},
		};
		await minion.save();
		bot.status = "deploying";
		await bot.save();

		// TODO: Critical: The issue here is, we need to make sure a highstate is not yet running. If it is, we can't run a new one but have to wait

		// Refresh pillar data
		const pillardataRefresh = await salt.fun(config.salt.masterId, "saltutil.refresh_pillar");
		logger.info("Refresh pillar data", JSON.stringify(pillardataRefresh));

		// DEPLOY BOT = State "cloud", this state loops salt-master pillar data instances and checks if server with instance name exists.
		// If server is not existing creates server with instance name to Hetzner cloud
		logger.info("State cloud started - Bot deploying");
		bot.logs.push({ log: "Bot deploying" });
		await bot.save();
		const cloudState = await salt.fun(config.salt.masterId, "state.apply", "cloud"); // TODO: Check if master is already deploying and await that before trying
		logger.info(`cloud results - ${JSON.stringify(cloudState)}`);
		bot.logs.push({ log: "state-cloud-results", json: cloudState });
		await bot.save();

		// States in order to run for creating new bot server
		const states = [
			{state: "system-update", initLogMessage: "Installing system updates", status: "installing-system-updates"},
			{state: "common", initLogMessage: "Configuring system security and settings", status: "configuring-system-settings"},
			{state: "api", initLogMessage: "Installing Nginx and NodeJS", status: "installing-nodejs-nginx"},
			{state: "firewall", initLogMessage: "Installing firewall", status: "installing-firewall"},
			{state: "mongodb", initLogMessage: "Installing MongoDB", status: "installing-mongodb"},
			{state: "rasa-for-botfront", initLogMessage: "Installing Rasa", status: "installing-rasa"},
			{state: "botfront", initLogMessage: "Installing Botfront", status: "installing-botfront"},
			{state: "set-ssh-port", initLogMessage: "Set custom SSH port", status: "configuring-ssh-port"},
		];

		for (const state of states) {
			logger.info(state.initLogMessage);
			bot.logs.push({ log: state.initLogMessage });
			bot.status = state.status;
			await bot.save();
			// Set state run count to zero on state run init
			stateRunCount = 0;

			try {
				await initStateRun(bot, state.state);
			} catch (error) {
				logger.error(error);
				throw error;
			}
		}
		logger.info("All states done");

		// Get details of the new instance
		// Fetch the IP address from salt by querying salt cloud module
		// Make sure the DNS record is created
		const instanceData = await salt.fun(config.salt.masterId, "cloud.get_instance", bot.slug);
		logger.info(`Instance data - ${JSON.stringify(instanceData.return[0])}`);
		bot.logs.push({ log: "botInstanceData", json:instanceData.return[0] });
		await bot.save();

		const dns = new DNS();
		dns.content = instanceData.return[0][config.salt.masterId].public_ips.ipv4; // Fetch from salt once known
		/*
				{
				  "return": [
					{
					  "salt-cloud-test": {
						"id": 14628612,
						"name": "minion1",
						"image": "ubuntu-20.04",
						"size": "cx11",
						"state": "running",
						"public_ips": {
						  "ipv4": "65.108.84.184",
						  "ipv6": "2a01:4f9:c011:61ac::/64"
						},
						"private_ips": [],
						"labels": {},
						"created": "2021-09-27 11:29:11+00:00",
						"datacenter": {
						  "name": "hel1-dc2",
						  "location": "hel1"
						},
						"volumes": []
					  }
					}
				  ]
				}
				*/
		dns.name = hostname;
		await dns.save();

		bot.status = "deployed";
		await bot.save();

		logger.info("Bot deployed succesfully");
		bot.logs.push({ log: "Bot deployed succesfully" });
		await bot.save();

	} catch (e) {
		logger.error(JSON.stringify(e));
		bot.logs.push({ log:"error", json:e });
		bot.status = "errored";
		await bot.save();
	}
});


async function initStateRun(bot: any, stateName: string): Promise<Object> {
	try {
		stateRunCount++;
		const runStateResults = await runState(bot, stateName);
		return runStateResults;
	} catch (error) {

			// Check if state max runTime exceeded
			if(stateRunCount >= 4) {
				throw {message: `Failed running salt state: ${stateName}, max runtimes (${stateRunCount}) exceeded`, error}
			}

			// States which try to re-run
			const tryAgainErrors = ["return-is-empty-object", "connection-lost"];

			if(tryAgainErrors.includes(error.errorType)) {
				// Re-Run state
				logger.verbose(`${stateName} - RE-RUN COUNT: ${stateRunCount}`);
				const sleepTime = Math.pow(5, stateRunCount) * 1000;
				logger.verbose(`SleepTime: ${sleepTime}`);
				await sleep(sleepTime);
				bot.logs.push({ log:"tryRunStateAgain", json:{stateName, stateReRunCount: stateRunCount} });
				await bot.save();
				await initStateRun(bot, stateName);
			}

			throw {message: `Failed running salt state: ${stateName}`, error}
		}
}

const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time));

export default router;
