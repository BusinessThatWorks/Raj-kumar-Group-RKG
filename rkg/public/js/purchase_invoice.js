frappe.ui.form.on("Purchase Invoice", {

    /* ======================================================
       ONLOAD
    ====================================================== */
    onload(frm) {

        if (frm.doc.purchase_receipt) {
            apply_pr_logic(frm);
        }
    },


    /* ======================================================
       REFRESH
    ====================================================== */
    refresh(frm) {

        if (frm.doc.purchase_receipt) {
            apply_pr_logic(frm);
        }

        set_purchase_type_filter(frm);
    },


    /* ======================================================
       PURCHASE RECEIPT SELECT
    ====================================================== */
    purchase_receipt(frm) {

        if (!frm.doc.purchase_receipt) return;

        apply_pr_logic(frm);
    },


    /* ======================================================
       COST CENTER CHANGE
    ====================================================== */
    cost_center(frm) {

        if (!frm.doc.cost_center) return;

        // 🚨 If created from PR → block change
        if (frm.doc.purchase_receipt && frm.pr_cost_center) {

            if (frm.doc.cost_center !== frm.pr_cost_center) {

                frappe.msgprint({
                    title: "Not Allowed",
                    message: "Cost Center cannot be changed because this Invoice is created from Purchase Receipt.",
                    indicator: "red"
                });

                frm.set_value("cost_center", frm.pr_cost_center);
                return;
            }
        }

        // Sync items
        sync_pi_item_cost_center(frm);

        // If manual PI → reset purchase type
        if (!frm.doc.purchase_receipt) {
            frm.set_value("purchase_type", "");
            frm.set_value("naming_series", "");
        }

        set_purchase_type_filter(frm);

        // Auto select purchase type if only one
        if (!frm.doc.purchase_receipt) {

            frappe.db.get_list("Purchase Type", {
                filters: {
                    company_name: frm.doc.company,
                    cost_center: frm.doc.cost_center
                },
                fields: ["name"]
            }).then(types => {

                if (types.length === 1) {
                    frm.set_value("purchase_type", types[0].name);
                }
            });
        }
    },


    /* ======================================================
       PURCHASE TYPE CHANGE
    ====================================================== */
    purchase_type(frm) {

        frm.set_value("naming_series", "");
        frm.set_df_property("naming_series", "options", "");

        if (!frm.doc.purchase_type) return;

        // If PI created from PR → do not change CC
        if (frm.doc.purchase_receipt) {

            set_series_from_purchase_type(frm);
            return;
        }

        // Manual PI → fetch series + cost center
        frappe.db.get_value(
            "Purchase Type",
            frm.doc.purchase_type,
            ["series", "cost_center"]
        ).then(r => {

            if (!r.message) return;

            // 1️⃣ Set Naming Series
            if (r.message.series) {

                let series_list = r.message.series.split("\n");

                frm.set_df_property(
                    "naming_series",
                    "options",
                    series_list.join("\n")
                );

                frm.set_value("naming_series", series_list[0]);
            }

            // 2️⃣ Set Cost Center Automatically
            if (r.message.cost_center) {

                frm.set_value("cost_center", r.message.cost_center);
                sync_pi_item_cost_center(frm);
            }

            set_purchase_type_filter(frm);
        });
    }
});


/* ============================================================
   CHILD TABLE CONTROL
============================================================ */

frappe.ui.form.on("Purchase Invoice Item", {

    items_add(frm, cdt, cdn) {

        if (frm.doc.cost_center) {

            frappe.model.set_value(
                cdt,
                cdn,
                "cost_center",
                frm.doc.cost_center
            );
        }
    },

    cost_center(frm, cdt, cdn) {

        if (frm.doc.purchase_receipt) {

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

function apply_pr_logic(frm) {

    frappe.db.get_value(
        "Purchase Receipt",
        frm.doc.purchase_receipt,
        "cost_center"
    ).then(r => {

        if (!r.message || !r.message.cost_center) return;

        let pr_cc = r.message.cost_center;

        frm.pr_cost_center = pr_cc;

        // Set Cost Center
        frm.set_value("cost_center", pr_cc);

        // Lock header
        frm.set_df_property("cost_center", "read_only", 1);

        // Lock items column
        if (frm.fields_dict.items) {
            frm.fields_dict["items"].grid.update_docfield_property(
                "cost_center",
                "read_only",
                1
            );
        }

        // Sync items
        sync_pi_item_cost_center(frm);

        // Reset Purchase Type
        frm.set_value("purchase_type", "");

        set_purchase_type_filter(frm);

        // Auto select purchase type if only one
        frappe.db.get_list("Purchase Type", {
            filters: {
                company_name: frm.doc.company,
                cost_center: pr_cc
            },
            fields: ["name"]
        }).then(types => {

            if (types.length === 1) {
                frm.set_value("purchase_type", types[0].name);
            }
        });
    });
}


function sync_pi_item_cost_center(frm) {

    if (!frm.doc.cost_center) return;

    (frm.doc.items || []).forEach(row => {
        row.cost_center = frm.doc.cost_center;
    });

    frm.refresh_field("items");
}


function set_purchase_type_filter(frm) {

    frm.set_query("purchase_type", function() {
        return {
            filters: {
                company_name: frm.doc.company,
                cost_center: frm.doc.cost_center
            }
        };
    });
}


function set_series_from_purchase_type(frm) {

    frappe.db.get_value(
        "Purchase Type",
        frm.doc.purchase_type,
        "series"
    ).then(r => {

        if (!r.message || !r.message.series) return;

        let series_list = r.message.series.split("\n");

        frm.set_df_property(
            "naming_series",
            "options",
            series_list.join("\n")
        );

        frm.set_value("naming_series", series_list[0]);
    });
}
