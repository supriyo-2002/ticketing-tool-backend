const express = require("express");
const router = express.Router();

const { getEmployees } = require("../controllers/employeeControllers");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: Get all employees
 *     description: Retrieves employees belonging to the authenticated user's organization.
 *     tags:
 *       - Employees
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employees retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Employees retrieved successfully.
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum:
 *                           - ADMIN
 *                           - EMPLOYEE
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication or organization context missing
 *       500:
 *         description: Server error
 */

// Retrieve employees for the authenticated user's organization.
router.get("/", authMiddleware, getEmployees);

module.exports = router;