const express = require("express");
const router = express.Router();

const {
  createTicket,
  getTickets,
  getTicketById,
  updateTicket,
  deleteTicket,
} = require("../controllers/ticketControllers");

const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a ticket
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - project_id
 *               - title
 *               - status_id
 *               - priority_id
 *             properties:
 *               project_id:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *                 example: Fix login issue
 *               description:
 *                 type: string
 *                 nullable: true
 *               status_id:
 *                 type: string
 *                 format: uuid
 *               priority_id:
 *                 type: string
 *                 format: uuid
 *               assigned_to:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               due_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *       400:
 *         description: Invalid input or related record
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 *
 *   get:
 *     summary: Get all organization tickets
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by project
 *       - in: query
 *         name: assigned_to
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by assignee
 *       - in: query
 *         name: status_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Tickets retrieved successfully
 *       400:
 *         description: Invalid filter
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
router.post("/", authMiddleware, createTicket);
router.get("/", authMiddleware, getTickets);

/**
 * @swagger
 * /api/tickets/{ticketId}:
 *   get:
 *     summary: Get a ticket by ID
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket UUID
 *     responses:
 *       200:
 *         description: Ticket retrieved successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Ticket not found
 *       500:
 *         description: Server error
 *
 *   put:
 *     summary: Update a ticket
 *     description: Send only the fields that need to change.
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               project_id:
 *                 type: string
 *                 format: uuid
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               status_id:
 *                 type: string
 *                 format: uuid
 *               priority_id:
 *                 type: string
 *                 format: uuid
 *               assigned_to:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               due_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Ticket not found
 *       500:
 *         description: Server error
 *
 *   delete:
 *     summary: Delete a ticket
 *     description: Deletes the ticket and may also delete its related comments and history.
 *     tags:
 *       - Tickets
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ticket UUID
 *     responses:
 *       200:
 *         description: Ticket deleted successfully
 *       400:
 *         description: Invalid ticket ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Ticket not found
 *       500:
 *         description: Server error
 */
router.get("/:ticketId", authMiddleware, getTicketById);
router.put("/:ticketId", authMiddleware, updateTicket);
router.delete("/:ticketId", authMiddleware, deleteTicket);

module.exports = router;