const { supabaseAdmin } = require("../config/supabase");

// GET PRIORITIES
const getPriorities = async (req, res) => {

// Fetch all priorities from the "priorities" table using the supabaseAdmin client.
  const { data, error } = await supabaseAdmin
    .from("priorities")
    .select("*");
// Handle any errors that may have occurred during the fetch operation.
  if (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
// Return the fetched priorities in the response with a success status.
  return res.status(200).json({
    success: true,
    data,
  });
};

module.exports = { getPriorities };