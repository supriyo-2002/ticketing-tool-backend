const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { getDashboard } = require("../controllers/dashboardController");

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     tags:
 *       - Dashboard
 *     summary: Get dashboard statistics
 *     description: |
 *       Returns dashboard statistics based on the authenticated user's role.
 *
 *       ADMIN:
 *       - Total Projects
 *       - Total Employees
 *       - Total Tickets
 *       - Open Tickets
 *       - In Progress Tickets
 *       - Resolved Tickets
 *       - Closed Tickets
 *
 *       EMPLOYEE:
 *       - Assigned Tickets
 *       - Open Tickets
 *       - In Progress Tickets
 *       - Resolved Tickets
 *       - Closed Tickets
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             examples:
 *               Admin:
 *                 value:
 *                   success: true
 *                   data:
 *                     role: ADMIN
 *                     totalProjects: 5
 *                     totalEmployees: 10
 *                     totalTickets: 45
 *                     openTickets: 12
 *                     inProgressTickets: 8
 *                     resolvedTickets: 20
 *                     closedTickets: 5
 *
 *               Employee:
 *                 value:
 *                   success: true
 *                   data:
 *                     role: EMPLOYEE
 *                     assignedTickets: 8
 *                     openTickets: 3
 *                     inProgressTickets: 2
 *                     resolvedTickets: 2
 *                     closedTickets: 1
 *
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Authentication required
 *
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: You are not authorized to access the dashboard
 *
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             example:
 *               success: false
 *               message: Failed to retrieve dashboard statistics
 */
router.get("/", authMiddleware, getDashboard);

module.exports = router;