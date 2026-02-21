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

                safe_set(frm, "customer_name", doc.customer_name);
                safe_set(frm, "mobile_no", doc.mobile_no);
                let clean_address = (doc.primary_address || "")
                    .replace(/<br\s*\/?>/gi, "\n")   // convert <br> to new line
                    .replace(/<\/?[^>]+(>|$)/g, "")  // remove any other HTML tags
                    .trim();

                safe_set(frm, "address", clean_address);

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
                }

                if (field_exists(frm, "so")) {
                    frm.set_df_property("so", "options", so_options.join("\n"));
                    frm.set_value("so", "");
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

    hp_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_finance_from_down(frm);
        }
    },

    finance_amount: function(frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_down_from_finance(frm);
        }
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

    frappe.db.get_value("RKG Settings", {}, [
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

    let total =
        (frm.doc.amount || 0) +
        (frm.doc.road_total || 0) +
        (frm.doc.nd_total || 0);

    safe_set(frm, "final_amount", total);

    show_final_amount_top(frm);
    manage_payment_logic(frm);
}


// ================= PAYMENT LOGIC =================

function manage_payment_logic(frm) {

    let final_amount = frm.doc.final_amount || 0;

    if (frm.doc.payment_type === "Cash") {

        safe_set(frm, "down_payment_amount", final_amount);
        safe_set(frm, "hp_amount", 0);
        safe_set(frm, "finance_amount", 0);
    }

    else if (frm.doc.payment_type === "Finance") {
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