frappe.ui.form.on('Booking Form', {

     onload: function(frm) {

        frm.set_query("customer", function() {
            return {
                query: "rkg.rkg.doctype.booking_form.booking_form.customer_query"
            };
        });

    },
    refresh: function (frm) {


        frm._booking_summary_added = false;

        if (frm.is_new()) {
            create_simple_sidebar(frm);   // this already renders
            return;
        }

        $("#custom-right-sidebar").remove();

        if (frm.doc.docstatus === 0 || frm.doc.docstatus === 1) {
            append_to_default_sidebar(frm);  // this already renders
        }

        manage_payment_logic(frm);
        toggle_other_bank(frm);
        control_discount_fields(frm);

        if (frm.doc.docstatus === 1) {
            add_generate_decision_button(frm);
            add_make_payment_button(frm);
        }
    },
    approver: async function (frm) {

        // Reset first
        frm.allowed_discount_percent = 0;

        if (!frm.doc.approver) {
            return;
        }

        // Load new limit
        let limit = await frappe.db.get_value(
            "Discount Approval",
            { approval_user: frm.doc.approver },
            "discount_percent"
        );

        if (limit && limit.message) {
            frm.allowed_discount_percent = limit.message.discount_percent || 0;
        }

        validate_discount_limit(frm);
    },
    after_save: function (frm) {

        if (frm.doc.docstatus === 1 && frm._discount_changed && !frm.doc.approver) {
            frappe.throw("Select approver first");
            return;
        }

        if (frm.doc.docstatus === 1 && frm._discount_changed && frm._approver != '') {

            frm.set_value("discount_approved", "Pending");

            frappe.show_alert({
                message: "Discount updated. Waiting for approval.",
                indicator: "orange"
            });

            frm._discount_changed = false; // reset flag
        }

    },
    // ================= DISCOUNT =================
    discount_amount: async function(frm){

        if(frm.doc.docstatus === 1) return;

        if(frm._discount_processing) return;

        frm._discount_changed = true;
        frm._discount_processing = true;

        if(!frm.doc.approver){
            frappe.throw("Select approver first");
            frm._discount_processing = false;
            return;
        }

        if(frm.doc.discount_approved === "Approved"){
            frappe.msgprint("Discount already approved");
            frm._discount_processing = false;
            return;
        }

        let valid = await validate_discount_limit(frm);

        if(valid === false){
            frappe.show_alert({
                message:"Discount limit validation failed",
                indicator:"red"
            });

            frm._discount_processing = false;
            return;
        }

        calculate_final_amount(frm);

        frm._discount_processing = false;
    },
    validate(frm) {

        if (!frm.doc.discount_amount || frm.doc.discount_amount <= 0) return;

        if (!frm.doc.approver) {
            frappe.throw("Please select Discount Approval first");
        }

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Discount Approval",
                name: frm.doc.approver
            },
            async: false,
            callback: function (r) {

                let max_percent = r.message.approver_limit_percentage;
                let base_price = frm.doc.price;

                let max_allowed = flt((base_price * max_percent) / 100, 2);

                if (frm.doc.discount_amount > max_allowed) {
                    frappe.throw(
                        `Discount exceeds allowed limit.\n` +
                        `Approver Limit: ${max_percent}%\n` +
                        `Maximum Allowed: ₹ ${max_allowed}`
                    );
                }
            }
        });
    },
    // ================= CUSTOMER FETCH =================

    customer: function (frm) {
        if (!frm.doc.customer) {
            frm.set_value("address", "");
            return;
        }
        frappe.call({
            method: "frappe.contacts.doctype.address.address.get_default_address",
            args: {
                doctype: "Customer",
                name: frm.doc.customer
            },
            callback: function (r) {

                if (!r.message) {
                    frm.set_value("address", "");
                    return;
                }
                frappe.db.get_doc("Address", r.message)
                    .then(address => {

                        let full_address = `
                            ${address.address_line1 || ""}`;

                        frm.set_value("address", full_address.trim());
                        frm.set_value("mobile", address.phone || "");
                        frm.set_value("pin", address.pincode || "");
                        frm.set_value("district", address.city || "");
                    });

            }
        });

    },
    company: function(frm) {
        frm.set_query('cost_center', function() {
            if (!frm.doc.company) {
                return {
                    filters: {}
                };
            }
            return {
                filters: {
                    'company': frm.doc.company
                }
            };
        });
        frm.refresh_field('cost_center');
    },
    // ================= ITEM FETCH =================
    item: function (frm) {

        if (!frm.doc.item) return;
        frappe.db.get_doc("Model Price List", frm.doc.item)
            .then(doc => {
                frm._model_price_doc = doc;
                safe_set(frm, "color_code", doc.color_code);
                safe_set(frm, "price", doc.ex_showroom);
                frm._original_vehicle_price = flt(doc.ex_showroom, 2);
                safe_set(frm, "road_tax_amount", doc.road_tax_amount);
                safe_set(frm, "registration_amount", doc.registration);
                safe_set(frm, "saved_amount", doc.extended_warranty);
                safe_set(frm, "ex_warranty_amount", doc.extended_warranty);
                safe_set(frm, "discount_amount", "");
                frm.set_value('approver','');
                frm.refresh_field('approver');

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

    // ================= OTHER LOGIC =================
    nd_type: function (frm) {
        set_nd_price(frm);
        calculate_nd(frm);
    },
    

    hypothecated_bank: function (frm) {

        if (frm.doc.payment_type !== "Finance") return;

        if (frm.doc.hypothecated_bank === "Others") {

            frm.set_df_property("other_bank_name", "hidden", 0);
            frm.set_df_property("other_bank_name", "reqd", 1);

        } else {

            frm.set_df_property("other_bank_name", "hidden", 1);
            frm.set_df_property("other_bank_name", "reqd", 0);
            frm.set_value("other_bank_name", "");
        }

        frm.refresh_field("other_bank_name");
    },
    payment_type: function (frm) {
        manage_payment_logic(frm);
        toggle_other_bank(frm);
    },

    down_payment_amount: function (frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_finance_from_down(frm);
            render_booking_summary(frm);
        }
    },

    registration_amount: function (frm) {
        calculate_road(frm);
    },

    road_tax_amount: function (frm) {
        calculate_road_tax(frm);
    },

    hp_amount: function (frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_final_amount(frm);
            calculate_finance_from_down(frm);
        }
    },

    finance_amount: function (frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_down_from_finance(frm);
            render_booking_summary(frm);
        }
    },

    ex_warranty_amount: function (frm) {
        calculate_final_amount(frm);
    },

    extended_warrantyew: function (frm) {
        if (frm.doc.extended_warrantyew == 'Not Applicable') {
            safe_set(frm, "ex_warranty_amount", "");
        } else {
            safe_set(frm, "ex_warranty_amount", frm.doc.saved_amount);
        }
    },

    price: calculate_tab_one,
    cgst_rate: calculate_tab_one,
    sgst_rate: calculate_tab_one,

    road_cgst_rate: calculate_road,
    road_sgst_rate: calculate_road,

    nd_price: calculate_nd,
    nd_cgst_rate: calculate_nd,
    nd_sgst_rate: calculate_nd
});


