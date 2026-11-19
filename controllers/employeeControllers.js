
const { supabaseAdmin } = require("../config/supabase");

// -------------------------------------------------------------
// GET ALL EMPLOYEES
//
// Retrieves all users belonging to the authenticated user's
// organization, including their account status.
// -------------------------------------------------------------

const getEmployees = async (req, res) => {
    try {
        const { organization_id } = req.user || {};

        if (!organization_id) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user's organization is missing."
            });
        }

        const { data: employees, error } = await supabaseAdmin
            .from("users")
            .select(`
                user_id,
                organization_id,
                name,
                email,
                role,
                account_status,
                deactivated_at,
                deactivated_by,
                created_at
            `)
            .eq("organization_id", organization_id)
            .order("name", { ascending: true });

        if (error) {
            console.error("Get employees error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Failed to retrieve employees."
            });
        }

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


// -------------------------------------------------------------
// UPDATE EMPLOYEE ACCOUNT STATUS
//
// Only ADMIN can activate or deactivate employees.
//
// Request body:
// { "account_status": "INACTIVE" }
//
// or
//
// { "account_status": "ACTIVE" }
//
// Important:
// - Employees must belong to the same organization.
// - ADMIN accounts cannot be modified through this API.
// - An ADMIN cannot deactivate their own account.
// - Existing employee records and assignments are preserved.
// -------------------------------------------------------------

const updateEmployeeStatus = async (req, res) => {
    try {

        // STEP 1: Check whether the logged-in user is ADMIN.
        if (req.user.role !== "ADMIN") {
            return res.status(403).json({
                success: false,
                message: "Only ADMIN can change employee account status."
            });
        }

        // STEP 2: Get employee ID from URL and status from body.
        const { userId } = req.params;
        const { account_status } = req.body;

        // STEP 3: Validate employee ID.
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "Employee user ID is required."
            });
        }

        // STEP 4: Validate requested account status.
        if (!["ACTIVE", "INACTIVE"].includes(account_status)) {
            return res.status(400).json({
                success: false,
                message: "Account status must be ACTIVE or INACTIVE."
            });
        }

        // STEP 5: Prevent ADMIN from deactivating themselves.
        if (
            userId === req.user.user_id &&
            account_status === "INACTIVE"
        ) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account."
            });
        }

        // STEP 6: Find the target employee.
        // The organization filter prevents cross-organization access.
        const {
            data: employee,
            error: employeeError
        } = await supabaseAdmin
            .from("users")
            .select("user_id, name, email, role, account_status")
            .eq("user_id", userId)
            .eq("organization_id", req.user.organization_id)
            .maybeSingle();

        if (employeeError) {
            console.error("Find employee error:", employeeError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to verify employee."
            });
        }

        // Employee does not exist in this organization.
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found in your organization."
            });
        }

        // STEP 7: Only EMPLOYEE accounts can be modified.
        if (employee.role !== "EMPLOYEE") {
            return res.status(403).json({
                success: false,
                message: "This API can only change EMPLOYEE account status."
            });
        }

        // STEP 8: Prepare status update fields.
        const updateData = {
            account_status: account_status,
            deactivated_at:
                account_status === "INACTIVE"
                    ? new Date().toISOString()
                    : null,
            deactivated_by:
                account_status === "INACTIVE"
                    ? req.user.user_id
                    : null
        };

        // STEP 9: Update employee account status.
        const {
            data: updatedEmployee,
            error: updateError
        } = await supabaseAdmin
            .from("users")
            .update(updateData)
            .eq("user_id", userId)
            .eq("organization_id", req.user.organization_id)
            .select(`
                user_id,
                name,
                email,
                role,
                account_status,
                deactivated_at,
                deactivated_by
            `)
            .single();

        if (updateError) {
            console.error("Update employee status error:", updateError.message);

            return res.status(500).json({
                success: false,
                message: "Failed to update employee account status."
            });
        }

        // STEP 10: Return successful response.
        return res.status(200).json({
            success: true,
            message:
                account_status === "INACTIVE"
                    ? "Employee account deactivated successfully."
                    : "Employee account activated successfully.",
            data: updatedEmployee
        });

    } catch (error) {
        console.error("Unexpected update employee status error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred while updating employee status."
        });
    }
};


// -------------------------------------------------------------
// EXPORT CONTROLLERS
// -------------------------------------------------------------

module.exports = {
    getEmployees,
    updateEmployeeStatus
};
