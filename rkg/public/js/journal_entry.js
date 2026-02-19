frappe.ui.form.on("Journal Entry", {

    onload(frm) {
        set_cost_center_from_series(frm);
    },

    naming_series(frm) {
        set_cost_center_from_series(frm);
    },

    cost_center(frm) {
        validate_series_match(frm);
        sync_cost_center(frm);
    },

    validate(frm) {
        validate_series_match(frm);
    }
});


/* ============================================================
   AUTO SET COST CENTER FROM NAMING SERIES
   ============================================================ */

function set_cost_center_from_series(frm) {

    if (!frm.doc.naming_series) return;

    let series = frm.doc.naming_series.trim();
    let parts = series.split("-").filter(p => p);

    if (!parts.length) return;

    let last_part = parts[parts.length - 1];

    // 🚫 Skip rule if series ends with YYYY
    if (last_part.toUpperCase().includes("YYYY")) {
        return;
    }

    // Fetch Cost Center by abbreviation
    frappe.db.get_value("Cost Center",
        { abbreviation: last_part },
        "name"
    ).then(r => {

        if (r.message && r.message.name) {

            if (frm.doc.cost_center !== r.message.name) {
                frm.set_value("cost_center", r.message.name);
            }

        } else {

            frappe.msgprint({
                title: "Configuration Missing",
                message: "No Cost Center found with abbreviation: <b>" + last_part + "</b>",
                indicator: "red"
            });

        }

    });
}


/* ============================================================
   VALIDATE SERIES VS COST CENTER
   ============================================================ */

function validate_series_match(frm) {

    if (!frm.doc.naming_series || !frm.doc.cost_center) return;

    let series = frm.doc.naming_series.trim();
    let parts = series.split("-").filter(p => p);

    if (!parts.length) return;

    let last_part = parts[parts.length - 1];

    // 🚫 Skip rule if ends with YYYY
    if (last_part.toUpperCase().includes("YYYY")) {
        return;
    }

    // 1️⃣ Get Expected Cost Center (correct one)
    frappe.db.get_value("Cost Center",
        { abbreviation: last_part },
        "name"
    ).then(expected => {

        if (!expected.message || !expected.message.name) return;

        let correct_cc = expected.message.name;

        // 2️⃣ Compare with selected cost center
        if (frm.doc.cost_center !== correct_cc) {

            frappe.throw(
                "Cost Center not match.<br><br>" +
                "Please set correct Cost Center: <b>" + correct_cc + "</b>"
            );
        }

    });
}


/* ============================================================
   SYNC CHILD TABLE COST CENTER
   ============================================================ */

function sync_cost_center(frm) {

    if (!frm.doc.cost_center || !frm.doc.accounts) return;

    frm.doc.accounts.forEach(row => {
        row.cost_center = frm.doc.cost_center;
    });

    frm.refresh_field("accounts");
}