async function control_discount_fields(frm) {

    // Always show fields
    ["discount_amount", "discount_approved", "approver"].forEach(f => {
        frm.set_df_property(f, "hidden", 0);
    });

    // Status always read-only
    frm.set_df_property("discount_approved", "read_only", 1);

    // Lock discount after decision
    if (frm.doc.discount_approved === "Approved" ||
        frm.doc.discount_approved === "Reject") {

        frm.set_df_property("discount_amount", "read_only", 1);
        frm.set_df_property("approver", "read_only", 1);
        return;
    }

    // Reset values
    frm.allowed_discount_percent = 0;
    frm.is_discount_approver = false;

    // Get logged-in user approval limit
    let approval = await frappe.db.get_list("Discount Approval", {
        filters: {
            approval_user: frappe.session.user
        },
        fields: ["discount_percent"],
        limit: 1
    });

    if (approval && approval.length) {
        frm.allowed_discount_percent = approval[0].discount_percent || 0;
        frm.is_discount_approver = true;
    }

    // Optional: make discount editable only before approval
    if (frm.doc.discount_approved === "Pending") {
        frm.set_df_property("discount_amount", "read_only", 0);
    }
}


function add_generate_decision_button(frm) {

    if (frm.doc.docstatus !== 1) return;
    if (!frm.doc.approver) return;
    if (frm.doc.approver !== frappe.session.user) return;
    if (frm.doc.discount_approved !== "Pending") return;

    frm.clear_custom_buttons();

    frm.add_custom_button("Discount Decision", async function () {

        let discount_amount = flt(frm.doc.discount_amount || 0);
        let currency = frm.doc.currency;
        let formatted_amount = format_currency(discount_amount, currency);
        let current_status = frm.doc.discount_approved || "Pending";

        // ✅ Convert GST inclusive → exclusive (actual deduction)
        let discount_exclusive = flt(discount_amount / 1.18, 2);
        let formatted_exclusive = format_currency(discount_exclusive, currency);

        // ✅ Get approver limit
        let res = await frappe.db.get_value(
            "Discount Approval",
            { approval_user: frappe.session.user },
            "discount_percent"
        );

        let allowed_percent = res?.message?.discount_percent || 0;

        let original_price = flt(frm._original_vehicle_price || frm.doc.price, 2);
        let max_allowed_exclusive = flt((original_price * allowed_percent) / 100, 2);

        let d = new frappe.ui.Dialog({
            title: "Discount Decision",
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "info_html"
                },
                {
                    label: "Decision",
                    fieldname: "decision",
                    fieldtype: "Select",
                    options: [
                        { label: "Approved", value: "Approved" },
                        { label: "Reject", value: "Reject" }
                    ],
                    reqd: 1
                }
            ],

            primary_action_label: "Submit",

            primary_action(values) {

                if (!values.decision) {
                    frappe.throw("Please select decision");
                }

                let confirm_message = `
                    Are you sure you want to 
                    <b>${values.decision.toUpperCase()}</b> 
                    discount of 
                    <b>${formatted_amount}</b>
                    <br>
                    <span style="font-size:13px;color:#6b7280;">
                        (Actual Deduction: ${formatted_exclusive})
                    </span> ?
                `;

                frappe.confirm(confirm_message, function () {

                    d.get_primary_btn().prop("disabled", true);

                    frappe.call({
                        method: "rkg.rkg.doctype.booking_form.booking_form.update_discount_decision",
                        args: {
                            docname: frm.doc.name,
                            decision: values.decision
                        },

                        callback: function (r) {

                            if (!r.exc) {

                                frappe.show_alert({
                                    message: `
                                        Discount ${values.decision} 
                                        for ${formatted_amount}
                                        (Actual: ${formatted_exclusive})
                                    `,
                                    indicator: values.decision === "Approved" ? "green" : "red"
                                });

                                d.hide();
                                frm.reload_doc();
                            }

                            d.get_primary_btn().prop("disabled", false);
                        },

                        error: function () {

                            d.get_primary_btn().prop("disabled", false);

                            frappe.msgprint({
                                title: "Error",
                                message: "Decision update failed",
                                indicator: "red"
                            });
                        }
                    });

                });

            }
        });

        // ✅ FULL INFO PANEL (UPDATED)
        d.fields_dict.info_html.$wrapper.html(`
            <div style="
                padding:15px;
                background:#f8fafc;
                border-radius:10px;
                margin-bottom:12px;
                border:1px solid #e5e7eb;
            ">

                <div style="margin-bottom:6px;">
                    <strong>Requested Discount:</strong> 
                    <div style="color:#2563eb;">
                        ${formatted_amount}
                    </div>
                    <div style="font-size:12px;color:#6b7280;">
                        (Actual Deduction: ${formatted_exclusive})
                    </div>
                </div>

                <div>
                    <strong>Status:</strong> 
                    <span style="color:#f59e0b;">
                        ${current_status}
                    </span>
                </div>

            </div>
        `);

        d.show();

    }).addClass("btn-primary");
}

