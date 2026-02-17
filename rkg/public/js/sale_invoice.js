frappe.ui.form.on("Sales Invoice", {

    refresh(frm) {

        // Make child cost center read-only
        if (frm.fields_dict.items) {
            frm.fields_dict["items"].grid.update_docfield_property(
                "cost_center",
                "read_only",
                1
            );
        }

        if (frm.doc.cost_center) {
            sync_si_item_cost_center(frm);
        }
    },

    cost_center(frm) {
        if (!frm.doc.cost_center) return;
        sync_si_item_cost_center(frm);
    }
});


frappe.ui.form.on("Sales Invoice Item", {

    items_add(frm, cdt, cdn) {
        if (!frm.doc.cost_center) return;
        frappe.model.set_value(
            cdt,
            cdn,
            "cost_center",
            frm.doc.cost_center
        );
    },

    cost_center(frm, cdt, cdn) {
        if (frm.doc.cost_center) {
            frappe.model.set_value(
                cdt,
                cdn,
                "cost_center",
                frm.doc.cost_center
            );
        }
    }

});


function sync_si_item_cost_center(frm) {
    (frm.doc.items || []).forEach(row => {
        row.cost_center = frm.doc.cost_center;
    });

    frm.refresh_field("items");
}
