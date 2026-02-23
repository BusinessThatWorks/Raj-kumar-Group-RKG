frappe.ui.form.on('Booking Form', {

    refresh: function(frm) {
        calculate_final_amount(frm);
        manage_payment_logic(frm);
        show_final_amount_top(frm);

        // Road Price always auto calculated
        frm.set_df_property("road_price", "read_only", 1);
    },

    // ================= CUSTOMER FETCH =================
    customer: function(frm) {

        if (!frm.doc.customer) return;

        frappe.db.get_doc("Customer", frm.doc.customer)
            .then(doc => {

                frm.set_df_property("customer_name", "read_only", 0);
                frm.set_df_property("mobile_no", "read_only", 0);
                frm.set_df_property("address", "read_only", 0);
                frm.set_df_property("pin", "read_only", 0);
                frm.set_df_property("post_office", "read_only", 0);
                frm.set_df_property("district", "read_only", 0);

                safe_set(frm, "customer_name", doc.customer_name);
                safe_set(frm, "mobile_no", doc.mobile_no);
                safe_set(frm, "pin", doc.custom_pin);
                safe_set(frm, "post_office", doc.custom_post_office);
                safe_set(frm, "district", doc.custom_district);

                let clean_address = (doc.primary_address || "")
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<\/?[^>]+(>|$)/g, "")
                    .trim();

                safe_set(frm, "address", clean_address);
            });
    },

    // ================= ITEM FETCH =================
    item: function(frm) {

        if (!frm.doc.item) return;

        frappe.db.get_doc("Model Price List", frm.doc.item)
            .then(doc => {

                frm._model_price_doc = doc;

                safe_set(frm, "price", doc.ex_showroom);

                // ✅ FETCH REGISTRATION FROM MODEL PRICE LIST
                safe_set(frm, "registration_amount", doc.registration || 0);

                // Auto update road price
                update_road_price(frm);

                if (!frm.doc.nd_type)
                    frm.set_value("nd_type", "Normal");

                set_nd_price(frm);

                if (doc.item_group) {
                    frappe.db.get_doc("Item Group", doc.item_group)
                        .then(ig => {

                            let hsn = ig.gst_hsn_code || "";

                            safe_set(frm, "hsn_code", hsn);
                            safe_set(frm, "road_hsn_code", hsn);
                            safe_set(frm, "nd_hsn_code", hsn);
                        });
                }

                set_default_gst_rates(frm);
            });
    },

    // ================= ROAD TRIGGERS =================

    registration_amount: function(frm) {
        update_road_price(frm);
    },

    road_tax_amount: function(frm) {
        update_road_price(frm);
    },

    road_cgst_rate: function(frm) {
        calculate_road(frm);
    },

    road_sgst_rate: function(frm) {
        calculate_road(frm);
    },

    // ================= ND =================

    nd_type: function(frm) {
        set_nd_price(frm);
        calculate_nd(frm);
    },

    nd_price: calculate_nd,
    nd_cgst_rate: calculate_nd,
    nd_sgst_rate: calculate_nd,

    // ================= TAB 1 =================

    price: calculate_tab_one,
    cgst_rate: calculate_tab_one,
    sgst_rate: calculate_tab_one,

    // ================= PAYMENT =================

    payment_type: function(frm) {
        manage_payment_logic(frm);
    },

    down_payment_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_finance_from_down(frm);
        }
    },

    hp_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_final_amount(frm);
            calculate_finance_from_down(frm);
        }
    },

    finance_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_down_from_finance(frm);
        }
    }
});


// ================= SAFE =================

function field_exists(frm, fieldname) {
    return frm.meta.fields.some(f => f.fieldname === fieldname);
}

function safe_set(frm, fieldname, value) {
    if (field_exists(frm, fieldname)) {
        frm.set_value(fieldname, value || 0);
    }
}


// ================= GST FETCH =================

function set_default_gst_rates(frm) {

    frappe.db.get_value("RKG Settings", frm.doc.company, [
        "cgst_rate_vehicle",
        "sgst_rate_vehicle",
        "default_cgst_rate_ins",
        "default_sgst_rate_ins"
    ]).then(r => {

        if (!r.message) return;

        safe_set(frm, "cgst_rate", r.message.cgst_rate_vehicle);
        safe_set(frm, "sgst_rate", r.message.sgst_rate_vehicle);

        safe_set(frm, "road_cgst_rate", r.message.cgst_rate_vehicle);
        safe_set(frm, "road_sgst_rate", r.message.sgst_rate_vehicle);

        safe_set(frm, "nd_cgst_rate", r.message.default_cgst_rate_ins);
        safe_set(frm, "nd_sgst_rate", r.message.default_sgst_rate_ins);

        calculate_tab_one(frm);
        calculate_road(frm);
        calculate_nd(frm);
    });
}


