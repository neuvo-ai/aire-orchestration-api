/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/ban-types */
import mongoose from "mongoose";
// import bcrypt from "bcrypt";
// import logger from "../logger";

export interface BotInterface extends mongoose.Document {
	name: string;
	desc: string;
}

// Sub-document for AdminSchema
const BotCredentialSchema: any = new mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	password: {
		type: String,
		required: true
	},
	tombstoned: {
		type: Boolean,
		default: false
	}
});

const BotLogSchema: any = new mongoose.Schema({
	createdAt: {
		type: Date,
		default: Date.now,
		index: true
	},
	log: {
		type: String,
		required: false,
	},
	json: {
		type: Object,
		required: false,
	}
})

const BotSchema: any = new mongoose.Schema({
	createdAt: {
		type: Date,
		default: Date.now,
		index: true
	},
	updatedAt: {
		type: Date,
		default: Date.now,
		index: true
	},
	removedAt: {
		type: Date,
		index: true
	},
	deletedAt: {
		type: Date,
		index: true
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		index: true,
	},
	status: {
		type: String,
		default: "created"
	},
	tombstoned: {
		type: Boolean,
		default: false
	},
	name: {
		type: String,
		required: true,
		index: {
			unique: true
		}
	},
	slug: {
		type: String,
		required: true,
		index: {
			unique: true
		}
	},
	public: Boolean,
	url: {
		type: String,
		required: false
	},
	desc: {
		type: String,
		default: ""
	},
	projectId: {
		type: String,
		required: true,
	},
	credentials: {
		server: {
			databases: [BotCredentialSchema],
			botfront: [BotCredentialSchema]
		}
	},
	logs: {
		required: false,
		type: [BotLogSchema]
	},
});

const Bot: any = mongoose.model<BotInterface>("Bot", BotSchema);

export { Bot };