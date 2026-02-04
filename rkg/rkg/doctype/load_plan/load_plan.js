frappe.ui.form.on("Load Plan", {
    onload(frm) {
        update_total_qty(frm);
        show_purchase_buttons(frm);
    },

    refresh(frm) {
        update_total_qty(frm);
        show_purchase_buttons(frm);
    }
});

frappe.ui.form.on("Load Plan Item", {
    quantity(frm, cdt, cdn) {
        update_total_qty(frm);
    },

    load_items_add(frm, cdt, cdn) {
        update_total_qty(frm);
    },

    load_items_remove(frm, cdt, cdn) {
        update_total_qty(frm);
    }
});

// Calculate total quantity dynamically
function update_total_qty(frm) {
    let total = 0;
    (frm.doc.load_items || []).forEach(row => {
        total += flt(row.quantity || 0);
    });
    frm.set_value("total_qty", total);
}

// Show buttons for PR/PI and Create PR
function show_purchase_buttons(frm) {
    frm.clear_custom_buttons();

    // Get all submitted Load Dispatch linked to this Load Plan
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Load Dispatch",
            filters: { "linked_load_reference_no": frm.doc.name, "docstatus": 1 },
            fields: ["name"]
        },
        callback(ld_res) {
            if (!ld_res.message.length) return;

            ld_res.message.forEach(ld => {
                // Check if Purchase Receipt exists for this Load Dispatch
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Purchase Receipt",
                        filters: { "custom_load_dispatch": ld.name },
                        fields: ["name"]
                    },
                    callback(pr_res) {
                        if (pr_res.message.length > 0) {
                            let pr_name = pr_res.message[0].name;

                            // Open PR button
                            frm.add_custom_button(`Open PR (${ld.name})`, () => {
                                frappe.set_route("Form", "Purchase Receipt", pr_name);
                            });

                            // Open PI button
                            frm.add_custom_button(`Open PI (${ld.name})`, () => {
                                frappe.set_route("List", "Purchase Invoice", { purchase_receipt: pr_name });
                            });
                        } else {
                            // If no PR exists, show Create PR button
                            frm.add_custom_button(`Create PR (${ld.name})`, () => {
                                frappe.call({
                                    method: "rkg.rkg.doctype.load_dispatch.load_dispatch.create_purchase_receipt",
                                    args: { load_dispatch: ld.name },
                                    callback(res) {
                                        if (res.message) {
                                            frappe.show_alert({
                                                message: `Purchase Receipt Created: ${res.message}`,
                                                indicator: "green"
                                            });
                                            // Immediately refresh buttons
                                            show_purchase_buttons(frm);
                                        }
                                    }
                                });
                            });
                        }
                    }
                });
            });
        }
    });
}