function add_make_payment_button(frm) {
    // Only add button if Booking Form is submitted
    if (frm.doc.docstatus !== 1) return;

    frm.add_custom_button("Make Payment", function () {

        frappe.call({
            method: "rkg.rkg.doctype.booking_form.booking_form.make_payment_journal_entry",
            args: { booking_name: frm.doc.name },
            freeze: true,
            freeze_message: "Creating Journal Entry...",
            callback: function (r) {
                if (r.exc) {
                    frappe.msgprint({
                        title: "Error",
                        message: r.exc,
                        indicator: "red"
                    });
                    return;
                }

                if (r.message) {
                    frappe.show_alert({
                        message: "Journal Entry Created: " + r.message,
                        indicator: "green"
                    });

                    // Redirect to the new Journal Entry Draft
                    frappe.set_route("Form", "Journal Entry", r.message);

                    // Refresh Booking Form to update any payment status
                    frm.reload_doc();
                }
            }
        });

    }).addClass("btn-success");
}

async function validate_discount_limit(frm){

    if(!frm.doc.discount_amount) return true;

    if(!frm.doc.approver){
        frappe.throw("Select approver first");
        return false;
    }

    let res = await frappe.db.get_value(
        "Discount Approval",
        { approval_user: frm.doc.approver },
        "discount_percent"
    );

    let allowed_percent = res?.message?.discount_percent || 0;

    if(allowed_percent <= 0){
        frappe.msgprint("No discount limit configured for approver");
        return false;
    }

    let price_base = flt(frm._original_vehicle_price || frm.doc.price, 2);

    let max_allowed = flt((price_base * allowed_percent) / 100, 2);

    // convert inclusive → exclusive
    let user_exclusive = flt(frm.doc.discount_amount / 1.18, 2);

    if(user_exclusive > max_allowed){

        frappe.msgprint({
            title: "Discount Limit Exceeded",
            message: `Maximum allowed discount is ₹ ${max_allowed}`,
            indicator: "red"
        });

        frm.set_value("discount_amount", 0);
        return false;
    }

    return true;
}

