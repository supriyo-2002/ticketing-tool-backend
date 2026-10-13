const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const dotenv = require("dotenv");

// Import routes
const authRoutes = require("./routes/authRoutes");
const inviteRoutes = require("./routes/inviteRoutes");
const projectRoutes = require("./routes/projectRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
// Initialize Express app
const app = express();
// Load environment variables from .env file
dotenv.config();
const PORT = process.env.PORT || 5000;


// Middleware 
app.use(express.json());

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth", inviteRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/tickets", ticketRoutes);
// Health check
app.get("/", (req, res) => {
    res.json({
        message: "Ticketing Tool Backend is running",
        database: "Connected",
        swagger: "Running",
    });
});

// app.listen(PORT, () => {
//     console.log("Ticketing Tool Backend");
//     console.log("=================================");
//     console.log(`Server:   http://localhost:${PORT}`);
//     console.log(`Swagger:  http://localhost:${PORT}/api-docs`);
//     console.log("Database: Connected");
// });