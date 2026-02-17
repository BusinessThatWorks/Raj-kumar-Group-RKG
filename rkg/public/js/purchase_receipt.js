frappe.ui.form.on("Purchase Receipt", {

    cost_center(frm) {
        // Apply parent cost center to all rows
        if (!frm.doc.cost_center) return;

        sync_pr_item_cost_center(frm);
    },

    custom_load_dispatch(frm) {

        if (!frm.doc.custom_load_dispatch) return;

        frappe.call({
            method: "rkg.rkg.doctype.load_dispatch.load_dispatch.get_items_from_load_dispatch",
            args: {
                load_dispatch: frm.doc.custom_load_dispatch
            },
            callback(r) {
                if (!r.message) return;

                frm.clear_table("items");

                r.message.items.forEach(d => {
                    let row = frm.add_child("items");
                    row.item_code = d.item_code;
                    row.item_name = d.item_code;
                    row.qty = d.qty;
                    row.rate = d.rate;
                    row.warehouse = d.warehouse;

                    // ✅ FORCE cost center from parent
                    if (frm.doc.cost_center) {
                        row.cost_center = frm.doc.cost_center;
                    }
                });

                frm.refresh_field("items");
            }
        });
    }
});


/* ============================================================
   CHILD TABLE – HARD LOCK
   ============================================================ */

frappe.ui.form.on("Purchase Receipt Item", {

    items_add(frm, cdt, cdn) {
        if (frm.doc.cost_center) {
            frappe.model.set_value(
                cdt,
                cdn,
                "cost_center",
                frm.doc.cost_center
            );
        }
    },

    cost_center(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // 🚫 Never allow child override
        if (frm.doc.cost_center && row.cost_center !== frm.doc.cost_center) {
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
   COMMON FUNCTION
   ============================================================ */

function sync_pr_item_cost_center(frm) {

    if (!frm.doc.cost_center) return;

    (frm.doc.items || []).forEach(row => {
        if (row.cost_center !== frm.doc.cost_center) {
            row.cost_center = frm.doc.cost_center;
        }
    });

    frm.refresh_field("items");
}
