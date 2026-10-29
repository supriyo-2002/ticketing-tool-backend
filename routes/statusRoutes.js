const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getStatuses,
} = require("../controllers/statusController");

/**
 * @swagger
 * /api/statuses:
 *   get:
 *     tags:
 *       - Statuses
 *     summary: Get all ticket statuses
 *     description: Returns all available ticket statuses that can be used when creating or updating tickets.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statuses retrieved successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - status_id: "fbd58ca3-0c53-4ef8-bb18-67cd63d2f939"
 *                   name: "Open"
 *                 - status_id: "82748b54-0f8e-4c65-a4d3-d2b0e6fd2d8a"
 *                   name: "In Progress"
 *                 - status_id: "7eb1c9f7-e3be-4f14-8394-2f56e665f2af"
 *                   name: "Resolved"
 *                 - status_id: "39741d6c-6fd5-45f8-95e8-0fd1e4a4f4d1"
 *                   name: "Closed"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Authentication required
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Failed to fetch statuses
 */
router.get("/", authMiddleware, getStatuses);

module.exports = router;