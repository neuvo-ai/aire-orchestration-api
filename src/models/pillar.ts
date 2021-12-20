/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/ban-types */
import mongoose from "mongoose";

export interface PillarInterface extends mongoose.Document {
	_id: string;
    rasa: {
        authtoken: string
    },
    botfront: {
        root_url: string,
        username: string,
        password: string,
        firstname: string,
        lastname: string
    },
    mongodb: {

    },
    instances?: any
}

const PillarInstanceSchema: any = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: {
			unique: true,
            sparse: true
		}
    }
})

const PillarSchema: any = new mongoose.Schema({
	instances: {
		required: false,
		type: [PillarInstanceSchema]
	},
    _id: {
        type: String,
        required: true
    },
    rasa: {
        authtoken: String
    },
    botfront: {
        root_url: String,
        username: String,
        password: String,
        firstname: String,
        lastname: String
    },
    mongodb: {

    }
});

const Pillar = mongoose.model<PillarInterface>("Pillar", PillarSchema, "pillar");

export { Pillar };