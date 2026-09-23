import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());


app.get("/health", (req, res) => {
    res.json({
        status: "UP"
    });
});


export default app;