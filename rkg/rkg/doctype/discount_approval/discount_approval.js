// Copyright (c) 2026, developer and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Discount Approval", {
// 	refresh(frm) {

// 	},
// });

frappe.ui.form.on("Discount Approval", {
    before_save: function(frm) {
        if (!frm.doc.created_by) {
            frm.set_value("created_by", frappe.session.user);
        }
    }
});