// ================= TAB 1 =================

function calculate_tab_one(frm) {

    let base = frm.doc.price || 0;
    let cgst = (base * (frm.doc.cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.sgst_rate || 0)) / 100;

    safe_set(frm, "cgst_amount", cgst);
    safe_set(frm, "sgst_amount", sgst);
    safe_set(frm, "amount", base + cgst + sgst);

    calculate_final_amount(frm);
}


// ================= ROAD =================

function update_road_price(frm) {

    let registration = frm.doc.registration_amount || 0;
    let road_tax = frm.doc.road_tax_amount || 0;

    let total = registration + road_tax;

    frm.set_value("road_price", total);

    calculate_road(frm);
}

function calculate_road(frm) {

    let base = frm.doc.road_price || 0;

    let cgst = (base * (frm.doc.road_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.road_sgst_rate || 0)) / 100;

    safe_set(frm, "road_cgst_amount", cgst);
    safe_set(frm, "road_sgst_amount", sgst);
    safe_set(frm, "road_total", base + cgst + sgst);

    calculate_final_amount(frm);
}


// ================= ND =================

function set_nd_price(frm) {

    let doc = frm._model_price_doc;
    if (!doc) return;

    if (frm.doc.nd_type === "Normal") {
        safe_set(frm, "nd_price", doc.insurance);
        safe_set(frm, "provider", doc.general_insurance_provider);
    }

    else if (frm.doc.nd_type === "Upgrade") {
        safe_set(frm, "nd_price", doc.nd_accessories);
        safe_set(frm, "provider", doc.nd_insurance_provider);
    }
}

function calculate_nd(frm) {

    let base = frm.doc.nd_price || 0;
    let cgst = (base * (frm.doc.nd_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.nd_sgst_rate || 0)) / 100;

    safe_set(frm, "nd_cgst_amount", cgst);
    safe_set(frm, "nd_sgst_amount", sgst);
    safe_set(frm, "nd_total", base + cgst + sgst);

    calculate_final_amount(frm);
}


// ================= FINAL =================

function calculate_final_amount(frm) {

    let base_total =
        (frm.doc.amount || 0) +
        (frm.doc.road_total || 0) +
        (frm.doc.nd_total || 0);

    let hp = frm.doc.payment_type === "Finance" ? (frm.doc.hp_amount || 0) : 0;

    frm.set_value("final_amount", base_total + hp);

    show_final_amount_top(frm);
}


// ================= PAYMENT =================

function manage_payment_logic(frm) {

    if (frm.doc.payment_type === "Cash") {

        frm.set_df_property("down_payment_amount", "reqd", 0);
        frm.set_df_property("finance_amount", "reqd", 0);
        frm.set_df_property("hp_amount", "reqd", 0);
        frm.set_df_property("hypothecated_bank", "reqd", 0);

        frm.set_value("hp_amount", 0);
        frm.set_value("finance_amount", 0);

        calculate_final_amount(frm);

        frm.set_value("down_payment_amount", frm.doc.final_amount);
    }

    else if (frm.doc.payment_type === "Finance") {

        frm.set_df_property("down_payment_amount", "reqd", 1);
        frm.set_df_property("finance_amount", "reqd", 1);
        frm.set_df_property("hp_amount", "reqd", 1);
        frm.set_df_property("hypothecated_bank", "reqd", 1);

        if (!frm.doc.hp_amount)
            frm.set_value("hp_amount", 500);

        calculate_final_amount(frm);
        calculate_finance_from_down(frm);
    }
}


// ================= FINANCE =================

function calculate_finance_from_down(frm) {

    let final = frm.doc.final_amount || 0;
    let down = frm.doc.down_payment_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let finance = final - down - hp;
    if (finance < 0) finance = 0;

    safe_set(frm, "finance_amount", finance);
}

function calculate_down_from_finance(frm) {

    let final = frm.doc.final_amount || 0;
    let finance = frm.doc.finance_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let down = final - finance - hp;
    if (down < 0) down = 0;

    safe_set(frm, "down_payment_amount", down);
}


// ================= DASHBOARD =================

function show_final_amount_top(frm) {

    frm.dashboard.clear_headline();

    let final = frm.doc.final_amount || 0;
    let formatted = format_currency(final, frm.doc.currency);

    frm.dashboard.set_headline(
        `<div style="text-align:right;font-size:18px;font-weight:600;padding-right:30px;">
            Final Amount: ${formatted}
        </div>`
    );
}