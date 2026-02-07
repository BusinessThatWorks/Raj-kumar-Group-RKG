let AVAILABLE_FRAMES = [];
let LOAD_REFERENCE_NO = "";
let ACCEPTED_WAREHOUSE = "";

/* ============================================================
   PARENT FORM
   ============================================================ */

frappe.ui.form.on("Damage Assessment", {

    setup(frm) {
        frm.set_query("frame_no", "damage_assessment_items", function () {

            let selected_frames = (frm.doc.damage_assessment_items || [])
                .map(r => r.frame_no)
                .filter(Boolean);

            return {
                filters: [
                    ["Item", "item_code", "in", AVAILABLE_FRAMES],
                    ["Item", "item_code", "not in", selected_frames]
                ]
            };
        });
    },

    refresh(frm) {
        toggle_child_table(frm);
    },

    load_dispatch(frm) {

        if (!frm.doc.load_dispatch) {
            AVAILABLE_FRAMES = [];
            LOAD_REFERENCE_NO = "";
            ACCEPTED_WAREHOUSE = "";

            frm.clear_table("damage_assessment_items");
            frm.set_value("total_estimated_cost", 0);
            frm.refresh_fields();
            toggle_child_table(frm);
            return;
        }

        frappe.call({
            method: "rkg.rkg.doctype.damage_assessment.damage_assessment.get_items_from_load_dispatch",
            args: {
                load_dispatch: frm.doc.load_dispatch
            },
            callback(res) {
                if (!res.message) return;

                AVAILABLE_FRAMES = res.message.items.map(r => r.frame_no);
                LOAD_REFERENCE_NO = res.message.load_reference_number;
                ACCEPTED_WAREHOUSE = res.message.accepted_warehouse;

                toggle_child_table(frm);
            }
        });
    }
});


/* ============================================================
   CHILD TABLE
   ============================================================ */

frappe.ui.form.on("Damage Assessment Item", {

    frame_no(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // 🔹 Auto-set values
        row.load_reference_number = LOAD_REFERENCE_NO;
        row.from_warehouse = ACCEPTED_WAREHOUSE;

        frm.refresh_field("damage_assessment_items");
    },

    estimated_amount(frm) {
        calculate_total_estimated_cost(frm);
    },

    damage_assessment_items_remove(frm) {
        calculate_total_estimated_cost(frm);
        frm.refresh_field("damage_assessment_items");
    }
});


/* ============================================================
   HELPERS
   ============================================================ */

function calculate_total_estimated_cost(frm) {
    let total = 0;

    (frm.doc.damage_assessment_items || []).forEach(row => {
        total += flt(row.estimated_amount || 0);
    });

    frm.set_value("total_estimated_cost", total);
}

function toggle_child_table(frm) {
    frm.toggle_display(
        "damage_assessment_items",
        !!frm.doc.load_dispatch
    );
}
