frappe.ui.form.on("Load Dispatch", {
    setup(frm) {
        frm.set_query("linked_load_reference_no", () => {
            return {
                filters: { status: "Planned" }
            };
        });
    },

    onload(frm) {
        if (frm.is_new() && !frm.doc.dispatch_no) {
            frm.set_value("dispatch_no", frm.doc.name);
        }
    },

    load_dispatch_file_attach(frm) {
        if (frm.doc.docstatus === 1) {
            frappe.msgprint("Cannot import after submission");
            return;
        }

        if (!frm.doc.warehouse) {
            frappe.msgprint("Please select Warehouse before importing CSV");
            return;
        }

        if (!frm.doc.load_dispatch_file_attach) return;

        frappe.call({
            method: "rkg.rkg.doctype.load_dispatch.load_dispatch.read_dispatch_csv",
            args: {
                file_url: frm.doc.load_dispatch_file_attach,
                warehouse: frm.doc.warehouse
            },
            freeze: true,
            freeze_message: "Validating & Importing CSV...",
            callback(r) {
                if (!r.message || !r.message.success) return;

                frm.clear_table("items");

                frm.set_value("linked_load_reference_no", r.message.load_plan_name);
                frm.set_value("invoice_no", r.message.invoice_no);
                frm.set_value("total_load_quantity", r.message.total_load_quantity);
                frm.set_value("total_dispatch_quantity", r.message.total_dispatch_quantity);

                r.message.items.forEach(d => {
                    let row = frm.add_child("items");
                    Object.assign(row, d);
                });

                frm.refresh_field("items");

                frappe.show_alert({
                    message: "CSV imported successfully and Items created",
                    indicator: "green"
                });
            }
        });
    },

    refresh(frm) {

        
        frm.clear_custom_buttons();

        if (frm.doc.docstatus !== 1) return;

        if (frm.doc.docstatus === 1 && frm.doc.total_receipt_quantity === 0) {
            frm.set_df_property("warehouse", "read_only", 0); // editable
        } else {
            frm.set_df_property("warehouse", "read_only", 1); // read-only
        }

        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Purchase Receipt",
                filters: {
                    custom_load_dispatch: frm.doc.name,
                    docstatus: 1   // ✅ ONLY submitted PR
                },
                fields: ["name"],
                limit_page_length: 1
            },
            callback(r) {
                if (!r.message || r.message.length === 0) {
                    // ✅ No submitted PR → allow creation
                    frm.add_custom_button(
                        "Create Purchase Receipt",
                        () => create_purchase_receipt(frm),
                        __("Create")
                    ).addClass("btn-primary");
                } else {
                    // ❌ Submitted PR exists → open it
                    frm.add_custom_button(
                        "Open Purchase Receipt",
                        () => {
                            frappe.set_route(
                                "Form",
                                "Purchase Receipt",
                                r.message[0].name
                            );
                        },
                        __("View")
                    );
                }
            }
        });

        
    }

});

// ===============================
// CREATE PURCHASE RECEIPT
// ===============================
function create_purchase_receipt(frm) {
    frappe.call({
        method: "rkg.rkg.doctype.load_dispatch.load_dispatch.create_purchase_receipt",
        args: {
            load_dispatch: frm.doc.name
        },
        freeze: true,
        freeze_message: "Creating Purchase Receipt...",
        callback(r) {
            if (r.message) {
                frappe.show_alert({
                    message: `Purchase Receipt Created: ${r.message}`,
                    indicator: "green"
                });
                frappe.set_route("Form", "Purchase Receipt", r.message);
            }
        }
    });
}
