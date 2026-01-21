// Copyright (c) 2026, developer and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Load Plan", {
// 	refresh(frm) {

// 	},
// });


frappe.ui.form.on("Load Plan", {
    refresh(frm) {
        update_total_qty(frm);
    }
});

frappe.ui.form.on("Load Plan Item", {
    quantity(frm) {
        update_total_qty(frm);
    },

    load_items_add(frm) {
        update_total_qty(frm);
    },

    load_items_remove(frm) {
        update_total_qty(frm);
    }
});

function update_total_qty(frm) {
    let total = 0;

    (frm.doc.load_items || []).forEach(row => {
        total += flt(row.quantity);
    });

    frm.set_value("total_qty", total);
}
