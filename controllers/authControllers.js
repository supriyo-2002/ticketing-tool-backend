
// Import both Supabase clients.
// supabaseAuth: Handles user authentication.
// supabaseAdmin: Handles trusted backend database operations.
const { supabaseAuth, supabaseAdmin } = require("../config/supabase");
const { createClient } = require("@supabase/supabase-js");

// -------------------------------------------------------------
// HELPER: Extract and validate the Bearer token.
// -------------------------------------------------------------
const getAccessToken = (req) => {
    const authorization = req.headers.authorization;

    if (!authorization) {
        return null;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    return match ? match[1].trim() : null;
};

// -------------------------------------------------------------
// HELPER: Revoke a session without interrupting the main flow
// if the cleanup request itself fails.
// -------------------------------------------------------------
const revokeSession = async (accessToken) => {
    try {
        if (!accessToken) return;

        const { error } = await supabaseAdmin.auth.admin.signOut(
            accessToken,
            "local"
        );

        if (error) {
            console.error("Session revocation error:", error.message);
        }
    } catch (error) {
        console.error("Session revocation failed:", error.message);
    }
};

// -------------------------------------------------------------
// 1. REGISTER ORGANIZATION
//
// Creates the Supabase Auth account and sends a confirmation email.
// The organization and public.users profile are created only
// after the user confirms their email.
// -------------------------------------------------------------
const registerOrganization = async (req, res) => {
    try {
        // STEP 1: Get registration details.
        const {
            name,
            email,
            password,
            confirmPassword,
            organizationName
        } = req.body;

        // STEP 2: Validate required fields.
        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            !password ||
            typeof confirmPassword !== "string" ||
            !confirmPassword ||
            typeof organizationName !== "string" ||
            !organizationName.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "All registration fields are required."
            });
        }

        // STEP 3: Normalize the email address.
        const normalizedEmail = email.trim().toLowerCase();

        // STEP 4: Validate email format.
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address."
            });
        }

        // STEP 5: Validate password strength.
        // Requirements:
        // - Minimum 8 characters.
        // - At least one uppercase letter.
        // - At least one lowercase letter.
        // - At least one number.
        const passwordPattern =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if (!passwordPattern.test(password)) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must contain at least 8 characters, one uppercase letter, one lowercase letter and one number."
            });
        }

        // STEP 6: Verify password confirmation.
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Password and confirm password do not match."
            });
        }

        // STEP 7: Prevent an already authenticated user
        // from registering another organization.
        const authorization = req.headers.authorization;

        if (authorization) {
            const accessToken = getAccessToken(req);

            if (!accessToken) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid authorization header."
                });
            }

            const {
                data: { user: authenticatedUser },
                error: tokenError
            } = await supabaseAuth.auth.getUser(accessToken);

            if (tokenError || !authenticatedUser) {
                return res.status(401).json({
                    success: false,
                    message: "Your session is invalid or expired."
                });
            }

            return res.status(409).json({
                success: false,
                message:
                    "You are already logged in. Please log out before registering."
            });
        }

        // STEP 8: Check whether this email already has
        // an application profile.
        const {
            data: existingUser,
            error: existingUserError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .ilike("email", normalizedEmail)
            .maybeSingle();

        if (existingUserError) {
            console.error(
                "Existing user lookup error:",
                existingUserError.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify the registration email."
            });
        }

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "This email is already registered. Please log in."
            });
        }

        // STEP 9: Configure the existing Thank You page redirect.
        const frontendUrl = (
            process.env.FRONTEND_URL || "http://localhost:5173"
        ).replace(/\/+$/, "");

        // STEP 10: Create the Supabase Auth account.
        // No organization or public.users record is created here.
        const { data: authData, error: authError } =
            await supabaseAuth.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    emailRedirectTo: `${frontendUrl}/thank-you`,

                    // Store registration details temporarily in Auth metadata.
                    // Never store passwords in metadata.
                    data: {
                        name: name.trim(),
                        organization_name: organizationName.trim()
                    }
                }
            });

        // STEP 11: Handle Supabase signup errors.
        if (authError) {
            console.error("Supabase signup error:", authError.message);

            return res.status(400).json({
                success: false,
                message: "Unable to register. Please try again."
            });
        }

        // STEP 12: Verify Supabase returned a user.
        if (!authData.user) {
            return res.status(400).json({
                success: false,
                message: "Unable to create the authentication account."
            });
        }

        // STEP 13: Handle an existing or pending Auth account.
        if (
            authData.user.identities &&
            authData.user.identities.length === 0
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "This email is already registered or awaiting email confirmation. Please log in or request a confirmation email."
            });
        }

        // STEP 14: Return registration success.
        return res.status(201).json({
            success: true,
            message:
                "Registration submitted successfully. Please check your email and confirm your account.",
            data: {
                userId: authData.user.id,
                email: normalizedEmail,
                emailConfirmationRequired: !authData.session
            }
        });

    } catch (error) {
        console.error("Registration controller error:", error);

        return res.status(500).json({
            success: false,
            message: "An internal server error occurred."
        });
    }
};

