frappe.ui.form.on('Booking Form', {

    refresh: function(frm) {
        // nothing needed
    },

    // ===============================
    // CUSTOMER FETCH
    // ===============================
    customer: function(frm) {

        if (!frm.doc.customer) return;

        frappe.db.get_doc("Customer", frm.doc.customer)
            .then(doc => {

                // ================= BASIC DETAILS =================
                if (frm.fields_dict.customer_name)
                    frm.set_value("customer_name", doc.customer_name || "");

                if (frm.fields_dict.mobile_no)
                    frm.set_value("mobile_no", doc.mobile_no || "");

                if (frm.fields_dict.address)
                    frm.set_value("address", doc.primary_address || "");

                // ================= NOMINEE DROPDOWN =================
                let nominee_options = [];
                let so_options = [];

                if (doc.fathers_name) {
                    nominee_options.push(doc.fathers_name+" (Father)");
                    so_options.push(doc.fathers_name+" (Father)");

                }

                if (doc.mothers_name) {
                    nominee_options.push(doc.mothers_name+" (Mother)");
                }

                if (doc.wife_name) {
                    nominee_options.push(doc.wife_name+" (Wife)");
                }

                if (frm.fields_dict.nominee) {
                    frm.set_df_property(
                        "nominee",
                        "options",
                        nominee_options.join("\n")
                    );

                    // Clear previous value
                    frm.set_value("nominee", "");
                }


                if (frm.fields_dict.so) {
                    frm.set_df_property(
                        "so",
                        "options",
                        so_options.join("\n")
                    );

                    // Clear previous value
                    frm.set_value("so", "");
                }

            });
    },

    // ===============================
    // ITEM FETCH
    // ===============================
    item: function(frm) {

        if (!frm.doc.item) return;

        frappe.db.get_doc("Model Price List", frm.doc.item)
            .then(doc => {

                frm._model_price_doc = doc;

                if (frm.fields_dict.price)
                    frm.set_value("price", doc.ex_showroom || 0);

                if (!frm.doc.nd_type && frm.fields_dict.nd_type) {
                    frm.set_value("nd_type", "Normal");
                }

                set_nd_price(frm);

                if (doc.item_group) {
                    frappe.db.get_doc("Item Group", doc.item_group)
                        .then(ig => {

                            let hsn = ig.gst_hsn_code || "";

                            if (frm.fields_dict.hsn_code)
                                frm.set_value("hsn_code", hsn);

                            if (frm.fields_dict.road_hsn_code)
                                frm.set_value("road_hsn_code", hsn);

                            if (frm.fields_dict.nd_hsn_code)
                                frm.set_value("nd_hsn_code", hsn);
                        });
                }

                set_default_gst_rates(frm);
            });
    },

    // ===============================
    // ND TYPE CHANGE
    // ===============================
    nd_type: function(frm) {
        set_nd_price(frm);
        calculate_nd(frm);
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


// ===================================================
// GST FETCH FROM RKG SETTINGS
// ===================================================

function set_default_gst_rates(frm) {

    frappe.db.get_value("RKG Settings", {}, [
        "cgst_rate_vehicle",
        "sgst_rate_vehicle",
        "default_cgst_rate_ins",
        "default_sgst_rate_ins"
    ]).then(r => {

        if (!r.message) return;

        let vehicle_cgst = r.message.cgst_rate_vehicle || 0;
        let vehicle_sgst = r.message.sgst_rate_vehicle || 0;

        let ins_cgst = r.message.default_cgst_rate_ins || 0;
        let ins_sgst = r.message.default_sgst_rate_ins || 0;

        if (frm.fields_dict.cgst_rate)
            frm.set_value("cgst_rate", vehicle_cgst);

        if (frm.fields_dict.sgst_rate)
            frm.set_value("sgst_rate", vehicle_sgst);

        if (frm.fields_dict.road_cgst_rate)
            frm.set_value("road_cgst_rate", vehicle_cgst);

        if (frm.fields_dict.road_sgst_rate)
            frm.set_value("road_sgst_rate", vehicle_sgst);

        if (frm.fields_dict.nd_cgst_rate)
            frm.set_value("nd_cgst_rate", ins_cgst);

        if (frm.fields_dict.nd_sgst_rate)
            frm.set_value("nd_sgst_rate", ins_sgst);

        calculate_tab_one(frm);
        calculate_road(frm);
        calculate_nd(frm);
    });
}


// ================= ND PRICE SETTER =================

function set_nd_price(frm) {

    let doc = frm._model_price_doc;
    if (!doc) return;

    if (!frm.fields_dict.nd_price) return;

    if (frm.doc.nd_type === "Normal") {
        frm.set_value("nd_price", doc.insurance || 0);
    }

    if (frm.doc.nd_type === "Upgrade") {
        frm.set_value("nd_price", doc.nd_accessories || 0);
    }
}


// ================= TAB ONE =================

function calculate_tab_one(frm) {

    let base = frm.doc.price || 0;

    let cgst = (base * (frm.doc.cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.sgst_rate || 0)) / 100;

    frm.set_value("cgst_amount", cgst);
    frm.set_value("sgst_amount", sgst);
    frm.set_value("amount", base + cgst + sgst);
}


// ================= ROAD =================

function calculate_road(frm) {

    let base = frm.doc.road_price || 0;

    let cgst = (base * (frm.doc.road_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.road_sgst_rate || 0)) / 100;

    frm.set_value("road_cgst_amount", cgst);
    frm.set_value("road_sgst_amount", sgst);
    frm.set_value("road_total", base + cgst + sgst);
}


// ================= ND =================

function calculate_nd(frm) {

    let base = frm.doc.nd_price || 0;

    let cgst = (base * (frm.doc.nd_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.nd_sgst_rate || 0)) / 100;

    frm.set_value("nd_cgst_amount", cgst);
    frm.set_value("nd_sgst_amount", sgst);
    frm.set_value("nd_total", base + cgst + sgst);
}