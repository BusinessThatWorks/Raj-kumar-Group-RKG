frappe.ui.form.on("Journal Entry", {

    onload(frm) {
        // Sync when form loads
        if (frm.doc.cost_center) {
            sync_cost_center(frm);
        }
    },

    refresh(frm) {
        // Sync on refresh (new + saved docs)
        if (frm.doc.cost_center) {
            sync_cost_center(frm);
        }
    },

    cost_center(frm) {
        // When main cost center changes
        sync_cost_center(frm);
    }
});


/* ============================================================
   CHILD TABLE EVENTS
   ============================================================ */

frappe.ui.form.on("Journal Entry Account", {

    accounts_add(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
        }
    },

    // 🚫 Block manual change in child row
    cost_center(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (frm.doc.cost_center && row.cost_center !== frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);

            frappe.show_alert({
                message: "Cost Center is controlled by Main Cost Center",
                indicator: "orange"
            });
        }
    }
});


/* ============================================================
   CORE LOGIC
   ============================================================ */

function sync_cost_center(frm) {

    if (!frm.doc.cost_center || !frm.doc.accounts) return;

    frm.doc.accounts.forEach(row => {
        if (row.cost_center !== frm.doc.cost_center) {
            row.cost_center = frm.doc.cost_center;
        }
    });

    frm.refresh_field("accounts");
}
