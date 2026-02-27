frappe.ui.form.on('Booking Form', {

    refresh: function (frm) {
        if (frm.doc.docstatus === 1 && frm.doc.discount_amount == 0 && !frm.doc.approver) {
            frm.set_df_property("discount_amount", "read_only", 1);
        }
        setTimeout(async () => {

            if (frm.doc.docstatus === 0) {
                calculate_final_amount(frm);
            }

            manage_payment_logic(frm);
            toggle_other_bank(frm);

            show_final_amount_top(frm);

            await control_discount_fields(frm);

            if (frm.doc.docstatus === 1) {
                add_generate_decision_button(frm);
            }

        }, 50);
    },
    final_amount: function (frm) {
        show_final_amount_top(frm);
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

        if (frm.doc.docstatus === 1 && frm._discount_changed && frm._approver == '') {
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
    discount_amount: function (frm) {

        frm._discount_changed = true;

        if (!frm.doc.approver) {
            frappe.throw("Select approver first");
        }

        validate_discount_limit(frm);
        frm._old_discount_amount = frm.doc.discount_amount || 0;

        if (frm.doc.docstatus === 0) {
            calculate_final_amount(frm);
        }
    },
    validate: function (frm) {
        if (frm.doc.discount_amount > 0 && !frm.doc.approver) {
            frappe.throw("Approver is mandatory when Discount Amount is entered.");
        }

        if (!frm.doc.discount_approved) {
            frm.doc.discount_approved = "Pending";
        }
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
    // ================= ITEM FETCH =================
    item: function (frm) {

        if (!frm.doc.item) return;
        frappe.db.get_doc("Model Price List", frm.doc.item)
            .then(doc => {
                frm._model_price_doc = doc;
                safe_set(frm, "price", doc.ex_showroom);
                safe_set(frm, "road_tax_amount", doc.road_tax_amount);
                safe_set(frm, "registration_amount", doc.registration);
                safe_set(frm, "saved_amount", doc.extended_warranty);
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

    // ================= OTHER LOGIC =================
    nd_type: function (frm) {
        set_nd_price(frm);
        calculate_nd(frm);
    },
    hypothecated_bank: function (frm) {
        if (frm.doc.payment_type !== "Finance") return;
        if (frm.doc.hypothecated_bank !== "Others") {

            frm.set_value("other_bank_name", "");
            frm.set_df_property("other_bank_name", "hidden", 1);
            frm.set_df_property("other_bank_name", "reqd", 0);
            frm.refresh_field("other_bank_name");

            return;
        }
        let d = new frappe.ui.Dialog({
            title: "Create Customer Requested Bank",
            fields: [
                {
                    label: "Customer Provided Bank Name",
                    fieldname: "bank_name",
                    fieldtype: "Data",
                    reqd: 1
                }
            ],
            primary_action_label: "Submit",
            primary_action(values) {

                frappe.call({
                    method: "frappe.client.insert",
                    args: {
                        doc: {
                            doctype: "Customer Req Hypothecated Bank",
                            booking_form: frm.doc.name,
                            bank_name: values.bank_name
                        }
                    },
                    callback: function () {

                        frm.set_value("other_bank_name", values.bank_name);
                        frm.set_df_property("other_bank_name", "hidden", 0);
                        frm.set_df_property("other_bank_name", "reqd", 1);
                        frm.refresh_field("other_bank_name");

                        d._submitted = true;
                        d.hide();
                    }
                });
            }
        });
        d.onhide = function () {
            if (!d._submitted) {
                frm.set_value("hypothecated_bank", "");
            }
        };

        d.show();
    },

    payment_type: function (frm) {
        manage_payment_logic(frm);
        toggle_other_bank(frm);
    },

    down_payment_amount: function (frm) {
        if (frm.doc.payment_type === "Finance") {
            calculate_finance_from_down(frm);
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

    if (frm.doc.discount_approved == 'Approved' || frm.doc.discount_approved == 'Reject') {
        frm.set_df_property("discount_amount", "read_only", 1);
    }

    frm.allowed_discount_percent = 0;
    frm.is_discount_approver = false;
    ["discount_amount", "discount_approved", "approver"].forEach(f => {
        frm.set_df_property(f, "hidden", 0);
    });

    frm.set_df_property("discount_approved", "read_only", 1);
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
}

function add_generate_decision_button(frm) {

    if (frm.doc.docstatus !== 1) return;
    if (!frm.doc.approver) return;
    if (frm.doc.approver !== frappe.session.user) return;
    if (frm.doc.discount_approved !== "Pending") return;

    frm.clear_custom_buttons();

    frm.add_custom_button("Discount Decision", function () {

        let discount_amount = frm.doc.discount_amount || 0;
        let formatted_amount = format_currency(discount_amount, frm.doc.currency);

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

                // Disable dialog primary button instead of popup
                d.get_primary_btn().prop("disabled", true);

                frappe.call({
                    method: "rkg.rkg.doctype.booking_form.booking_form.update_discount_decision",
                    args: {
                        docname: frm.doc.name,
                        decision: values.decision
                    },

                    callback: function (r) {

                        if (!r.exc) {

                            let success_message = "";

                            if (values.decision === "Approved") {
                                success_message = `Discount Approved for ${formatted_amount}`;
                            } else {
                                success_message = `Discount Rejected for ${formatted_amount}`;
                            }

                            frappe.show_alert({
                                message: success_message,
                                indicator: "green"
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
            }
        });
        d.fields_dict.info_html.$wrapper.html(`
            <div style="margin-bottom:10px; padding:10px; 
                        background:#f8f9fa; border-radius:8px;
                        font-weight:600;">
                Request for Discount Amount is: 
                <span style="color:#0d6efd;">
                    ${formatted_amount}
                </span>
            </div>
        `);

        d.show();

    }).addClass("btn-primary");
}

async function validate_discount_limit(frm) {

    if (!frm.doc.discount_amount) return;
    if (!frm.doc.approver) return;
    if (frm.doc.discount_approved === "Approved") return;
    let res = await frappe.db.get_value(
        "Discount Approval",
        { approval_user: frm.doc.approver },
        "discount_percent"
    );
    let allowed_percent = res?.message?.discount_percent || 0;

    if (!allowed_percent) return;
    let base_total =
        flt(frm.doc.amount) +
        flt(frm.doc.road_total) +
        flt(frm.doc.nd_total) +
        flt(frm.doc.ex_warranty_amount) +
        flt(frm.doc.road_tax_amount);

    if (frm.doc.payment_type === "Finance") {
        base_total += flt(frm.doc.hp_amount);
    }

    let max_allowed = (base_total * allowed_percent) / 100;
    if (flt(frm.doc.discount_amount) > max_allowed) {

        frappe.msgprint({
            title: "Discount Limit Exceeded",
            message: `
                Approver Limit: ${allowed_percent}%<br>
                Maximum Allowed: ₹ ${max_allowed.toFixed(2)}
            `,
            indicator: "red"
        });
    }
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
    if (field_exists(frm, fieldname)) {
        frm.set_value(fieldname, value || 0);
    }
}
function toggle_other_bank(frm) {

    if (frm.doc.payment_type === "Finance" &&
        frm.doc.hypothecated_bank === "Others") {

        frm.set_df_property("other_bank_name", "hidden", 0);

    } else {

        frm.set_df_property("other_bank_name", "hidden", 1);
        frm.set_df_property("other_bank_name", "reqd", 0);
        frm.set_value("other_bank_name", "");
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

    else if (frm.doc.nd_type === "ND") {
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

    if (frm.doc.docstatus === 1) return;
    let base = frm.doc.registration_amount || 0;
    let cgst = (base * (frm.doc.road_cgst_rate || 0)) / 100;
    let sgst = (base * (frm.doc.road_sgst_rate || 0)) / 100;
    let total = flt(base + cgst + sgst, 2);

    safe_set(frm, "road_cgst_amount", flt(cgst, 2));
    safe_set(frm, "road_sgst_amount", flt(sgst, 2));
    safe_set(frm, "road_total", total);
}

function calculate_road_tax(frm) {

    let road_tax = frm.doc.road_tax_amount || 0;
    frm._road_tax_value = road_tax;
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

    if (frm.doc.docstatus === 1) return;

    let base_total =
        flt(frm.doc.amount) +
        flt(frm.doc.road_total) +
        flt(frm.doc.nd_total) +
        flt(frm.doc.ex_warranty_amount);

    base_total += flt(frm.doc.road_tax_amount);
    base_total += get_nha_total(frm);
    base_total += get_hirise_total(frm);

    let hp = frm.doc.payment_type === "Finance"
        ? flt(frm.doc.hp_amount)
        : 0;

    let final_total = flt(base_total + hp, 2);
    final_total -= flt(frm.doc.discount_amount);
    frm.set_value("final_amount", flt(final_total, 2));
}
// ================= PAYMENT LOGIC =================
function manage_payment_logic(frm) {

    if (frm.doc.docstatus === 1) return; // ✅ Freeze all payment recalculation after submit

    let fnamount = frm.doc.final_amount || 0;

    if (frm.doc.payment_type === "Cash") {

        frm.set_df_property("down_payment_amount", "reqd", 0);
        frm.set_df_property("finance_amount", "reqd", 0);
        frm.set_df_property("hp_amount", "reqd", 0);
        frm.set_df_property("hypothecated_bank", "reqd", 0);

        frm.set_value("hypothecated_bank", "");
        frm.set_value("other_bank_name", "");

        frm.set_value("hp_amount", 0);
        frm.set_value("finance_amount", 0);

        frm.set_value("down_payment_amount", fnamount);
    }

    else if (frm.doc.payment_type === "Finance") {

        frm.set_df_property("down_payment_amount", "reqd", 1);
        frm.set_df_property("finance_amount", "reqd", 1);
        frm.set_df_property("hp_amount", "reqd", 1);
        frm.set_df_property("hypothecated_bank", "reqd", 1);

        if (!frm.doc.hp_amount || frm.doc.hp_amount === 0) {
            frm.set_value("hp_amount", 500);
        }
    }
}
// ================= FINANCE FROM DOWN / HP =================
function calculate_finance_from_down(frm) {

    if (frm.doc.docstatus === 1) return;

    let final_amount = frm.doc.final_amount || 0;
    let down = frm.doc.down_payment_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let finance = final_amount - down - hp;
    if (finance < 0) finance = 0;

    frm.set_value("finance_amount", finance);
}
// ================= DOWN FROM FINANCE =================

function calculate_down_from_finance(frm) {

    if (frm.doc.docstatus === 1) return; // ✅ Freeze after submit

    let final_amount = frm.doc.final_amount || 0;
    let finance = frm.doc.finance_amount || 0;
    let hp = frm.doc.hp_amount || 0;

    let down = final_amount - finance - hp;
    if (down < 0) down = 0;

    frm.set_value("down_payment_amount", down);
}
// ================= TOP DISPLAY =================

function show_final_amount_top(frm) {

    // Remove existing (only inside this form)
    frm.$wrapper.find("#final-amount-sticky").remove();

    let final = frm.doc.final_amount || 0;
    let formatted = format_currency(final, frm.doc.currency);

    let html = `
        <div id="final-amount-sticky">
            
            <div class="final-header">
                <span>Final Amount</span>
                <button id="close-final-box">✕</button>
            </div>

            <div class="final-value">
                ${formatted}
            </div>

        </div>
    `;

    // Append ONLY inside this form
    frm.$wrapper.append(html);

    // Add style only once
    if (!document.getElementById("booking-final-style")) {
        let style = document.createElement("style");
        style.id = "booking-final-style";
        style.innerHTML = `
            #final-amount-sticky {
                position: fixed;
                top: 250px;
                right: 20px;
                width: 180px;
                background: #ffffff;
                border: 2px solid #0d6efd;
                border-radius: 12px;
                box-shadow: 0 6px 18px rgba(0,0,0,0.15);
                padding: 10px;
                z-index: 1000;
                transition: all 0.3s ease;
            }

            .final-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 13px;
                font-weight: 600;
                color: #555;
                margin-bottom: 6px;
            }

            .final-header button {
                background: transparent;
                border: none;
                font-size: 14px;
                cursor: pointer;
                color: #999;
            }

            .final-header button:hover {
                color: #000;
            }

            .final-value {
                font-size: 20px;
                font-weight: 700;
                color: #0d6efd;
            }

            @media (max-width: 768px) {
                #final-amount-sticky {
                    top: auto;
                    bottom: 0;
                    right: 0;
                    left: 0;
                    width: 100%;
                    border-radius: 15px 15px 0 0;
                    border: none;
                    border-top: 3px solid #0d6efd;
                    text-align: center;
                    box-shadow: 0 -4px 12px rgba(0,0,0,0.15);
                }

                .final-value {
                    font-size: 18px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Close button only for this form
    frm.$wrapper.find("#close-final-box").click(function () {
        frm.$wrapper.find("#final-amount-sticky").fadeOut(200);
    });
}

frappe.ui.form.on('Non Honda Accessories Item', {

    item: function (frm, cdt, cdn) {

        let row = locals[cdt][cdn];

        if (!row.item) {
            frappe.model.set_value(cdt, cdn, "amount", 0);
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

                let rate = 0;

                if (r.message && r.message.length > 0) {
                    rate = r.message[0].price_list_rate || 0;
                }

                frappe.model.set_value(cdt, cdn, "amount", rate);

                calculate_final_amount(frm); // 🔥 update final
            }
        });
    },

    amount: function (frm) {
        calculate_final_amount(frm);
    },

    table_kydz_remove: function (frm) {
        calculate_final_amount(frm);
    }

});

frappe.ui.form.on('HIRISE Account Bills Item', {

    amount: function (frm) {
        calculate_final_amount(frm);
    },

    table_apcj_add: function (frm) {
        calculate_final_amount(frm);
    },

    table_apcj_remove: function (frm) {
        calculate_final_amount(frm);
    }

});