const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectStatuses,
} = require("../controllers/projectControllers");

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a project
 *     description: >
 *       Creates a project in the authenticated user's organization.
 *       The selected project status is required.
 *       The project creator is automatically added as a project member.
 *       Additional employees can be selected using member_ids.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - status_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: Website Redesign
 *                 description: Name of the project.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Redesign the company website
 *                 description: Optional description of the project.
 *               status_id:
 *                 type: string
 *                 format: uuid
 *                 example: 06fae65c-ef9e-4b13-8bc9-490299eef001
 *                 description: UUID of the selected project status.
 *               member_ids:
 *                 type: array
 *                 description: >
 *                   UUIDs of employees to add to the project.
 *                   All selected employees must belong to the authenticated
 *                   user's organization. The creator is added automatically.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *     responses:
 *       201:
 *         description: Project created successfully with project members and status.
 *       400:
 *         description: >
 *           Invalid project name, description, status_id, or member IDs.
 *       401:
 *         description: Missing or invalid authentication.
 *       403:
 *         description: User is not authorized to create projects.
 *       500:
 *         description: Server or database error.
 */
router.post("/", authMiddleware, createProject);

/**
 * @swagger
 * /api/projects/statuses:
 *   get:
 *     summary: Get all project statuses
 *     description: Returns all available project statuses for the project creation form.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project statuses retrieved successfully.
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
 *                   example: Project statuses retrieved successfully.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status_id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                         example: Active
 *       401:
 *         description: Authentication required.
 *       500:
 *         description: Server or database error.
 */
router.get("/statuses", authMiddleware, getProjectStatuses);

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: >
 *       Retrieves all projects belonging to the authenticated user's
 *       organization, including the details of their project members.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects and their members retrieved successfully.
 *       401:
 *         description: Missing or invalid authentication.
 *       500:
 *         description: Failed to retrieve projects or project members.
 */
router.get("/", authMiddleware, getProjects);

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get a project by ID
 *     description: >
 *       Retrieves a project belonging to the authenticated user's
 *       organization, including its associated project members.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the project.
 *     responses:
 *       200:
 *         description: Project and its members retrieved successfully.
 *       400:
 *         description: Invalid project ID format.
 *       401:
 *         description: Missing or invalid authentication.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to retrieve project or its members.
 */
router.get("/:projectId", authMiddleware, getProjectById);
/**
 * @swagger
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update a project
 *     description: >
 *       Updates a project's name, description, status, and/or project members.
 *       Any of these fields can be updated individually or together.
 *       When member_ids is supplied, it becomes the desired membership list.
 *       The original project creator is retained automatically.
 *       If member_ids is omitted, existing memberships remain unchanged.
 *       The supplied status_id must exist in the project_status table.
 *       All selected members must belong to the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the project to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Website Redesign
 *                 description: New project name.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Redesign the company website
 *                 description: New description, or null to clear it.
 *               status_id:
 *                 type: string
 *                 format: uuid
 *                 example: 33333333-3333-4333-8333-333333333333
 *                 description: UUID of the new project status.
 *               member_ids:
 *                 type: array
 *                 description: >
 *                   Desired list of project member user IDs.
 *                   The original project creator is retained automatically.
 *                   Sending an empty array removes all other members.
 *                   All supplied members must belong to the authenticated user's organization.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *           examples:
 *             updateEverything:
 *               summary: Update all project fields
 *               value:
 *                 name: Website Redesign
 *                 description: Updated website redesign project
 *                 status_id: 33333333-3333-4333-8333-333333333333
 *                 member_ids:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *             updateStatusOnly:
 *               summary: Update status only
 *               value:
 *                 status_id: 33333333-3333-4333-8333-333333333333
 *             updateMembersOnly:
 *               summary: Update members only
 *               value:
 *                 member_ids:
 *                   - 11111111-1111-4111-8111-111111111111
 *                   - 22222222-2222-4222-8222-222222222222
 *             updateDescriptionOnly:
 *               summary: Update description only
 *               value:
 *                 description: Updated project description
 *     responses:
 *       200:
 *         description: Project updated successfully, including its status and members.
 *       400:
 *         description: >
 *           Invalid project ID, project name, description, status ID,
 *           member IDs, or selected status/member validation failed.
 *       401:
 *         description: Missing authenticated user's organization or invalid authentication.
 *       404:
 *         description: Project not found.
 *       500:
 *         description: Failed to update the project, status, or its members.
 */
router.put("/:projectId", authMiddleware, updateProject);
/**
 * @swagger
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     description: >
 *       Deletes a project from the authenticated user's organization.
 *       Projects containing tickets cannot be deleted.
 *       The project ID must be a valid UUID, and the project must belong
 *       to the authenticated user's organization.
 *     tags:
 *       - Projects
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: UUID of the project to delete.
 *     responses:
 *       200:
 *         description: Project deleted successfully.
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
 *                   example: Project deleted successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     project_id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                       example: Website Redesign
 *       400:
 *         description: Invalid project ID format.
 *       401:
 *         description: Authenticated user's organization is missing.
 *       404:
 *         description: Project not found.
 *       409:
 *         description: Cannot delete a project because it contains tickets.
 *       500:
 *         description: Failed to retrieve, check, or delete the project.
 */
router.delete("/:projectId", authMiddleware, deleteProject);

module.exports = router;
