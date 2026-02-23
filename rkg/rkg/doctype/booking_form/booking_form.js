frappe.ui.form.on('Booking Form', {

    refresh: function(frm) {
        calculate_final_amount(frm);
        manage_payment_logic(frm);
        show_final_amount_top(frm);
    },

    // ================= CUSTOMER FETCH =================
    customer: function(frm) {

        if (!frm.doc.customer) return;

        frappe.db.get_doc("Customer", frm.doc.customer)
            .then(doc => {

                // Make fields editable
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

                // Nominee Logic
                let nominee_options = [];
                let so_options = [];

                if (doc.fathers_name) {
                    nominee_options.push(doc.fathers_name + " (Father)");
                    so_options.push(doc.fathers_name + " (Father)");
                }

                if (doc.mothers_name)
                    nominee_options.push(doc.mothers_name + " (Mother)");

                if (doc.wife_name)
                    nominee_options.push(doc.wife_name + " (Wife)");

                if (field_exists(frm, "nominee")) {
                    frm.set_df_property("nominee", "options", nominee_options.join("\n"));
                    frm.set_value("nominee", "");
                    frm.set_df_property("nominee", "read_only", 0);
                }

                if (field_exists(frm, "so")) {
                    frm.set_df_property("so", "options", so_options.join("\n"));
                    frm.set_value("so", "");
                    frm.set_df_property("so", "read_only", 0);
                }
            });
    },

    // ================= ITEM FETCH =================
    item: function(frm) {

        if (!frm.doc.item) return;

        frappe.db.get_doc("Model Price List", frm.doc.item)
            .then(doc => {

                frm._model_price_doc = doc;

                safe_set(frm, "price", doc.ex_showroom);
                safe_set(frm, "road_price", doc.registration);
                safe_set(frm, "registration_amount", doc.registration);
                safe_set(frm, "ex_warranty_amount", doc.extended_warranty);

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

    nd_type: function(frm) {
        set_nd_price(frm);
        calculate_nd(frm);
    },

    payment_type: function(frm) {
        manage_payment_logic(frm);
    },

    down_payment_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_finance_from_down(frm);
        }
    },
    registration_amount: function(frm) {
        adjust_road_split(frm, "registration");
    },

    road_tax_amount: function(frm) {
        adjust_road_split(frm, "road_tax");
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
    },
    ex_warranty_amount: function(frm) {
        calculate_final_amount(frm);
    },

    price: calculate_tab_one,
    cgst_rate: calculate_tab_one,
    sgst_rate: calculate_tab_one,

    road_price: calculate_road,
    road_cgst_rate: calculate_road,
    road_sgst_rate: calculate_road,

    nd_price: calculate_nd,
    nd_cgst_rate: calculate_nd,
    nd_sgst_rate: calculate_nd
});


// ================= SAFE FIELD CHECK =================

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

function calculate_nd(frm) {

    let base = frm.doc.nd_price || 0;
    let cgst = (base * (frm.doc.nd_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.nd_sgst_rate || 0)) / 100;

    safe_set(frm, "nd_cgst_amount", cgst);
    safe_set(frm, "nd_sgst_amount", sgst);
    safe_set(frm, "nd_total", base + cgst + sgst);

    calculate_final_amount(frm);
}


// ================= FINAL TOTAL =================

function calculate_final_amount(frm) {

    let base_total =
        (frm.doc.amount || 0) +
        (frm.doc.road_total || 0) +
        (frm.doc.nd_total || 0) +
        (frm.doc.ex_warranty_amount || 0);  

    let hp = 0;

    if (frm.doc.payment_type === "Finance") {
        hp = frm.doc.hp_amount || 0;
    }

    let final_total = base_total + hp;

    frm.set_value("final_amount", final_total);

    show_final_amount_top(frm);
}


// ================= PAYMENT LOGIC =================
function manage_payment_logic(frm) {

    if (frm.doc.payment_type === "Cash") {

        // Remove mandatory
        frm.set_df_property("down_payment_amount", "reqd", 0);
        frm.set_df_property("finance_amount", "reqd", 0);
        frm.set_df_property("hp_amount", "reqd", 0);
        frm.set_df_property("hypothecated_bank", "reqd", 0);

        // Reset finance values
        frm.set_value("hp_amount", 0);
        frm.set_value("finance_amount", 0);

        calculate_final_amount(frm);

        frm.set_value("down_payment_amount", frm.doc.final_amount);
    }

    else if (frm.doc.payment_type === "Finance") {

        // Make mandatory
        frm.set_df_property("down_payment_amount", "reqd", 1);
        frm.set_df_property("finance_amount", "reqd", 1);
        frm.set_df_property("hp_amount", "reqd", 1);
        frm.set_df_property("hypothecated_bank", "reqd", 1);

        // Default HP = 500 if empty
        if (!frm.doc.hp_amount || frm.doc.hp_amount === 0) {
            frm.set_value("hp_amount", 500);
        }

        calculate_final_amount(frm);
        calculate_finance_from_down(frm);
    }
}


// ================= FINANCE FROM DOWN / HP =================

function calculate_finance_from_down(frm) {

    let final_amount = frm.doc.final_amount || 0;
    let down = frm.doc.down_payment_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let finance = final_amount - down - hp;
    if (finance < 0) finance = 0;

    safe_set(frm, "finance_amount", finance);
}


// ================= DOWN FROM FINANCE =================

function calculate_down_from_finance(frm) {

    let final_amount = frm.doc.final_amount || 0;
    let finance = frm.doc.finance_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let down = final_amount - finance - hp;
    if (down < 0) down = 0;

    safe_set(frm, "down_payment_amount", down);
}


// ================= TOP DISPLAY =================

function show_final_amount_top(frm) {

    frm.dashboard.clear_headline();

    let final = frm.doc.final_amount || 0;
    let formatted = format_currency(final, frm.doc.currency);

    frm.dashboard.set_headline(
        `<div style="
            text-align:right;
            font-size:18px;
            font-weight:600;
            padding-right:30px;">
            Final Amount: ${formatted}
        </div>`
    );
}

function adjust_road_split(frm, changed_field) {

    let road_price = frm.doc.road_price || 0;
    let registration = frm.doc.registration_amount || 0;
    let road_tax = frm.doc.road_tax_amount || 0;

    // If registration changed → adjust road tax
    if (changed_field === "registration") {

        let new_road_tax = road_price - registration;
        if (new_road_tax < 0) new_road_tax = 0;

        frm.set_value("road_tax_amount", new_road_tax);
    }

    // If road tax changed → adjust registration
    if (changed_field === "road_tax") {

        let new_registration = road_price - road_tax;
        if (new_registration < 0) new_registration = 0;

        frm.set_value("registration_amount", new_registration);
    }

    calculate_road(frm);
}
