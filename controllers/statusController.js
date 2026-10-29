const { supabaseAdmin } = require("../config/supabase");

const getStatuses = async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("statuses")
      .select("*")
      .order("name");

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch statuses",
      });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get statuses error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getStatuses,
};