async function load_approver_limit(frm) {

    frm.allowed_discount_percent = 0;

    if (!frm.doc.approver) return;

    let limit = await frappe.db.get_value(
        "Discount Approval",
        { approval_user: frm.doc.approver },
        "discount_percent"
    );

    if (limit && limit.message) {
        frm.allowed_discount_percent = limit.message.discount_percent || 0;
    }
}

function field_exists(frm, fieldname) {
    return frm.meta.fields.some(f => f.fieldname === fieldname);
}

function safe_set(frm, fieldname, value) {
    if (!field_exists(frm, fieldname)) return;

    let new_val = flt(value || 0, 2);
    let current_val = flt(frm.doc[fieldname] || 0, 2);

    if (current_val !== new_val) {
        frm.set_value(fieldname, new_val);
    }
}


function toggle_other_bank(frm) {

    if (frm.doc.payment_type === "Finance") {

        // Make Hypothecated Bank mandatory
        frm.set_df_property("hypothecated_bank", "reqd", 1);

        if (frm.doc.hypothecated_bank === "Others") {

            frm.set_df_property("other_bank_name", "hidden", 0);
            frm.set_df_property("other_bank_name", "reqd", 1);

        } else {

            frm.set_df_property("other_bank_name", "hidden", 1);
            frm.set_df_property("other_bank_name", "reqd", 0);
            frm.set_value("other_bank_name", "");
        }

    } else {

        frm.set_df_property("hypothecated_bank", "reqd", 0);
        frm.set_df_property("other_bank_name", "hidden", 1);
        frm.set_df_property("other_bank_name", "reqd", 0);

        frm.set_value("hypothecated_bank", "");
        frm.set_value("other_bank_name", "");
    }

    frm.refresh_fields([
        "hypothecated_bank",
        "other_bank_name"
    ]);
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
        frm.set_value("provider", doc.general_insurance_provider);
    }

    else if (frm.doc.nd_type === "ND") {
        safe_set(frm, "nd_price", doc.nd_accessories);
        frm.set_value("provider", doc.nd_insurance_provider);
    }
}


