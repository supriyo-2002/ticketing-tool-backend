
// Import both Supabase clients.
const {
    supabaseAuth,
    supabaseAdmin
} = require("../config/supabase");

// -------------------------------------------------------------
// AUTHENTICATION MIDDLEWARE
//
// Authorization: Bearer <access_token>
//
// Request flow:
// 1. Extract access token.
// 2. Verify token with Supabase Auth.
// 3. Find user in public.users.
// 4. Check account status.
// 5. Attach user to req.user.
// 6. Continue to the protected controller.
// -------------------------------------------------------------

const authMiddleware = async (req, res, next) => {
    try {

        // STEP 1: Get Authorization header.
        const authHeader = req.headers.authorization;

        // Check whether Authorization header exists.
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required."
            });
        }

        // STEP 2: Check Bearer token format.
        // Expected: Authorization: Bearer <access_token>
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format. Use Bearer token."
            });
        }

        // Extract token from header.
        const accessToken = authHeader.split(" ")[1];

        // Make sure token actually exists.
        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Access token is missing."
            });
        }

        // STEP 3: Verify token with Supabase Auth.
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.getUser(accessToken);

        // Token is invalid or expired.
        if (authError || !authData.user) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired access token."
            });
        }

        // Supabase Auth user.
        const authUser = authData.user;

        // STEP 4: Get application user from public.users.
        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", authUser.id)
            .maybeSingle();

        // Handle database errors.
        if (userError) {
            console.error("User profile lookup error:", userError.message);

            return res.status(500).json({
                success: false,
                message: "Unable to verify your user profile."
            });
        }

        // Application user does not exist.
        if (!user) {
            return res.status(403).json({
                success: false,
                message: "User profile not found."
            });
        }

        // STEP 5: Check application account status.
        // Only ACTIVE accounts can access protected APIs.
        if (user.account_status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is not active."
            });
        }

        // STEP 6: Attach user information to request.
        req.user = user;

        // Also keep the Supabase Auth user available.
        req.authUser = authUser;

        // STEP 7: Continue to the protected controller.
        return next();

    } catch (error) {

        console.error("Authentication middleware error:", error);

        return res.status(500).json({
            success: false,
            message: "Authentication verification failed."
        });
    }
};

// Export middleware.
module.exports = authMiddleware;
