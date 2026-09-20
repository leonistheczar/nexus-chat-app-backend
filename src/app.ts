import express from "express";
import "dotenv/config";
import cors from "cors";

const app = express();
app.use(cors({origin: "*", credentials: true}));
app.use(express.json());

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Nexus backend started successfully on port ${PORT}`)
})

export default app;