// ================= TAB 1 =================

function calculate_tab_one(frm) {

    if (frm.doc.docstatus === 1 && frm.doc.discount_approved !== "Approved") return;
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

    if (frm.doc.docstatus === 1) return;

    let base = frm.doc.registration_amount || 0;
    let cgst = (base * (frm.doc.road_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.road_sgst_rate || 0)) / 100;
    let total = flt(base + cgst + sgst, 2);

    safe_set(frm, "road_cgst_amount", flt(cgst, 2));
    safe_set(frm, "road_sgst_amount", flt(sgst, 2));
    safe_set(frm, "road_total", total);
    calculate_final_amount(frm);
}

function calculate_road_tax(frm) {

    let road_tax = frm.doc.road_tax_amount || 0;
    calculate_final_amount(frm);
}
// ================= ND =================
function calculate_nd(frm) {
    if (frm.doc.docstatus === 1) return;

    let base = frm.doc.nd_price || 0;
    let cgst = (base * (frm.doc.nd_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.nd_sgst_rate || 0)) / 100;

    safe_set(frm, "nd_cgst_amount", cgst);
    safe_set(frm, "nd_sgst_amount", sgst);
    safe_set(frm, "nd_total", base + cgst + sgst);

    calculate_final_amount(frm);
}

function get_nha_total(frm) {

    let total = 0;
    (frm.doc.table_kydz || []).forEach(function (row) {
        total += flt(row.amount);
    });
    return flt(total, 2);
}

function get_hirise_total(frm) {
    let total = 0;
    (frm.doc.table_apcj || []).forEach(function (row) {
        total += flt(row.amount);
    });

    return flt(total, 2);
}
// ================= FINAL TOTAL =================

function calculate_final_amount(frm) {

    // Allow calculation even after submit
    // because price changes after approval

    let base_total =
        flt(frm.doc.amount) +
        flt(frm.doc.road_total) +
        flt(frm.doc.nd_total) +
        flt(frm.doc.ex_warranty_amount) +
        flt(frm.doc.road_tax_amount) +
        get_nha_total(frm) +
        get_hirise_total(frm);

    if (frm.doc.payment_type === "Finance") {
        base_total += flt(frm.doc.hp_amount);
    }

    base_total = flt(base_total, 2);

    if (base_total < 0) base_total = 0;

    if (flt(frm.doc.final_amount) !== base_total) {
        frm.set_value("final_amount", base_total);
    }

    // ================= FINANCE =================

    if (frm.doc.payment_type === "Finance") {

        let down = flt(frm.doc.down_payment_amount);
        let hp = flt(frm.doc.hp_amount);

        let finance = base_total - down - hp;
        if (finance < 0) finance = 0;

        finance = flt(finance, 2);

        if (flt(frm.doc.finance_amount) !== finance) {
            frm.set_value("finance_amount", finance);
        }
    }

    render_booking_summary(frm);
}
// ================= PAYMENT LOGIC =================

