// frappe.ui.form.on("Journal Entry", {

//     onload(frm) {
//         set_cost_center_from_series(frm);
//     },

//     naming_series(frm) {
//         set_cost_center_from_series(frm);
//     },

//     cost_center(frm) {
//         validate_series_match(frm);
//         sync_cost_center(frm);
//     },

//     validate(frm) {
//         validate_series_match(frm);
//     }
// });


frappe.ui.form.on("Journal Entry", {

    onload(frm) {
        // Sync child Cost Centers if parent exists
        if (frm.doc.cost_center) {
            sync_child_cost_center(frm);
        }
    },

    refresh(frm) {
        if (frm.doc.cost_center) {
            sync_child_cost_center(frm);
        }
    },

    naming_series(frm) {
        // Auto-set parent Cost Center from series and sync children
        set_cost_center_from_series(frm, true);
    },

    cost_center(frm) {
        // Sync child rows whenever parent Cost Center changes
        sync_child_cost_center(frm);
    }

});


/* ============================================================
   AUTO SET COST CENTER FROM SERIES
   ============================================================ */
function set_cost_center_from_series(frm, overwrite = false) {
    if (!frm.doc.naming_series) return;

    let series = frm.doc.naming_series.trim();
    let parts = series.split("-").filter(p => p);
    if (!parts.length) return;

    let last_part = parts[parts.length - 1];
    if (last_part.toUpperCase().includes("YYYY")) return;

    frappe.db.get_value("Cost Center", { abbreviation: last_part }, "name")
        .then(r => {
            if (r.message && r.message.name) {
                if (!frm.doc.cost_center || overwrite) {
                    frm.set_value("cost_center", r.message.name)
                        .then(() => sync_child_cost_center(frm));
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
        if (row) {
            // Block manual change and sync child Cost Center
            if (row.cost_center !== frm.doc.cost_center) {
                frappe.model.set_value(row.doctype, row.name || row.__newname, "cost_center", frm.doc.cost_center);
            }
        }
    });

    frm.refresh_field("accounts");
}


/* ============================================================
   CHILD TABLE EVENTS
   ============================================================ */
frappe.ui.form.on("Journal Entry Account", {

    accounts_add(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        if (row && frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
        }
    },

    cost_center(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        // Block manual edits: always reset to parent
        if (row && frm.doc.cost_center && row.cost_center !== frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
        }
    }
});