frappe.ui.form.on("Load Dispatch", {

    // =====================================================
    // SETUP
    // =====================================================
    setup(frm) {
        frm.set_query("linked_load_reference_no", () => {
            return {
                filters: { status: "Planned" }
            };
        });
    },

    // =====================================================
    // ONLOAD
    // =====================================================
    onload(frm) {
        if (frm.is_new() && !frm.doc.dispatch_no) {
            frm.set_value("dispatch_no", frm.doc.name);
        }
    },

    // =====================================================
    // CSV IMPORT
    // =====================================================
    load_dispatch_file_attach(frm) {

        if (!frm.doc.load_dispatch_file_attach) return;

        if (frm.doc.docstatus === 1) {
            frappe.msgprint("Cannot import after submission");
            return;
        }

        if (!frm.doc.warehouse) {
            frappe.msgprint("Please select Warehouse before importing CSV");
            return;
        }

        frappe.call({
            method: "rkg.rkg.doctype.load_dispatch.load_dispatch.read_dispatch_csv",
            args: {
                file_url: frm.doc.load_dispatch_file_attach,
                warehouse: frm.doc.warehouse
            },
            freeze: true,
            freeze_message: "Validating & Importing CSV...",
            callback(r) {

                if (!r.message || !r.message.success) {
                    frappe.msgprint("Import failed. Please check file.");
                    return;
                }

                // Clear old rows
                frm.clear_table("items");

                // Parent fields
                frm.set_value("linked_load_reference_no", r.message.load_plan_name);
                frm.set_value("invoice_no", r.message.invoice_no);
                frm.set_value("total_load_quantity", r.message.total_load_quantity);
                frm.set_value("total_dispatch_quantity", r.message.total_dispatch_quantity);

                // Add items
                (r.message.items || []).forEach(d => {
                    let row = frm.add_child("items");
                    Object.assign(row, d);
                });

                frm.refresh_field("items");

                // Show warning if duplicate frames skipped
                if (r.message.duplicate_info) {

                    let count = r.message.duplicate_info.count;
                    let frames = r.message.duplicate_info.frames || [];

                    frappe.msgprint({
                        title: `Duplicate Frames Skipped (${count})`,
                        message: `
                            <b>Total Duplicate Frames:</b> ${count}<br><br>
                            <b>Frame Numbers:</b><br>
                            ${frames.join("<br>")}
                        `,
                        indicator: "orange"
                    });
                }


                frappe.show_alert({
                    message: "CSV imported successfully",
                    indicator: "green"
                });
            }
        });
    },

    refresh(frm) {

        frm.clear_custom_buttons();

        // =====================================================
        // WAREHOUSE EDITABLE LOGIC
        // =====================================================

        const receipt_qty = frm.doc.total_receipt_quantity || 0;
        const is_submitted = frm.doc.docstatus === 1;
        const is_draft = frm.doc.docstatus === 0;

        // Editable only if:
        // 1) Draft
        // 2) Submitted but no receipt created yet
        if ((is_draft && receipt_qty === 0) || (is_submitted && receipt_qty === 0)) {
            frm.set_df_property("warehouse", "read_only", 0);
        } else {
            frm.set_df_property("warehouse", "read_only", 1);
        }

        // No buttons for draft
        if (!is_submitted) return;

        // =====================================================
        // CHECK IF PURCHASE RECEIPT EXISTS
        // =====================================================

        frappe.db.get_list("Purchase Receipt", {
            filters: {
                custom_load_dispatch: frm.doc.name,
                docstatus: 1
            },
            fields: ["name"],
            limit: 1
        }).then((r) => {

            if (!r || r.length === 0) {

                // ✅ CREATE BUTTON
                frm.add_custom_button(
                    __("Create Purchase Receipt"),
                    () => create_purchase_receipt(frm),
                    __("Create")
                ).addClass("btn-primary");

            } else {

                // ❌ OPEN BUTTON
                frm.add_custom_button(
                    __("Open Purchase Receipt"),
                    () => {
                        frappe.set_route(
                            "Form",
                            "Purchase Receipt",
                            r[0].name
                        );
                    },
                    __("View")
                );
            }

        });

    }


});


// =====================================================
// CREATE PURCHASE RECEIPT
// =====================================================
function create_purchase_receipt(frm) {

    frappe.call({
        method: "rkg.rkg.doctype.load_dispatch.load_dispatch.create_purchase_receipt",
        args: {
            load_dispatch: frm.doc.name
        },
        freeze: true,
        freeze_message: "Creating Purchase Receipt...",
        callback(r) {

            if (!r.message) {
                frappe.msgprint("Purchase Receipt creation failed");
                return;
            }

            frappe.show_alert({
                message: `Purchase Receipt Created: ${r.message}`,
                indicator: "green"
            });

            frappe.set_route("Form", "Purchase Receipt", r.message);
        }
    });
}