// -------------------------------------------------------------
// 2. COMPLETE ORGANIZATION REGISTRATION
//
// Called after the user confirms their email.
// Creates the organization and the first ADMIN profile.
// -------------------------------------------------------------
const completeOrganizationRegistration = async (req, res) => {
    // Track organization creation so cleanup is safe.
    let createdOrganizationId = null;
    let userCreated = false;

    try {
        // STEP 1: Extract the access token.
        const accessToken = getAccessToken(req);

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "A valid Bearer authorization token is required."
            });
        }

        // STEP 2: Verify the Supabase Auth user.
        const {
            data: { user: authUser },
            error: authError
        } = await supabaseAuth.auth.getUser(accessToken);

        if (authError || !authUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired session."
            });
        }

        // STEP 3: Require email confirmation.
        if (!authUser.email_confirmed_at) {
            return res.status(403).json({
                success: false,
                message:
                    "Please confirm your email before completing registration."
            });
        }

        // STEP 4: Retrieve registration details from Auth metadata.
        const name = authUser.user_metadata?.name?.trim();
        const organizationName =
            authUser.user_metadata?.organization_name?.trim();
        const normalizedEmail = authUser.email?.trim().toLowerCase();

        if (!name || !organizationName || !normalizedEmail) {
            return res.status(400).json({
                success: false,
                message:
                    "Registration details are missing. Please contact support."
            });
        }

        // STEP 5: Check whether registration was already completed.
        // This prevents duplicate organization creation on repeated requests.
        const {
            data: existingProfile,
            error: profileLookupError
        } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("user_id", authUser.id)
            .maybeSingle();

        if (profileLookupError) {
            throw profileLookupError;
        }

        // If the profile exists, return its existing organization.
        if (existingProfile) {
            const {
                data: existingOrganization,
                error: organizationLookupError
            } = await supabaseAdmin
                .from("organizations")
                .select("*")
                .eq(
                    "organization_id",
                    existingProfile.organization_id
                )
                .single();

            if (organizationLookupError) {
                throw organizationLookupError;
            }

            return res.status(200).json({
                success: true,
                message: "Registration has already been completed.",
                data: {
                    user: existingProfile,
                    organization: existingOrganization
                }
            });
        }

        // STEP 6: Prevent the same email from belonging
        // to another application profile.
        const {
            data: duplicateEmail,
            error: duplicateEmailError
        } = await supabaseAdmin
            .from("users")
            .select("user_id")
            .ilike("email", normalizedEmail)
            .maybeSingle();

        if (duplicateEmailError) {
            throw duplicateEmailError;
        }

        if (duplicateEmail) {
            return res.status(409).json({
                success: false,
                message:
                    "This email already belongs to another registered account."
            });
        }

        // STEP 7: Create the organization.
        // The database unique index prevents duplicate names,
        // ignoring letter case and surrounding spaces.
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

        // PostgreSQL error 23505 means a unique constraint was violated.
        if (organizationError?.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "An organization with this name already exists. Please use a different organization name."
            });
        }

        if (organizationError) {
            throw organizationError;
        }

        // Remember the new organization ID for possible cleanup.
        createdOrganizationId = organization.organization_id;

        // STEP 8: Create the application profile.
        // The organization creator automatically becomes ADMIN.
        const {
            data: user,
            error: userError
        } = await supabaseAdmin
            .from("users")
            .insert({
                user_id: authUser.id,
                organization_id: organization.organization_id,
                name: name,
                email: normalizedEmail,
                role: "ADMIN",
                account_status: "ACTIVE"
            })
            .select()
            .single();

        if (userError) {
            throw userError;
        }

        // Mark profile creation as successful.
        // The cleanup block must not delete the organization now.
        userCreated = true;

        // STEP 9: Return registration success.
        return res.status(201).json({
            success: true,
            message:
                "Email confirmed and organization registration completed successfully.",
            data: {
                user,
                organization
            }
        });

    } catch (error) {
        console.error("Complete registration error:", error);

        // STEP 10: Safely clean up the organization only when
        // its user profile was not successfully created.
        if (createdOrganizationId && !userCreated) {
            try {
                const { error: cleanupError } = await supabaseAdmin
                    .from("organizations")
                    .delete()
                    .eq("organization_id", createdOrganizationId);

                if (cleanupError) {
                    console.error(
                        "Organization cleanup error:",
                        cleanupError.message
                    );
                }
            } catch (cleanupError) {
                console.error(
                    "Organization cleanup failed:",
                    cleanupError.message
                );
            }
        }

        // Handle any other unique constraint violation.
        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message:
                    "This organization or account already exists."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to complete organization registration."
        });
    }
};

