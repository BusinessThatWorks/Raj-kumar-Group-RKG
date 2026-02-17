frappe.ui.form.on("Stock Entry", {

    onload(frm) {
        sync_all_rows(frm);
    },

    refresh(frm) {
        sync_all_rows(frm);
    },

    cost_center(frm) {
        sync_all_rows(frm);
    }
});


/* ============================================================
   CHILD TABLE EVENTS
   ============================================================ */

frappe.ui.form.on("Stock Entry Detail", {

    // When new row added
    items_add(frm, cdt, cdn) {
        apply_parent_cost_center(frm, cdt, cdn);
    },

    // 🚫 If user manually changes child cost_center
    cost_center(frm, cdt, cdn) {

        if (!frm.doc.cost_center) return;

        let row = locals[cdt][cdn];

        if (row.cost_center !== frm.doc.cost_center) {

            frappe.model.set_value(
                cdt,
                cdn,
                "cost_center",
                frm.doc.cost_center
            );
        }
    }
});


/* ============================================================
   CORE FUNCTIONS
   ============================================================ */

function sync_all_rows(frm) {

    if (!frm.doc.cost_center) return;
    if (!frm.doc.items) return;

    frm.doc.items.forEach(row => {

        if (row.cost_center !== frm.doc.cost_center) {
            row.cost_center = frm.doc.cost_center;
        }

    });

    frm.refresh_field("items");
}


function apply_parent_cost_center(frm, cdt, cdn) {

    if (!frm.doc.cost_center) return;

    frappe.model.set_value(
        cdt,
        cdn,
        "cost_center",
        frm.doc.cost_center
    );
}
