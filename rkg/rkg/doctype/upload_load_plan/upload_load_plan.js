// Copyright (c) 2026, developer and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Upload Load Plan", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("Upload Load Plan", {
    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button("Process CSV", () => {
            if (!frm.doc.attach_load_plan) {
                frappe.msgprint("Please attach CSV file");
                return;
            }

            frappe.call({
                method: "rkg.rkg.doctype.upload_load_plan.upload_load_plan.process_csv",
                args: {
                    upload_doc: frm.doc.name
                },
                callback(r) {
                    frappe.msgprint(r.message);
                }
            });
        });
        frm.add_custom_button("View Load Plans", () => {
            frappe.set_route("List", "Load Plan", {
                created_by_upload: frm.doc.name
            });
        });
    }
});
