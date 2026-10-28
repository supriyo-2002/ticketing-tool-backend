// Import the Supabase admin client.
// This should match the client export in your existing config/supabase.js file.
const { supabaseAdmin } = require("../config/supabase");

// -------------------------------------------------------------
// HELPER: Count tickets using organization, status, and assignee.
// Optional filters let us reuse the same function for both roles.
// -------------------------------------------------------------
const getTicketCount = async ({
    organizationId,
    statusId = null,
    userId = null
}) => {
    // Start with a count query that does not download ticket records.
    let query = supabaseAdmin
        .from("tickets")
        .select("ticket_id", {
            count: "exact",
            head: true
        })
        .eq("organization_id", organizationId);

    // Filter by status when a status ID is provided.
    if (statusId) {
        query = query.eq("status_id", statusId);
    }

    // Filter by assignee for employee-specific statistics.
    if (userId) {
        query = query.eq("assigned_to", userId);
    }

    // Execute the query and return the exact count.
    const { count, error } = await query;

    if (error) {
        throw error;
    }

    return count ?? 0;
};

// -------------------------------------------------------------
// CONTROLLER: Get dashboard statistics for the logged-in user.
// ADMIN receives organization-wide statistics.
// EMPLOYEE receives statistics for tickets assigned to them.
// -------------------------------------------------------------
const getDashboard = async (req, res) => {
    try {
        // STEP 1: Read the authenticated user's details.
        // These values must be set by authMiddleware.
        const { user_id, organization_id, role } = req.user || {};

        // STEP 2: Verify that authentication supplied the required data.
        if (!user_id || !organization_id || !role) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user information is incomplete."
            });
        }

        // STEP 3: Accept only the two roles used by this application.
        if (!["ADMIN", "EMPLOYEE"].includes(role)) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to access the dashboard."
            });
        }

        // STEP 4: Retrieve the status IDs from the statuses table.
        // The names must match your seeded values exactly.
        const requiredStatuses = [
            "Open",
            "In Progress",
            "Resolved",
            "Closed"
        ];

        const { data: statuses, error: statusError } = await supabaseAdmin
            .from("statuses")
            .select("status_id, name")
            .in("name", requiredStatuses);

        if (statusError) {
            throw statusError;
        }

        // Create a lookup object so we can find a status ID by its name.
        const statusIds = {};

        for (const status of statuses || []) {
            statusIds[status.name] = status.status_id;
        }

        // If a required status is missing, report a configuration error
        // instead of returning misleading dashboard statistics.
        const missingStatuses = requiredStatuses.filter(
            (name) => !statusIds[name]
        );

        if (missingStatuses.length > 0) {
            return res.status(500).json({
                success: false,
                message: "Some required ticket statuses are missing.",
                missingStatuses
            });
        }

        // STEP 5: Return organization-wide statistics for ADMIN.
        if (role === "ADMIN") {
            // Run independent count queries in parallel for better performance.
            const [
                projectsResult,
                employeesResult,
                totalTickets,
                openTickets,
                inProgressTickets,
                resolvedTickets,
                closedTickets
            ] = await Promise.all([
                // Count all projects belonging to the Admin's organization.
                supabaseAdmin
                    .from("projects")
                    .select("project_id", { count: "exact", head: true })
                    .eq("organization_id", organization_id),

                // Count employees, excluding Admin accounts.
                supabaseAdmin
                    .from("users")
                    .select("user_id", { count: "exact", head: true })
                    .eq("organization_id", organization_id)
                    .eq("role", "EMPLOYEE"),

                // Count all tickets in this organization.
                getTicketCount({
                    organizationId: organization_id
                }),

                // Count tickets in each status across the organization.
                getTicketCount({
                    organizationId: organization_id,
                    statusId: statusIds["Open"]
                }),

                getTicketCount({
                    organizationId: organization_id,
                    statusId: statusIds["In Progress"]
                }),

                getTicketCount({
                    organizationId: organization_id,
                    statusId: statusIds["Resolved"]
                }),

                getTicketCount({
                    organizationId: organization_id,
                    statusId: statusIds["Closed"]
                })
            ]);

            // Check errors from the project and employee count queries.
            if (projectsResult.error) {
                throw projectsResult.error;
            }

            if (employeesResult.error) {
                throw employeesResult.error;
            }

            // STEP 6: Send the Admin dashboard response.
            return res.status(200).json({
                success: true,
                data: {
                    role: "ADMIN",
                    totalProjects: projectsResult.count ?? 0,
                    totalEmployees: employeesResult.count ?? 0,
                    totalTickets,
                    openTickets,
                    inProgressTickets,
                    resolvedTickets,
                    closedTickets
                }
            });
        }

        // STEP 7: Return assigned-ticket statistics for EMPLOYEE.
        // Both organization_id and assigned_to are used to scope the counts.
        const [
            assignedTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            closedTickets
        ] = await Promise.all([
            // Count every ticket assigned to this employee.
            getTicketCount({
                organizationId: organization_id,
                userId: user_id
            }),

            // Count the employee's assigned tickets by status.
            getTicketCount({
                organizationId: organization_id,
                statusId: statusIds["Open"],
                userId: user_id
            }),

            getTicketCount({
                organizationId: organization_id,
                statusId: statusIds["In Progress"],
                userId: user_id
            }),

            getTicketCount({
                organizationId: organization_id,
                statusId: statusIds["Resolved"],
                userId: user_id
            }),

            getTicketCount({
                organizationId: organization_id,
                statusId: statusIds["Closed"],
                userId: user_id
            })
        ]);

        // STEP 8: Send the Employee dashboard response.
        return res.status(200).json({
            success: true,
            data: {
                role: "EMPLOYEE",
                assignedTickets,
                openTickets,
                inProgressTickets,
                resolvedTickets,
                closedTickets
            }
        });
    } catch (error) {
        // Log the technical error on the server for debugging.
        console.error("Get Dashboard Error:", error);

        // Return a safe message to the API caller.
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve dashboard statistics."
        });
    }
};

// Export the controller so the route can use it.
module.exports = {
    getDashboard
};