// Copyright (c) 2026, developer and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Upload Load Plan", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("Upload Load Plan", {
    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button("View Load Plans", () => {
            frappe.set_route("List", "Load Plan", {
                created_by_upload: frm.doc.name
            });
        });
    }
});