function manage_payment_logic(frm) {

    if (frm.doc.docstatus === 1) return;

    // 🔥 ALWAYS recalculate first
    calculate_final_amount(frm);

    let final_amount = flt(frm.doc.final_amount);

    // ================= CASH =================
    if (frm.doc.payment_type === "Cash") {

        // Remove finance values
        safe_set(frm, "hp_amount", 0);
        safe_set(frm, "finance_amount", 0);

        // 🔥 Recalculate again after HP reset
        calculate_final_amount(frm);

        // Down = Final
        safe_set(frm, "down_payment_amount", frm.doc.final_amount);

        render_booking_summary(frm);
    }

    // ================= FINANCE =================
    else if (frm.doc.payment_type === "Finance") {

        frm.set_df_property("down_payment_amount", "reqd", 1);
        frm.set_df_property("finance_amount", "reqd", 1);
        frm.set_df_property("hp_amount", "reqd", 1);

        let default_hp = 500;

        if (!frm.doc.hp_amount) {
            safe_set(frm, "hp_amount", default_hp);
        }

        // 🔥 Recalculate after HP set
        calculate_final_amount(frm);

        calculate_finance_from_down(frm);
        render_booking_summary(frm);
    }
}
// ================= FINANCE FROM DOWN / HP =================
function calculate_finance_from_down(frm) {

    if (frm.doc.docstatus === 1) return;

    let final_amount = flt(frm.doc.final_amount);
    let down = flt(frm.doc.down_payment_amount);
    let hp = flt(frm.doc.hp_amount);

    let finance = final_amount - down - hp;
    if (finance < 0) finance = 0;

    finance = flt(finance, 2);

    // ✅ ONLY update if changed
    if (flt(frm.doc.finance_amount) !== finance) {
        frm.set_value("finance_amount", finance);
    }
}
// ================= DOWN FROM FINANCE =================

function calculate_down_from_finance(frm) {

    if (frm.doc.docstatus === 1) return;

    let final_amount = flt(frm.doc.final_amount);
    let finance = flt(frm.doc.finance_amount);
    let hp = flt(frm.doc.hp_amount);

    let down = final_amount - finance - hp;
    if (down < 0) down = 0;

    down = flt(down, 2);

    // ✅ ONLY update if changed
    if (flt(frm.doc.down_payment_amount) !== down) {
        frm.set_value("down_payment_amount", down);
    }
}
// ================= Side DISPLAY =================

