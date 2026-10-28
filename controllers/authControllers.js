// Import both Supabase clients.
// supabaseAuth:
// Used for creating the authentication account.
// supabaseAdmin:
// Used for trusted backend database operations.
const {
    supabaseAuth,
    supabaseAdmin
} = require("../config/supabase");



// Register a new organization and create its first ADMIN user.
const registerOrganization = async (req, res) => {
    try {
        // STEP 1: Get registration details from the request body.
        const {
            name,
            email,
            password,
            organizationName
        } = req.body;

        // STEP 2: Validate the required fields.
        if (
            !name?.trim() ||
            !email?.trim() ||
            !password ||
            !organizationName?.trim()
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Name, email, password and organization name are required."
            });
        }

        // STEP 3: Validate the email format.
        const normalizedEmail = email.trim().toLowerCase();

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address."
            });
        }

        // STEP 4: Validate the password.
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        // STEP 5: Prevent an authenticated user from registering again.
        // The frontend should send the access token if a session exists.
        const authorization = req.headers.authorization;

        if (authorization) {
            const [scheme, accessToken] = authorization.split(" ");

            // Reject malformed authorization headers.
            if (
                scheme?.toLowerCase() !== "bearer" ||
                !accessToken
            ) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid authorization header."
                });
            }

            // Verify the access token with Supabase.
            const {
                data: { user: authenticatedUser },
                error: tokenError
            } = await supabaseAuth.auth.getUser(accessToken);

            // Reject expired or invalid sessions.
            if (tokenError || !authenticatedUser) {
                return res.status(401).json({
                    success: false,
                    message: "Your session is invalid or expired."
                });
            }

            // Authenticated users must not register another organization.
            return res.status(409).json({
                success: false,
                message:
                    "You are already logged in. Please log out before registering."
            });
        }

        // STEP 6: Configure the email confirmation redirect.
        // Add this URL to Supabase Authentication's allowed redirect URLs.
        const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:5173"
        ).replace(/\/+$/, "");

        // STEP 7: Create the Supabase Auth account.
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                emailRedirectTo: `${frontendUrl}/thank-you`,
                data: {
                    name: name.trim()
                }
            }
        });

        // Handle Supabase authentication errors.
        if (authError) {
            console.error("Supabase signup error:", authError.message);

            return res.status(400).json({
                success: false,
                message: authError.message
            });
        }

        // Ensure that Supabase returned a user.
        if (!authData.user) {
            return res.status(400).json({
                success: false,
                message: "Unable to create the authentication account."
            });
        }

        const authUser = authData.user;

        // If Supabase returns no identities, the email may already
        // belong to an existing account. Avoid creating duplicate
        // organization and profile records.
        if (
            authUser.identities &&
            authUser.identities.length === 0
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "This email may already be registered. Please log in or request a confirmation email."
            });
        }

        // STEP 8: Create the organization.
        const {
            data: organization,
            error: organizationError
        } = await supabaseAdmin
            .from("organizations")
            .insert({
                name: organizationName.trim()
            })
            .select()
            .single();

        // If organization creation fails, remove the newly created
        // Auth account on a best-effort basis.
        if (organizationError) {
            console.error(
                "Organization creation error:",
                organizationError.message
            );

            const { error: cleanupError } =
                await supabaseAdmin.auth.admin.deleteUser(authUser.id);

            if (cleanupError) {
                console.error(
                    "Auth account cleanup error:",
                    cleanupError.message
                );
            }

            return res.status(500).json({
                success: false,
                message: "Organization creation failed."
            });
        }

        // STEP 9: Create the application user profile.
        // The organization creator automatically becomes ADMIN.
        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .insert({
                user_id: authUser.id,
                organization_id: organization.organization_id,
                name: name.trim(),
                email: normalizedEmail,
                role: "ADMIN"
            })
            .select()
            .single();

        // If profile creation fails, clean up the organization and
        // Auth account on a best-effort basis.
        if (userError) {
            console.error(
                "User profile creation error:",
                userError.message
            );

            const { error: organizationCleanupError } =
                await supabaseAdmin
                    .from("organizations")
                    .delete()
                    .eq("organization_id", organization.organization_id);

            if (organizationCleanupError) {
                console.error(
                    "Organization cleanup error:",
                    organizationCleanupError.message
                );
            }

            const { error: authCleanupError } =
                await supabaseAdmin.auth.admin.deleteUser(authUser.id);

            if (authCleanupError) {
                console.error(
                    "Auth account cleanup error:",
                    authCleanupError.message
                );
            }

            return res.status(500).json({
                success: false,
                message: "User profile creation failed."
            });
        }

        // STEP 10: Return successful registration.
        // Email confirmation may be pending, so do not assume that
        // registration automatically establishes a login session.
        return res.status(201).json({
            success: true,
            message:
                "Registration successful. Please check your email and confirm your account before logging in.",
            data: {
                user,
                organization,
                emailConfirmationRequired: !authData.session
            }
        });

    } catch (error) {
        // Log unexpected errors for backend debugging.
        console.error("Registration controller error:", error);

        return res.status(500).json({
            success: false,
            message: "An internal server error occurred."
        });
    }
};

