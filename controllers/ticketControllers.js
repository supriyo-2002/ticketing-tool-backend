
const { supabaseAdmin } = require("../config/supabase");

// Validate UUID values before using them in database queries.
const isValidUUID = (value) => {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    return typeof value === "string" && uuidRegex.test(value);
};

// Confirm that a project belongs to the authenticated user's organization.
const projectExists = async (projectId, organizationId) => {
    const { data, error } = await supabaseAdmin
        .from("projects")
        .select("project_id")
        .eq("project_id", projectId)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
};

// Confirm that an assignee belongs to the same organization.
const employeeExists = async (userId, organizationId) => {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("user_id")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
};

// Confirm that a status exists.
const statusExists = async (statusId) => {
    const { data, error } = await supabaseAdmin
        .from("statuses")
        .select("status_id")
        .eq("status_id", statusId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
};

// Confirm that a priority exists.
const priorityExists = async (priorityId) => {
    const { data, error } = await supabaseAdmin
        .from("priorities")
        .select("priority_id")
        .eq("priority_id", priorityId)
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
};

// Create a new ticket.
const createTicket = async (req, res) => {
    try {
        const { user_id, organization_id } = req.user || {};
        const {
            project_id,
            title,
            description,
            status_id,
            priority_id,
            assigned_to,
            due_date
        } = req.body || {};

        if (!user_id || !organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user or organization is missing."
            });
        }

        if (!isValidUUID(project_id)) {
            return res.status(400).json({
                success: false,
                message: "A valid project_id is required."
            });
        }

        if (typeof title !== "string" || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: "Ticket title is required."
            });
        }

        if (description !== undefined &&
            description !== null &&
            typeof description !== "string") {
            return res.status(400).json({
                success: false,
                message: "Description must be a string or null."
            });
        }

        if (!isValidUUID(status_id) || !isValidUUID(priority_id)) {
            return res.status(400).json({
                success: false,
                message: "Valid status_id and priority_id are required."
            });
        }

        if (assigned_to !== undefined &&
            assigned_to !== null &&
            !isValidUUID(assigned_to)) {
            return res.status(400).json({
                success: false,
                message: "assigned_to must be a valid user UUID or null."
            });
        }

        if (due_date !== undefined &&
            due_date !== null &&
            (typeof due_date !== "string" ||
             !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
             Number.isNaN(Date.parse(`${due_date}T00:00:00Z`)) ||
             new Date(`${due_date}T00:00:00Z`).toISOString().slice(0, 10) !== due_date)) {
            return res.status(400).json({
                success: false,
                message: "due_date must be a valid date in YYYY-MM-DD format or null."
            });
        }

        // Validate organization ownership and reference IDs.
        if (!(await projectExists(project_id, organization_id))) {
            return res.status(400).json({
                success: false,
                message: "The selected project does not exist in your organization."
            });
        }

        if (!(await statusExists(status_id))) {
            return res.status(400).json({
                success: false,
                message: "The selected status does not exist."
            });
        }

        if (!(await priorityExists(priority_id))) {
            return res.status(400).json({
                success: false,
                message: "The selected priority does not exist."
            });
        }

        if (assigned_to &&
            !(await employeeExists(assigned_to, organization_id))) {
            return res.status(400).json({
                success: false,
                message: "The selected assignee does not belong to your organization."
            });
        }

        const ticketData = {
            organization_id,
            project_id,
            title: title.trim(),
            description: typeof description === "string"
                ? description.trim() || null
                : null,
            status_id,
            priority_id,
            assigned_to: assigned_to || null,
            due_date: due_date || null,
            created_by: user_id
        };

        const { data: ticket, error } = await supabaseAdmin
            .from("tickets")
            .insert(ticketData)
            .select()
            .single();

        if (error) {
            console.error("Create ticket error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to create ticket."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Ticket created successfully.",
            data: ticket
        });

    } catch (error) {
        console.error("Unexpected create ticket error:", error.message);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while creating the ticket."
        });
    }
};

// Retrieve all tickets in the authenticated user's organization.
const getTickets = async (req, res) => {
    try {
        const { organization_id } = req.user || {};

        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        let query = supabaseAdmin
            .from("tickets")
            .select("*")
            .eq("organization_id", organization_id);

        // Optional filters make it easier to build dashboard views.
        const { project_id, assigned_to, status_id } = req.query;

        if (project_id !== undefined) {
            if (!isValidUUID(project_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid project_id format."
                });
            }
            query = query.eq("project_id", project_id);
        }

        if (assigned_to !== undefined) {
            if (!isValidUUID(assigned_to)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid assigned_to format."
                });
            }
            query = query.eq("assigned_to", assigned_to);
        }

        if (status_id !== undefined) {
            if (!isValidUUID(status_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status_id format."
                });
            }
            query = query.eq("status_id", status_id);
        }

        const { data: tickets, error } = await query
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Get tickets error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to retrieve tickets."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Tickets retrieved successfully.",
            count: tickets.length,
            data: tickets
        });

    } catch (error) {
        console.error("Unexpected get tickets error:", error.message);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving tickets."
        });
    }
};

