/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/ban-types */
import mongoose from "mongoose";

export interface DNSInterface extends mongoose.Document {
	name: string;
	content: string;
    createdAt: Date;
    updatedAt: Date;
    _botId: mongoose.Types.ObjectId;
}


const DNSSchema: any = new mongoose.Schema({
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
    name: {
		type: String,
		required: true,
		index: {
			unique: true
		}
	},
	content: {
		type: String,
        required: true
	},
	_botId: {
		type: mongoose.Types.ObjectId
	},
});

const DNS: any = mongoose.model<DNSInterface>("Dns", DNSSchema);

export { DNS };