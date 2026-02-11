let AVAILABLE_FRAMES = [];
let LOAD_REFERENCE_NO = "";
let ACCEPTED_WAREHOUSE = "";

frappe.ui.form.on("Damage Assessment", {

    refresh(frm) {

        frm.toggle_display(
            "damage_assessment_items",
            !!frm.doc.load_dispatch
        );

        frm.clear_custom_buttons();

        // 🔥 ALWAYS SHOW CREATE BUTTON AFTER SUBMIT
        if (frm.doc.docstatus === 1) {
            frm.add_custom_button(
                __("Create Purchase Receipt"),
                () => create_purchase_receipt(frm),
                __("Create")
            ).addClass("btn-primary");
        }
    },

    load_dispatch(frm) {

        if (!frm.doc.load_dispatch) {
            reset_all(frm);
            return;
        }

        frappe.call({
            method: "rkg.utils.damage_assessment.get_items_from_load_dispatch",
            args: { load_dispatch: frm.doc.load_dispatch },
            callback(r) {

                if (!r.message) return;

                AVAILABLE_FRAMES = r.message.items.map(d => d.frame_no);
                LOAD_REFERENCE_NO = r.message.load_reference_number;
                ACCEPTED_WAREHOUSE = r.message.accepted_warehouse;

                frm.toggle_display(
                    "damage_assessment_items",
                    true
                );
            }
        });
    }
});


frappe.ui.form.on("Damage Assessment Item", {

    frame_no(frm, cdt, cdn) {

        let row = locals[cdt][cdn];

        if (!row.frame_no) {
            clear_row(row);
            frm.refresh_field("damage_assessment_items");
            calculate_total(frm);
            return;
        }

        row.load_reference_number = LOAD_REFERENCE_NO;
        row.from_warehouse = ACCEPTED_WAREHOUSE;

        frappe.db.get_value(
            "Item",
            row.frame_no,
            ["item_name", "custom_color"]
        ).then(r => {

            if (!r || !r.message) return;

            row.model_name = r.message.item_name || "";
            row.color = r.message.custom_color || "";

            frm.refresh_field("damage_assessment_items");
        });
    },

    estimated_amount(frm) {
        calculate_total(frm);
    },

    damage_assessment_items_remove(frm) {
        calculate_total(frm);
    }
});


function calculate_total(frm) {

    let total = 0;

    (frm.doc.damage_assessment_items || []).forEach(r => {
        total += flt(r.estimated_amount || 0);
    });

    frm.set_value("total_estimated_cost", total);
}


function clear_row(row) {

    row.model_name = "";
    row.color = "";
    row.load_reference_number = "";
    row.from_warehouse = "";
    row.issue_1 = "";
    row.issue_2 = "";
    row.issue_3 = "";
    row.estimated_amount = 0;
}


function reset_all(frm) {

    AVAILABLE_FRAMES = [];
    LOAD_REFERENCE_NO = "";
    ACCEPTED_WAREHOUSE = "";

    frm.clear_table("damage_assessment_items");
    frm.set_value("total_estimated_cost", 0);
    frm.refresh_fields();
}


// ============================================================
// CREATE PURCHASE RECEIPT
// ============================================================

function create_purchase_receipt(frm) {

    frappe.call({
        method: "rkg.utils.damage_assessment.create_purchase_receipt",
        args: {
            damage_assessment: frm.doc.name
        },
        freeze: true,
        freeze_message: "Creating Purchase Receipt...",
        callback(r) {

            if (!r.message) return;

            frappe.show_alert({
                message: __("Purchase Receipt Created: {0}", [r.message]),
                indicator: "green"
            });

            // stay on DA, allow multiple PR creation
            frm.reload_doc();
        }
    });
}