// Retrieve one ticket belonging to the authenticated user's organization.
const getTicketById = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { organization_id } = req.user || {};

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format."
            });
        }

        const { data: ticket, error } = await supabaseAdmin
            .from("tickets")
            .select("*")
            .eq("ticket_id", ticketId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        if (error) {
            console.error("Get ticket by ID error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to retrieve the ticket."
            });
        }

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Ticket retrieved successfully.",
            data: ticket
        });

    } catch (error) {
        console.error("Unexpected get ticket by ID error:", error.message);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving the ticket."
        });
    }
};

// Update selected fields on an existing ticket.
const updateTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { user_id, organization_id } = req.user || {};
        const body = req.body || {};

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format."
            });
        }

        if (!organization_id || !user_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user or organization is missing."
            });
        }

        const allowedFields = [
            "project_id",
            "title",
            "description",
            "status_id",
            "priority_id",
            "assigned_to",
            "due_date"
        ];

        const suppliedFields = Object.keys(body);

        if (suppliedFields.length === 0 ||
            suppliedFields.some((field) => !allowedFields.includes(field))) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one supported ticket field to update."
            });
        }

        // Confirm that the ticket belongs to this organization.
        const { data: existingTicket, error: findError } = await supabaseAdmin
            .from("tickets")
            .select("ticket_id")
            .eq("ticket_id", ticketId)
            .eq("organization_id", organization_id)
            .maybeSingle();

        if (findError) {
            console.error("Find ticket error:", findError.message);
            return res.status(500).json({
                success: false,
                message: "Failed to retrieve the ticket."
            });
        }

        if (!existingTicket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found."
            });
        }

        const updateData = {};

        if (body.project_id !== undefined) {
            if (!isValidUUID(body.project_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid project_id format."
                });
            }

            if (!(await projectExists(body.project_id, organization_id))) {
                return res.status(400).json({
                    success: false,
                    message: "The selected project does not belong to your organization."
                });
            }
            updateData.project_id = body.project_id;
        }

        if (body.title !== undefined) {
            if (typeof body.title !== "string" || !body.title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Ticket title must be a non-empty string."
                });
            }
            updateData.title = body.title.trim();
        }

        if (body.description !== undefined) {
            if (body.description !== null &&
                typeof body.description !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Description must be a string or null."
                });
            }
            updateData.description = typeof body.description === "string"
                ? body.description.trim() || null
                : null;
        }

        if (body.status_id !== undefined) {
            if (!isValidUUID(body.status_id) ||
                !(await statusExists(body.status_id))) {
                return res.status(400).json({
                    success: false,
                    message: "The selected status is invalid."
                });
            }
            updateData.status_id = body.status_id;
        }

        if (body.priority_id !== undefined) {
            if (!isValidUUID(body.priority_id) ||
                !(await priorityExists(body.priority_id))) {
                return res.status(400).json({
                    success: false,
                    message: "The selected priority is invalid."
                });
            }
            updateData.priority_id = body.priority_id;
        }

        if (body.assigned_to !== undefined) {
            if (body.assigned_to !== null &&
                (!isValidUUID(body.assigned_to) ||
                 !(await employeeExists(body.assigned_to, organization_id)))) {
                return res.status(400).json({
                    success: false,
                    message: "The selected assignee is invalid for your organization."
                });
            }
            updateData.assigned_to = body.assigned_to;
        }

        if (body.due_date !== undefined) {
            if (body.due_date !== null &&
                (typeof body.due_date !== "string" ||
                 !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ||
                 Number.isNaN(Date.parse(`${body.due_date}T00:00:00Z`)) ||
                 new Date(`${body.due_date}T00:00:00Z`).toISOString().slice(0, 10) !== body.due_date)) {
                return res.status(400).json({
                    success: false,
                    message: "due_date must be a valid date in YYYY-MM-DD format or null."
                });
            }
            updateData.due_date = body.due_date;
        }

        // Keep the update timestamp current.
        updateData.updated_at = new Date().toISOString();

        const { data: ticket, error } = await supabaseAdmin
            .from("tickets")
            .update(updateData)
            .eq("ticket_id", ticketId)
            .eq("organization_id", organization_id)
            .select()
            .maybeSingle();

        if (error) {
            console.error("Update ticket error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to update the ticket."
            });
        }

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Ticket updated successfully.",
            data: ticket
        });

    } catch (error) {
        console.error("Unexpected update ticket error:", error.message);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while updating the ticket."
        });
    }
};

// Delete a ticket. Related comments and history may also be deleted by
// the ON DELETE CASCADE rules in the existing database schema.
const deleteTicket = async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { organization_id } = req.user || {};

        if (!isValidUUID(ticketId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format."
            });
        }

        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        const { data: ticket, error } = await supabaseAdmin
            .from("tickets")
            .delete()
            .eq("ticket_id", ticketId)
            .eq("organization_id", organization_id)
            .select("ticket_id, title")
            .maybeSingle();

        if (error) {
            console.error("Delete ticket error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Failed to delete the ticket."
            });
        }

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Ticket deleted successfully.",
            data: ticket
        });

    } catch (error) {
        console.error("Unexpected delete ticket error:", error.message);
        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while deleting the ticket."
        });
    }
};

module.exports = {
    createTicket,
    getTickets,
    getTicketById,
    updateTicket,
    deleteTicket
};
