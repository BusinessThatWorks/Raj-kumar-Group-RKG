frappe.ui.form.on("Journal Entry", {

    cost_center(frm) {
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

    // 🚫 Block manual change in child
    cost_center(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        if (frm.doc.cost_center && row.cost_center !== frm.doc.cost_center) {
            frappe.model.set_value(cdt, cdn, "cost_center", frm.doc.cost_center);
        }
    }
});


/* ============================================================
   CORE LOGIC
   ============================================================ */

function sync_cost_center(frm) {

    if (!frm.doc.cost_center) return;

    (frm.doc.accounts || []).forEach(row => {
        if (row.cost_center !== frm.doc.cost_center) {
            row.cost_center = frm.doc.cost_center;
        }
    });

    frm.refresh_field("accounts");
}
