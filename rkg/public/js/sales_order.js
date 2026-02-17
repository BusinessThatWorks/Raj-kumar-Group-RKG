frappe.ui.form.on('Sales Order', {

    /* ======================================================
       REFRESH
    ====================================================== */
    refresh(frm) {

        set_sales_type_filter(frm);

        // If no Sales Type → show all Cost Centers
        if (!frm.doc.sales_type) {
            frm.set_query("cost_center", function() {
                return {};
            });
        }

        if (frm.doc.cost_center) {
            sync_so_item_cost_center(frm);
        }

        // Make child cost center read-only
        if (frm.fields_dict.items) {
            frm.fields_dict["items"].grid.update_docfield_property(
                "cost_center",
                "read_only",
                1
            );
        }
    },


    /* ======================================================
       SALES TYPE CHANGE
    ====================================================== */
    sales_type(frm) {

        // 🔴 If Sales Type cleared
        if (!frm.doc.sales_type) {

            // Clear naming series (optional)
            frm.set_df_property("naming_series", "options", "");

            // Show all Cost Centers
            frm.set_query("cost_center", function() {
                return {};
            });

            return;
        }

        // 🟢 If Sales Type selected
        frappe.db.get_value(
            "Sale Type",
            frm.doc.sales_type,
            ["series", "cost_center"]
        ).then(r => {

            if (!r.message) return;

            let sale_cc = r.message.cost_center;

            /* 1️⃣ Naming Series */
            if (r.message.series) {

                let series_list = r.message.series.split("\n");

                frm.set_df_property(
                    "naming_series",
                    "options",
                    series_list.join("\n")
                );

                frm.set_value("naming_series", series_list[0]);
            }

            /* 2️⃣ Cost Center */
            if (sale_cc) {

                frm.set_value("cost_center", sale_cc);

                // Restrict dropdown to only this CC
                frm.set_query("cost_center", function() {
                    return {
                        filters: {
                            name: sale_cc
                        }
                    };
                });

                sync_so_item_cost_center(frm);
            }
        });
    },


    /* ======================================================
       HEADER COST CENTER CHANGE
    ====================================================== */
    cost_center(frm) {

        if (!frm.doc.cost_center) return;

        sync_so_item_cost_center(frm);
        set_sales_type_filter(frm);
    }
});


/* ============================================================
   CHILD TABLE
============================================================ */

frappe.ui.form.on("Sales Order Item", {

    items_add(frm, cdt, cdn) {

        if (!frm.doc.cost_center) return;

        frappe.model.set_value(
            cdt,
            cdn,
            "cost_center",
            frm.doc.cost_center
        );
    },

    cost_center(frm, cdt, cdn) {

        if (frm.doc.cost_center) {

            frappe.model.set_value(
                cdt,
                cdn,
                "cost_center",
                frm.doc.cost_center
            );
        }
    }
});


/* ============================================================
   COMMON FUNCTIONS
============================================================ */

function sync_so_item_cost_center(frm) {

    if (!frm.doc.cost_center) return;

    (frm.doc.items || []).forEach(row => {
        row.cost_center = frm.doc.cost_center;
    });

    frm.refresh_field("items");
}


function set_sales_type_filter(frm) {

    frm.set_query("sales_type", function() {
        return {
            filters: {
                company_name: frm.doc.company
            }
        };
    });
}
