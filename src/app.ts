import express from "express";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser"
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";

import { errorHandler } from "./middleware/errorHandler.js";
// CONSTANTS
const PORT = process.env.PORT || 5000;
const API_BASE_URL= "/api/v1"

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

// Testing route
app.get(`${API_BASE_URL}/users`, async (req, res) => {
    const auth = getAuth(req);
    if(!auth.isAuthenticated){
        return res.status(401).json({
            message: "Not authorized"
        });
    }
    const user = await clerkClient.users.getUser(auth.userId);
    return res.status(200).json({
        user,
    });
})
// 404 Fallback
app.use((req, res, next) => {
    const error = new Error(`Not found = ${req.originalUrl}`);
    res.status(404);
    next(error);
})
// Error Handler
app.use(errorHandler)
app.listen(PORT, () => {
    console.log(`Nexus backend started successfully on port ${PORT}`)
})

export default app;