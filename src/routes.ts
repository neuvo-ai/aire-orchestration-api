import express from "express";
const app = express();
import orchestrate from "./routes/orchestrate";

app.disable("x-powered-by");

app.use((err: express.Errback, req: express.Request, res: express.Response, next: express.NextFunction) => {
	res.status(500);
	res.json({ error: err });
	next();
});

app.use("/orchestrate", orchestrate);

export default app;
