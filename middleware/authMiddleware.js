// Import both Supabase clients.
const {
    supabaseAuth,
    supabaseAdmin
} = require("../config/supabase");



// This middleware protects private API routes.
// Authorization: Bearer <access_token>
// Request
//    ↓
// Extract access token
//    ↓
// Verify token with Supabase Auth
//    ↓
// Find user in public.users
//    ↓
// Attach user to req.user
//    ↓
// Continue to controller


const authMiddleware = async (req, res, next) => {

    try {

        // STEP 1: Get Authorization header

        const authHeader = req.headers.authorization;

        // Check whether Authorization header exists.
        if (!authHeader) {

            return res.status(401).json({
                success: false,
                message: "Authorization token is required."
            });
        }


  
        // STEP 2: Check Bearer token format
        // Expected:
        // Authorization: Bearer eyJhbGciOi...

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


        // STEP 3: Verify token with Supabase Auth
    

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

        // STEP 4: Get application user
        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", authUser.id)
            .single();


        // Application user does not exist.
        if (userError || !user) {

            return res.status(403).json({
                success: false,
                message: "User profile not found."
            });
        }


      
        // STEP 5: Attach user information to request
        req.user = user;

        // Also keep the Supabase Auth user available.
        req.authUser = authUser;


       
        // STEP 6: Continue to controller
        next();


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