function build_booking_summary_html(frm) {

    let currency = frm.doc.currency;

    let vehicle = flt(frm.doc.amount);

    let reg_base = flt(frm.doc.registration_amount);
    let reg_cgst = flt(frm.doc.road_cgst_amount);
    let reg_sgst = flt(frm.doc.road_sgst_amount);
    let reg_total = flt(frm.doc.road_total);

    let road_tax = flt(frm.doc.road_tax_amount);
    let nd = flt(frm.doc.nd_total);

    let accessories = flt(get_nha_total(frm));
    let hirise = flt(get_hirise_total(frm));

    let warranty = flt(frm.doc.ex_warranty_amount);
    let discount = flt(frm.doc.discount_amount);
    let final_amount = flt(frm.doc.final_amount);

    let payment_type = frm.doc.payment_type;
    let down_payment = flt(frm.doc.down_payment_amount);
    let finance_amount = flt(frm.doc.finance_amount);
    let hp = flt(frm.doc.hp_amount);

    // ================= SUBTOTAL =================
    let subtotal =
        vehicle +
        reg_total +
        nd +
        accessories +
        hirise +
        warranty +
        road_tax +
        (payment_type === "Finance" ? hp : 0);

    // ================= DISCOUNT DISPLAY =================
    let discount_html = "";

    let user_discount = flt(frm.doc.discount_amount);
    let actual_discount = flt(user_discount / 1.18, 2);

    if (user_discount > 0) {

        let discount_content = `
            - ${format_currency(user_discount, currency)}
            <div style="font-size:12px; color:#6b7280;">
                (Actual Deduction: ${format_currency(actual_discount, currency)})
            </div>
        `;

        if (frm.doc.discount_approved === "Approved") {

            discount_html = `
                <div class="summary-row summary-discount">
                    <div>Discount</div>
                    <div>
                        ${discount_content} ✓
                    </div>
                </div>
            `;
        } else {

            discount_html = `
                <div class="summary-row">
                    <div>Discount</div>
                    <div style="color:#dc2626;">
                        ${discount_content} (Pending)
                    </div>
                </div>
            `;
        }
    }

    // ================= RETURN HTML =================
    return `
        <div class="summary-row">
            <div class="summary-label">Model</div>
            <div class="summary-value">${frm.doc.item || "-"}</div>
        </div>

        <div class="summary-row">
            <div class="summary-label">Vehicle Amount</div>
            <div class="summary-value">${format_currency(vehicle, currency)}</div>
        </div>

        <div class="summary-divider"></div>

        ${reg_base ? `
        <div class="summary-row">
            <div class="summary-label">Registration</div>
            <div class="summary-value">${format_currency(reg_base, currency)}</div>
        </div>` : ''}

        ${reg_cgst ? `
        <div class="summary-row">
            <div class="summary-label">Reg CGST</div>
            <div class="summary-value">${format_currency(reg_cgst, currency)}</div>
        </div>` : ''}

        ${reg_sgst ? `
        <div class="summary-row">
            <div class="summary-label">Reg SGST</div>
            <div class="summary-value">${format_currency(reg_sgst, currency)}</div>
        </div>` : ''}

        ${reg_total ? `
        <div class="summary-row summary-bold">
            <div>Total Registration</div>
            <div>${format_currency(reg_total, currency)}</div>
        </div>` : ''}

        ${road_tax ? `
        <div class="summary-row">
            <div class="summary-label">Road Tax</div>
            <div class="summary-value">${format_currency(road_tax, currency)}</div>
        </div>` : ''}

        <div class="summary-divider"></div>

        ${nd ? `
        <div class="summary-row">
            <div class="summary-label">Insurance</div>
            <div class="summary-value">${format_currency(nd, currency)}</div>
        </div>` : ''}

        ${(accessories + hirise) ? `
        <div class="summary-row">
            <div class="summary-label">Accessories</div>
            <div class="summary-value">${format_currency(accessories + hirise, currency)}</div>
        </div>` : ''}

        ${warranty ? `
        <div class="summary-row">
            <div class="summary-label">Extended Warranty</div>
            <div class="summary-value">${format_currency(warranty, currency)}</div>
        </div>` : ''}

        <div class="summary-divider"></div>

        ${payment_type === "Finance" ? `
            <div class="summary-row summary-bold">
                <div>Finance Breakdown</div>
                <div></div>
            </div>

            <div class="summary-row">
                <div class="summary-label">HP Amount</div>
                <div class="summary-value">${format_currency(hp, currency)}</div>
            </div>

            <div class="summary-row">
                <div class="summary-label">Down Payment</div>
                <div class="summary-value">${format_currency(down_payment, currency)}</div>
            </div>

            <div class="summary-row">
                <div class="summary-label">Finance Amount</div>
                <div class="summary-value">${format_currency(finance_amount, currency)}</div>
            </div>
        ` : ''}

        <div class="summary-divider"></div>

        <div class="summary-row summary-bold">
            <div>Subtotal</div>
            <div>${format_currency(subtotal, currency)}</div>
        </div>

        ${discount_html}

        <div class="summary-divider"></div>

        <div class="summary-row summary-bold">
            <div>Final Amount</div>
            <div>${format_currency(final_amount, currency)}</div>
        </div>
    `;
}

function create_simple_sidebar(frm) {

    // prevent duplicate sidebar
    if (document.getElementById("custom-right-sidebar")) return;

    frm.page.main.css({
        display: "flex",
        alignItems: "stretch",
        gap: "20px"
    });

    let sidebar = `
        <div id="custom-right-sidebar">
            <div class="sidebar-title">Booking Preview</div>
            <div id="booking-summary"></div>
        </div>
    `;

    frm.page.main.append(sidebar);

    render_booking_summary(frm);

    inject_sidebar_styles();
}
function render_booking_summary(frm) {
    let wrapper = document.getElementById("booking-summary");
    if (wrapper) {
        wrapper.innerHTML = build_booking_summary_html(frm);
    }
}

