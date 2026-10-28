// Import swagger-jsdoc.
// This package generates an OpenAPI specification
// from our Swagger configuration and API comments.
const swaggerJsdoc = require("swagger-jsdoc");

// Swagger/OpenAPI configuration.
const options = {
  definition: {
    // OpenAPI specification version.
    openapi: "3.0.0",

    // Basic information about our API.
    info: {
      title: "Ticketing Tool API",
      version: "1.0.0",
      description: "API documentation for the Ticketing Tool",
    },

    // Base URL of our backend API.
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? "https://ticketing-tool-backend-teal.vercel.app"
            : "http://localhost:5000",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },

  // Swagger will look for API documentation
  // inside JavaScript files in the routes folder.
  apis: ["./routes/*.js"],
};

// Generate the Swagger specification.
const swaggerSpec = swaggerJsdoc(options);

// Export the generated Swagger specification.
module.exports = swaggerSpec;
