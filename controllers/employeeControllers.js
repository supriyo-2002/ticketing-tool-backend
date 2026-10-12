
const { supabaseAdmin } = require("../config/supabase");

// Get all employees belonging to the authenticated user's organization.
const getEmployees = async (req, res) => {
    try {
        // Get the organization ID added by authMiddleware.
        const { organization_id } = req.user || {};

        // Ensure the authenticated user has an organization.
        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        // Retrieve employees from this organization only.
        const { data: employees, error } = await supabaseAdmin
            .from("users")
            .select("user_id, name, email, role, created_at")
            .eq("organization_id", organization_id)
            .order("name", { ascending: true });

        // Handle database errors.
        if (error) {
            console.error("Get employees error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve employees."
            });
        }

        // Return the employee list and total count.
        return res.status(200).json({
            success: true,
            message: "Employees retrieved successfully.",
            count: employees.length,
            data: employees
        });

    } catch (error) {
        console.error("Unexpected get employees error:", error.message);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while retrieving employees."
        });
    }
};

module.exports = {
    getEmployees
};