// 1. Validate email and password.
// 2. Authenticate the user through Supabase Auth.
// 3. Retrieve the application profile.
// 4. Validate the user's role.
// 5. Return the user profile and authentication session.
// -------------------------------------------------------------
const login = async (req, res) => {
    try {
        // STEP 1: Get login credentials from the request body.
        const {
            email,
            password
        } = req.body;

        // STEP 2: Validate required fields.
        if (!email?.trim() || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        // Normalize the email to avoid case-related mismatches.
        const normalizedEmail = email.trim().toLowerCase();

        // STEP 3: Authenticate the user with Supabase Auth.
        // Supabase verifies the email and password and checks
        // whether the account is allowed to sign in.
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.signInWithPassword({
            email: normalizedEmail,
            password
        });

        // Handle invalid credentials or unconfirmed email.
        if (authError) {
            return res.status(401).json({
                success: false,
                message: authError.message
            });
        }

        // Ensure Supabase returned a valid authenticated session.
        if (!authData.user || !authData.session) {
            return res.status(401).json({
                success: false,
                message: "Unable to establish an authenticated session."
            });
        }

        // STEP 4: Retrieve the application user profile.
        // The Supabase Auth user ID matches users.user_id.
        // The admin client can query the table despite RLS.
        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .select(`
                user_id,
                organization_id,
                name,
                email,
                role
            `)
            .eq("user_id", authData.user.id)
            .maybeSingle();

        // Handle database errors.
        if (userError) {
            console.error(
                "Login profile fetch error:",
                userError
            );

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve your user profile."
            });
        }

        // Reject authenticated accounts without an application profile.
        if (!user) {
            return res.status(403).json({
                success: false,
                message:
                    "Your application profile was not found. Please contact your administrator."
            });
        }

        // STEP 5: Validate the application role.
        // Both ADMIN and EMPLOYEE are permitted to log in.
        if (!["ADMIN", "EMPLOYEE"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Your account does not have a valid application role."
            });
        }

        // STEP 6: Return the user profile and session.
        // The frontend can use the access token when calling
        // protected backend APIs.
        return res.status(200).json({
            success: true,
            message: "Login successful.",
            data: {
                user: {
                    user_id: user.user_id,
                    organization_id: user.organization_id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                session: authData.session
            }
        });

    } catch (error) {
        // Log unexpected errors for backend debugging.
        console.error("Login controller error:", error);

        return res.status(500).json({
            success: false,
            message: "An internal server error occurred."
        });
    }
};



// Export controller.
module.exports = {
    registerOrganization,
    login
};