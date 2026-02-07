frappe.ui.form.on("Load Plan", {
    onload(frm) {
        update_total_qty(frm);
    },

    refresh(frm) {
        update_total_qty(frm);
        frm.clear_custom_buttons();

        if (frm.doc.docstatus !== 1) return;

        render_load_dispatch_buttons(frm);
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

// ===============================
// TOTAL QTY CALCULATION
// ===============================
function update_total_qty(frm) {
    let total = 0;
    (frm.doc.load_items || []).forEach(row => {
        total += flt(row.quantity || 0);
    });
    frm.set_value("total_qty", total);
}

// ===============================
// LOAD DISPATCH → PR / PI BUTTONS
// ===============================
function render_load_dispatch_buttons(frm) {
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Load Dispatch",
            filters: {
                linked_load_reference_no: frm.doc.name,
                docstatus: 1
            },
            fields: ["name"]
        }
    }).then(ld_res => {
        if (!ld_res.message || !ld_res.message.length) return;

        ld_res.message.forEach(ld => {
            frappe.call({
                method: "frappe.client.get_value",
                args: {
                    doctype: "Purchase Receipt",
                    filters: { custom_load_dispatch: ld.name },
                    fieldname: "name"
                }
            }).then(pr_res => {
                if (pr_res.message && pr_res.message.name) {
                    let pr_name = pr_res.message.name;

                    // frm.add_custom_button(
                    //     `Open PR (${ld.name})`,
                    //     () => frappe.set_route("Form", "Purchase Receipt", pr_name),
                    //     "Load Dispatch"
                    // );

                    // frm.add_custom_button(
                    //     `Open PI (${ld.name})`,
                    //     () => frappe.set_route(
                    //         "List",
                    //         "Purchase Invoice",
                    //         { purchase_receipt: pr_name }
                    //     ),
                    //     "Load Dispatch"
                    // );
                } else {
                    frm.add_custom_button(
                        `Create PR (${ld.name})`,
                        () => {
                            frappe.call({
                                method: "rkg.rkg.doctype.load_dispatch.load_dispatch.create_purchase_receipt",
                                args: { load_dispatch: ld.name }
                            }).then(() => {
                                frappe.show_alert({
                                    message: `Purchase Receipt created for ${ld.name}`,
                                    indicator: "green"
                                });
                                frm.reload_doc();
                            });
                        },
                        "Load Dispatch"
                    );
                }
            });
        });
    });
}
