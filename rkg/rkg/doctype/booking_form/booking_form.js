frappe.ui.form.on('Booking Form', {
    onload: function(frm) {
        // Hide by default immediately
        frm.toggle_display("discount_amount", false);
        frm.toggle_display("discount_approved", false);
        frm.toggle_display("approver", false);
    },

    refresh: async function(frm) {

        calculate_final_amount(frm);
        manage_payment_logic(frm);
        toggle_other_bank(frm);
        show_final_amount_top(frm);

        // Always re-check permission on refresh
        await check_discount_permission(frm);
        // Lock discount if approved
        if (frm.doc.discount_approved == 1) {
            frm.set_df_property("discount_amount", "read_only", 1);
        }
    },

    onload_post_render: async function(frm) {
        await check_discount_permission(frm);
    },
    after_save: async function(frm) {

        // Create approval request only AFTER save
        if (!frm.is_new() &&
            frm.doc.discount_amount > 0 &&
            frm.doc.discount_approved == 0) {

            await create_discount_request(frm);

            // 🔒 Lock discount after request
            frm.set_df_property("discount_amount", "read_only", 1);
        }
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
                safe_set(frm, "registration_amount", doc.registration);
                safe_set(frm, "reg_and_road_tax", doc.registration);
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

    nd_type: function(frm) {
        set_nd_price(frm);
        calculate_nd(frm);
    },
    discount_amount: function(frm) {
        validate_discount_limit(frm);
    },

    validate: function(frm) {
        // Existing discount approval check
        if (frm.doc.docstatus === 1 &&
            frm.doc.discount_amount > 0 &&
            frm.doc.discount_approved == 0) {
            frappe.throw("Discount is pending approval. Cannot submit.");
        }

        // New: Make approver mandatory if discount_amount > 0
        if (frm.doc.discount_amount > 0 && !frm.doc.approver) {
            frappe.throw("Approver is mandatory when Discount Amount is entered.");
        }
        validate_discount_limit(frm);
    },
    hypothecated_bank: function(frm) {
        toggle_other_bank(frm);
    },

    
    payment_type: function(frm) {
        manage_payment_logic(frm);
        toggle_other_bank(frm);
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
    extended_warrantyew: function(frm){
        if(frm.doc.extended_warrantyew == 'Not Applicable')
        {
            safe_set(frm, "ex_warranty_amount", "");
        }else
        {
            safe_set(frm, "ex_warranty_amount", frm.doc.saved_amount);
        }
    },
    price: calculate_tab_one,
    cgst_rate: calculate_tab_one,
    sgst_rate: calculate_tab_one,

    // road_price: calculate_road,
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


function toggle_other_bank(frm) {

    if (frm.doc.payment_type === "Finance" &&
        frm.doc.hypothecated_bank === "Others") {

        // Show + Mandatory
        frm.set_df_property("other_bank_name", "hidden", 0);
        frm.set_df_property("other_bank_name", "reqd", 1);

    } else {

        // Hide + Not Mandatory + Clear
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

    let base = frm.doc.registration_amount || 0;

    let cgst_rate = frm.doc.road_cgst_rate || 0;
    let sgst_rate = frm.doc.road_sgst_rate || 0;

    let cgst = (base * cgst_rate) / 100;
    let sgst = (base * sgst_rate) / 100;

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

    let discount = 0;
    if (frm.doc.discount_approved == 1) {
        discount = frm.doc.discount_amount || 0;
    }

    let final_total = base_total + hp - discount;

    if (final_total < 0) final_total = 0;

    frm.set_value("final_amount", final_total);

    show_final_amount_top(frm);
}


// ================= PAYMENT LOGIC =================
function manage_payment_logic(frm) {

    if (frm.doc.payment_type === "Cash") {

        frm.set_df_property("down_payment_amount", "reqd", 0);
        frm.set_df_property("finance_amount", "reqd", 0);
        frm.set_df_property("hp_amount", "reqd", 0);
        frm.set_df_property("hypothecated_bank", "reqd", 0);

        // Clear bank
        frm.set_value("hypothecated_bank", "");

        // Hide + reset Other Bank field
        frm.set_df_property("other_bank_name", "hidden", 1);
        frm.set_df_property("other_bank_name", "reqd", 0);
        frm.set_value("other_bank_name", "");

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


function adjust_road_split(frm, changed_field) {

    let master_total = frm.doc.reg_and_road_tax || 0;

    let road_tax = frm.doc.road_tax_amount || 0;

    frm.set_df_property("reg_and_road_tax", "read_only", 1);

    // Road tax changed → calculate registration amount
    if (changed_field === "road_tax") {

        let registration_value = master_total - road_tax;

        if (registration_value < 0)
            registration_value = 0;

        frm.set_value("registration_amount", registration_value);
    }

    calculate_road(frm);
}
async function check_discount_permission(frm) {

    frm.allowed_discount_percent = 0;

    // Hide first
    frm.toggle_display("discount_amount", false);
    frm.toggle_display("discount_approved", false);
    frm.toggle_display("approver", false);

    let approval = await frappe.db.get_list("Discount Approval", {
        filters: {
            approval_user: frappe.session.user
        },
        fields: ["discount_percent"],
        limit: 1
    });

    if (approval && approval.length > 0) {

        frm.allowed_discount_percent =
            approval[0].discount_percent || 0;

        frm.toggle_display("discount_amount", true);
        frm.toggle_display("discount_approved", true);
        frm.toggle_display("approver", true);
    }
}

function validate_discount_limit(frm) {

    let allowed_percent = frm.allowed_discount_percent || 0;
    let final_amount = frm.doc.final_amount || 0;
    let discount_amount = frm.doc.discount_amount || 0;

    // ✅ NEW: If approved → skip limit validation completely
    if (frm.doc.discount_approved == 1) {
        return;
    }

    // 🚫 No permission but entered discount
    if (allowed_percent === 0 && discount_amount > 0) {
        frappe.throw("You are not allowed to give discount.");
    }

    if (!final_amount) return;

    let max_allowed = (final_amount * allowed_percent) / 100;

    if (discount_amount > max_allowed) {

        frappe.throw({
            title: "Discount Limit Exceeded",
            message: `Maximum allowed discount is ${allowed_percent}% 
            (₹ ${max_allowed.toFixed(2)})`,
            indicator: "red"
        });
    }
}

async function create_discount_request(frm) {
    if (!frm.doc.name) return;

    // 🔒 Prevent duplicate pending request
    let existing = await frappe.db.get_list("Discount Approval Request", {
        filters: {
            booking_form: frm.doc.name,
            status: "Pending"
        },
        limit: 1
    });

    if (existing.length > 0) return;

    let approver_user = frm.doc.approver;

    if (!approver_user) {
        frappe.msgprint("Approver is not set in this booking.");
        return;
    }

    // ✅ Get the approver's discount limit
    let approval = await frappe.db.get_list("Discount Approval", {
        filters: { approval_user: approver_user },
        fields: ["discount_percent"],
        limit: 1
    });

    let allowed_percent = 0;
    if (approval && approval.length > 0) {
        allowed_percent = approval[0].discount_percent;
    }

    await frappe.call({
        method: "frappe.client.insert",
        args: {
            doc: {
                doctype: "Discount Approval Request",
                booking_form: frm.doc.name,
                requested_by: frappe.session.user,
                approver: approver_user,
                discount_amount: frm.doc.discount_amount,
                allowed_percent: allowed_percent,
                final_amount: frm.doc.final_amount,
                status: "Pending"
            }
        }
    });

    frappe.msgprint("Discount approval request sent to " + approver_user);
}