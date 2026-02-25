frappe.ui.form.on("Discount Approval Request", {

    refresh: function(frm) {

        // Lock status for non-approver
        if (frappe.session.user !== frm.doc.approver) {
            frm.set_df_property("status", "read_only", 1);
        }

        // Lock after final decision
        if (frm.doc.status === "Approved" || frm.doc.status === "Rejected") {
            frm.set_df_property("status", "read_only", 1);
        }
    },

    status: async function(frm) {

        // Only approver can change
        if (frappe.session.user !== frm.doc.approver) {
            frappe.throw("Only assigned approver can change status.");
        }

        if (!frm.doc.booking_form) return;

        // ================= APPROVED =================
        if (frm.doc.status === "Approved") {

            await frappe.call({
                method: "frappe.client.set_value",
                args: {
                    doctype: "Booking Form",
                    name: frm.doc.booking_form,
                    fieldname: {
                        discount_approved: 1
                    }
                }
            });

            frappe.msgprint("Discount approved successfully.");

            // 🔥 If Booking Form is open → reload instantly
            if (cur_frm &&
                cur_frm.doctype === "Booking Form" &&
                cur_frm.doc.name === frm.doc.booking_form) {

                await cur_frm.reload_doc();
            }
        }

        // ================= REJECTED =================
        if (frm.doc.status === "Rejected") {

            await frappe.call({
                method: "frappe.client.set_value",
                args: {
                    doctype: "Booking Form",
                    name: frm.doc.booking_form,
                    fieldname: {
                        discount_approved: 0,
                        discount_amount: 0
                    }
                }
            });

            frappe.msgprint("Discount rejected and removed.");

            if (cur_frm &&
                cur_frm.doctype === "Booking Form" &&
                cur_frm.doc.name === frm.doc.booking_form) {

                await cur_frm.reload_doc();
            }
        }
    }
});