function append_to_default_sidebar(frm) {

    setTimeout(() => {

        let wrapper = frm.page.wrapper;

        // Remove old instance
        wrapper.find(".booking-summary-system").remove();

        // 🔥 Get full sidebar (not layout-side-section)
        let sidebar = wrapper.find(".form-sidebar");
        if (!sidebar.length) return;

        let card = `
            <div class="booking-summary-system booking-card">
                <div class="sidebar-title">Booking Summary</div>
                <div id="booking-summary-saved"></div>
            </div>
        `;

        // 🔥 Add at absolute TOP
        sidebar.prepend(card);

        render_booking_summary_saved(frm);
        inject_sidebar_styles();

    }, 300);
}

function render_booking_summary_saved(frm) {
    let wrapper = document.getElementById("booking-summary-saved");
    if (wrapper) {
        wrapper.innerHTML = build_booking_summary_html(frm);
    }
}

function inject_sidebar_styles() {

    if (document.getElementById("custom-sidebar-style")) return;

    let style = document.createElement("style");
    style.id = "custom-sidebar-style";

    style.innerHTML = `
        #custom-right-sidebar {
            width: 300px;
            background: #ffffff;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 4px 12px rgba(0,0,0,0.04);
        }

        .booking-card {
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 15px;
            background: #ffffff;
            padding: 16px;
            border-radius: 12px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 4px 12px rgba(0,0,0,0.04);
        }

        .sidebar-title {
            font-weight: 600;
            margin-bottom: 12px;
            font-size: 15px;
            text-align: center;
            color: #111827;
        }

        /* 🔽 Reduced row spacing */
        .summary-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 4px 0;   /* reduced from 6px */
            font-size: 13px;
            gap: 8px;
            line-height: 1.3;
        }

        .summary-label {
            color: #6b7280;
            flex: 0 0 45%;
        }

        .summary-value {
            flex: 1;
            text-align: right;
            white-space: normal;
            word-break: break-word;
        }

        .summary-divider {
            border-top: 1px dashed #e5e7eb;
            margin: 8px 0;   /* reduced */
        }

        .summary-bold {
            font-weight: 600;
        }

        .summary-discount {
            color: #dc2626;
            font-weight: 600;
        }

    `;



    document.head.appendChild(style);
}




frappe.ui.form.on('Non Honda Accessories Item', {

    item: function (frm, cdt, cdn) {

        if (frm.doc.docstatus === 1) return; // 🔒 freeze after submit

        let row = locals[cdt][cdn];

        if (!row.item) {
            set_child_if_changed(cdt, cdn, "amount", 0);
            calculate_final_amount(frm);
            return;
        }

        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Item Price",
                filters: {
                    item_code: row.item,
                    price_list: "Standard Buying"
                },
                fields: ["price_list_rate"],
                limit_page_length: 1
            },
            callback: function (r) {

                if (frm.doc.docstatus === 1) return; // 🔒 double safety

                let rate = 0;

                if (r.message && r.message.length > 0) {
                    rate = flt(r.message[0].price_list_rate, 2);
                }

                set_child_if_changed(cdt, cdn, "amount", rate);

                calculate_final_amount(frm);
            }
        });
    },

    amount: function (frm) {
        if (frm.doc.docstatus === 1) return;
        calculate_final_amount(frm);
    },

    table_kydz_remove: function (frm) {
        if (frm.doc.docstatus === 1) return;
        calculate_final_amount(frm);
    }
});

frappe.ui.form.on('HIRISE Account Bills Item', {

    amount: function (frm) {
        if (frm.doc.docstatus === 1) return;
        calculate_final_amount(frm);
    },

    table_apcj_add: function (frm) {
        if (frm.doc.docstatus === 1) return;
        calculate_final_amount(frm);
    },

    table_apcj_remove: function (frm) {
        if (frm.doc.docstatus === 1) return;
        calculate_final_amount(frm);
    }
});

function set_child_if_changed(cdt, cdn, fieldname, value) {

    let row = locals[cdt][cdn];

    let new_val = flt(value || 0, 2);
    let current_val = flt(row[fieldname] || 0, 2);

    if (new_val !== current_val) {
        frappe.model.set_value(cdt, cdn, fieldname, new_val);
    }
}