// -------------------------------------------------------------
// 3. LOGIN
//
// Authenticates the user, retrieves their application profile,
// checks account status and role, and returns the session.
// -------------------------------------------------------------
const login = async (req, res) => {
    let accessToken = null;

    try {
        // STEP 1: Get login credentials.
        const { email, password } = req.body;

        if (
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        // STEP 2: Normalize email.
        const normalizedEmail = email.trim().toLowerCase();

        // STEP 3: Authenticate through Supabase Auth.
        const {
            data: authData,
            error: authError
        } = await supabaseAuth.auth.signInWithPassword({
            email: normalizedEmail,
            password
        });

        if (authError) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!authData.user || !authData.session) {
            return res.status(401).json({
                success: false,
                message: "Unable to establish an authenticated session."
            });
        }

        // Save the access token for possible session cleanup.
        accessToken = authData.session.access_token;

        // STEP 4: Retrieve the application profile.
        // Include account_status so inactive accounts can be rejected.
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
                role,
                account_status
            `)
            .eq("user_id", authData.user.id)
            .maybeSingle();

        if (userError) {
            console.error("Login profile fetch error:", userError);

            await revokeSession(accessToken);

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve your user profile."
            });
        }

        // STEP 5: Reject Auth users without an application profile.
        if (!user) {
            await revokeSession(accessToken);

            return res.status(403).json({
                success: false,
                message:
                    "Your application profile was not found. Please complete your registration."
            });
        }

        // STEP 6: Reject inactive or suspended accounts.
        if (user.account_status !== "ACTIVE") {
            await revokeSession(accessToken);

            return res.status(403).json({
                success: false,
                message: "Your account is not active."
            });
        }

        // STEP 7: Validate the application role.
        if (!["ADMIN", "EMPLOYEE"].includes(user.role)) {
            await revokeSession(accessToken);

            return res.status(403).json({
                success: false,
                message: "Your account does not have a valid application role."
            });
        }

        // STEP 8: Return the profile and authentication session.
        return res.status(200).json({
            success: true,
            message: "Login successful.",
            data: {
                user: {
                    user_id: user.user_id,
                    organization_id: user.organization_id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    account_status: user.account_status
                },
                session: authData.session
            }
        });

    } catch (error) {
        console.error("Login controller error:", error);

        // Revoke the session if an unexpected error occurred
        // after Supabase successfully authenticated the user.
        await revokeSession(accessToken);

        return res.status(500).json({
            success: false,
            message: "An internal server error occurred."
        });
    }
};

// -------------------------------------------------------------
// 4. LOGOUT
//
// Revokes the current Supabase session.
// The frontend should also clear its locally stored session.
// -------------------------------------------------------------
const logout = async (req, res) => {
    try {
        // STEP 1: Extract the access token.
        const accessToken = getAccessToken(req);

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Authorization token is required."
            });
        }

        // STEP 2: Verify the token.
        const {
            data: { user: authUser },
            error: authError
        } = await supabaseAuth.auth.getUser(accessToken);

        if (authError || !authUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired session."
            });
        }

        // STEP 3: Revoke only the current session.
        const { error: logoutError } =
            await supabaseAdmin.auth.admin.signOut(
                accessToken,
                "local"
            );

        if (logoutError) {
            console.error("Logout error:", logoutError.message);

            return res.status(500).json({
                success: false,
                message: "Unable to log out. Please try again."
            });
        }

        // STEP 4: Return logout success.
        return res.status(200).json({
            success: true,
            message: "Logout successful."
        });

    } catch (error) {
        console.error("Logout controller error:", error);

        return res.status(500).json({
            success: false,
            message: "An internal server error occurred."
        });
    }
};

// -------------------------------------------------------------
// FORGOT PASSWORD
// 1. Validate the employee's email address.
// 2. Ask Supabase Auth to send a password recovery email.
// 3. Redirect the employee to the frontend reset-password page.
// -------------------------------------------------------------
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // STEP 1: Validate the email address.
        if (!email || !email.trim()) {
            return res.status(400).json({
                success: false,
                message: "Email address is required."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Basic email format validation.
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        // STEP 2: Build the frontend password reset URL.
        const frontendUrl = process.env.FRONTEND_URL;

        if (!frontendUrl) {
            console.error("FRONTEND_URL is not configured.");

            return res.status(500).json({
                success: false,
                message: "Password recovery is currently unavailable."
            });
        }

        const redirectUrl = `${frontendUrl.replace(/\/$/, "")}/reset-password`;

        // STEP 3: Ask Supabase Auth to send the recovery email.
        const { error } = await supabaseAuth.auth.resetPasswordForEmail(
            normalizedEmail,
            {
                redirectTo: redirectUrl
            }
        );

        if (error) {
            console.error("Supabase forgot password error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to process your request. Please try again later."
            });
        }

        // STEP 4: Return a generic response to prevent email enumeration.
        return res.status(200).json({
            success: true,
            message: "If an account exists for this email, a password reset link will be sent."
        });

    } catch (error) {
        console.error("Forgot password controller error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while requesting a password reset."
        });
    }
};


// -------------------------------------------------------------
// RESET PASSWORD
// 1. Validate the recovery token and new password.
// 2. Create a request-specific Supabase client.
// 3. Verify the recovery token through Supabase Auth.
// 4. Update the employee's password.
// 5. Revoke the temporary recovery session.
// -------------------------------------------------------------
const resetPassword = async (req, res) => {
    try {
        const {
            token_hash,
            password,
            confirmPassword
        } = req.body;

        // STEP 1: Validate required fields.
        if (!token_hash || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Recovery token, password and confirm password are required."
            });
        }

        // STEP 2: Validate password strength.
        const strongPassword =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

        if (!strongPassword.test(password)) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters, including uppercase, lowercase and a number."
            });
        }

        // STEP 3: Check whether both passwords match.
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Password and confirm password do not match."
            });
        }

        // STEP 4: Create a separate Supabase client for this request.
        // This prevents recovery sessions from being shared between users.
        const recoveryClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                    detectSessionInUrl: false
                }
            }
        );

        // STEP 5: Verify the recovery token sent through the email.
        const { data: recoveryData, error: verificationError } =
            await recoveryClient.auth.verifyOtp({
                token_hash,
                type: "recovery"
            });

        if (verificationError || !recoveryData?.session) {
            return res.status(400).json({
                success: false,
                message: "Password reset link is invalid, expired or already used. Please request a new link."
            });
        }

        // STEP 6: Update the password using the verified recovery session.
        const { error: updateError } =
            await recoveryClient.auth.updateUser({
                password
            });

        if (updateError) {
            console.error("Supabase password update error:", updateError.message);

            return res.status(400).json({
                success: false,
                message: "Unable to update your password. Please request a new reset link."
            });
        }

        // STEP 7: Revoke the temporary recovery session.
        // The password has already been updated, so a sign-out failure
        // should not cause the successful password update to be reported as failed.
        const { error: signOutError } =
            await recoveryClient.auth.signOut({
                scope: "local"
            });

        if (signOutError) {
            console.error("Recovery session sign-out error:", signOutError.message);
        }

        // STEP 8: Return success.
        return res.status(200).json({
            success: true,
            message: "Password updated successfully. Please log in using your new password."
        });

    } catch (error) {
        console.error("Reset password controller error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong while resetting your password."
        });
    }
};

// -------------------------------------------------------------
// EXPORT ALL AUTHENTICATION CONTROLLERS.
// -------------------------------------------------------------
module.exports = {
    registerOrganization,
    completeOrganizationRegistration,
    login,
    logout,
    forgotPassword,
    resetPassword
};
