import express from "express";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser"
import { clerkMiddleware } from "@clerk/express";

import { errorHandler } from "./middlewares/errorHandler.js";
import selfChatRoutes from "./routes/selfChatRoutes.js";
import userRoutes from "./routes/userRoutes.js";
// CONSTANTS
const PORT = process.env.PORT || 5000;
const API_BASE_PATH = `/${(process.env.API_BASE_URL)}`;

// Express App
const app = express();

// CORS Allowed Origins
const allowedOrigins = [
    "http://localhost:3000"
]
// Middlewares
app.use(cors({origin: allowedOrigins, credentials: true}));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(cookieParser())
app.use(clerkMiddleware());

// User(s) Routes
app.use(`${API_BASE_PATH}/`, userRoutes)
app.use(`${API_BASE_PATH}/`, selfChatRoutes)
// 404 Fallback
app.use((req, res, next) => {
    const error = new Error(`Not found = Cannot process this request`);
    res.status(404);
    next(error);
})
// Error Handler
app.use(errorHandler)
app.listen(PORT, () => {
    console.log(`${PORT}/${process.env.API_BASE_URL}/`)
    console.log(`Nexus backend started successfully on port ${PORT}`)
})

export default app;
