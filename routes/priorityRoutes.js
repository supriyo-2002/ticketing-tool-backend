const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
  getPriorities,
} = require("../controllers/priorityController");

/**
 * @swagger
 * /api/priorities:
 *   get:
 *     tags:
 *       - Priorities
 *     summary: Get all ticket priorities
 *     description: Returns all available ticket priorities that can be used when creating or updating tickets.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Priorities retrieved successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 - priority_id: "c0f879eb-ec5b-4fc0-81da-6af2d6f18e91"
 *                   name: "Low"
 *                 - priority_id: "5a6fbb21-8c95-4a89-a0fe-7c0a5c3e4d32"
 *                   name: "Medium"
 *                 - priority_id: "97d6c563-0c55-4c1d-bc61-f70648e61c56"
 *                   name: "High"
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
 *               message: Failed to fetch priorities
 */
router.get("/", authMiddleware, getPriorities);

module.exports = router;