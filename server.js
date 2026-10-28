const express = require("express");
const dotenv = require("dotenv");

// Load environment variables before importing configuration.
dotenv.config();

const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

// Import API routes.
const authRoutes = require("./routes/authRoutes");
const inviteRoutes = require("./routes/inviteRoutes");
const projectRoutes = require("./routes/projectRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

// Initialize the Express application.
const app = express();
const PORT = process.env.PORT || 5000;

// Configure CORS.
// This allows frontend applications from different origins to call the API.
// Restrict the allowed origins before using this configuration in production.
app.use(cors());

// Handle incoming JSON request bodies.
app.use(express.json());

// Expose the OpenAPI specification for Postman.
app.get("/openapi.json", (req, res) => {
    res.status(200).json(swaggerSpec);
});

// Serve the Swagger UI.
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

// Register API routes.
app.use("/api/auth", authRoutes);
app.use("/api/auth", inviteRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health-check endpoint.
app.get("/", (req, res) => {
    res.status(200).json({
        message: "Ticketing Tool Backend is running",
        database: "Connected",
        swagger: "Running",
    });
});

// Start the server locally.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log("Ticketing Tool Backend");
        console.log("=================================");
        console.log(`Server:  http://localhost:${PORT}`);
        console.log(`Swagger: http://localhost:${PORT}/api-docs`);
    });
}

// Export the Express application for Vercel.
module.exports = app;