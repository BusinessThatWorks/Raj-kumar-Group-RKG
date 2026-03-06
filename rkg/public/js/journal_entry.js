frappe.ui.form.on("Journal Entry", {

    onload(frm) {
        if (frm.doc.cost_center) {
            sync_child_cost_center(frm);
        }
    },

    refresh(frm) {
        
        if (frm.doc.cost_center) sync_child_cost_center(frm);
    },

    naming_series(frm) {
        set_cost_center_from_series(frm, true);
    },

    cost_center(frm) {
        if (frm.doc.cost_center) {
            // Sync children and update series
            sync_child_cost_center(frm);
            set_series_from_cost_center(frm);
        }
    },

    validate(frm) {
        // Skip validation for ACC-JV-.YYYY.-
        if (frm.doc.naming_series.startsWith("ACC-JV-.YYYY.-")) return;

        if (!frm.doc.cost_center) {
            frappe.throw("Parent Cost Center is required.");
        }

        frappe.db.get_value("Cost Center", frm.doc.cost_center, "abbreviation")
            .then(r => {
                if (r.message && r.message.abbreviation) {
                    let abbr = r.message.abbreviation;
                    let last_part = frm.doc.naming_series.split("-").pop();
                    if (last_part.toUpperCase() !== abbr.toUpperCase()) {
                        frappe.throw(`Naming series (${frm.doc.naming_series}) must match parent cost center (${abbr}).`);
                    }
                }
            });

        // Child cost center check
        frm.doc.accounts.forEach(row => {
            if (row.cost_center !== frm.doc.cost_center) {
                frappe.throw(`Child row cost center (${row.cost_center}) must match parent (${frm.doc.cost_center}).`);
            }
        });
    }

});

/* ============================================================
   AUTO SET COST CENTER FROM SERIES
   ============================================================ */
function set_cost_center_from_series(frm, overwrite = false) {
    if (!frm.doc.naming_series) return;

    let parts = frm.doc.naming_series.trim().split("-").filter(p => p);
    let last_part = parts[parts.length - 1];

    // Skip ACC-JV-.YYYY.- series
    if (frm.doc.naming_series.startsWith("ACC-JV-.YYYY.-")) return;

    frappe.db.get_value("Cost Center", { abbreviation: last_part }, "name")
        .then(r => {
            if (r.message && r.message.name && (!frm.doc.cost_center || overwrite)) {
                frm.set_value("cost_center", r.message.name).then(() => sync_child_cost_center(frm));
            }
        });
}

/* ============================================================
   AUTO SET SERIES FROM COST CENTER
   ============================================================ */
function set_series_from_cost_center(frm) {
    if (!frm.doc.cost_center) return;

    frappe.db.get_value("Cost Center", frm.doc.cost_center, "abbreviation")
        .then(r => {
            if (r.message && r.message.abbreviation) {
                let abbr = r.message.abbreviation;
                let series_parts = frm.doc.naming_series.split("-");
                if (!series_parts[series_parts.length - 1].toUpperCase().includes("YYYY")) {
                    series_parts[series_parts.length - 1] = abbr;
                    frm.set_value("naming_series", series_parts.join("-"));
                }
            }
        });
}

/* ============================================================
   SYNC CHILD TABLE COST CENTER AUTOMATICALLY
   ============================================================ */
function sync_child_cost_center(frm) {
    if (!frm.doc.cost_center || !frm.doc.accounts) return;

    frm.doc.accounts.forEach(row => {
        try {
            if (!row || (!row.name && !row.__newname)) return; // skip uninitialized rows
            if (row.cost_center !== frm.doc.cost_center) {
                frappe.model.set_value(
                    row.doctype,
                    row.name || row.__newname,
                    "cost_center",
                    frm.doc.cost_center
                );
            }
        } catch (e) {
            console.warn("Skipped row in sync_child_cost_center:", e);
        }
    });

    // Refresh once after a small delay
    setTimeout(() => {
        try {
            frm.refresh_field("accounts");
        } catch (e) {
            console.warn("Skipped refresh_field:", e);
        }
    }, 50);
}

/* ============================================================
   CHILD TABLE EVENTS
   ============================================================ */
frappe.ui.form.on("Journal Entry Account", {

    accounts_add(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row && frm.doc.cost_center) frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
    },

    cost_center(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row && row.cost_center !== frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
            frappe.show_alert({ message: "Child cost center reset to parent", indicator: "orange" });
            set_series_from_cost_center(frm);
        }
    }
});