import frappe
from frappe.model.document import Document
from frappe.utils import flt


class BookingForm(Document):

    # =====================================================
    # CHILD TABLE TOTALS
    # =====================================================

    def get_nha_total(self):
        return flt(sum(flt(row.amount) for row in self.table_kydz or []), 2)

    def get_hirise_total(self):
        return flt(sum(flt(row.amount) for row in self.table_apcj or []), 2)

    # =====================================================
    # COMMON CALCULATION
    # =====================================================

    def get_base_total(self):
        base = (
            flt(self.amount)
            + flt(self.road_total)
            + flt(self.nd_total)
            + flt(self.ex_warranty_amount)
            + flt(self.road_tax_amount)
            + self.get_nha_total()
            + self.get_hirise_total()
        )
        return flt(base, 2)

    def get_total_with_finance(self):
        base_total = self.get_base_total()
        if self.payment_type == "Finance":
            base_total += flt(self.hp_amount)
        return flt(base_total, 2)

    # =====================================================
    # VALIDATION
    # =====================================================

    def validate(self):

        # Normalize numeric fields
        self.hp_amount = flt(self.hp_amount, 2)
        self.amount = flt(self.amount, 2)
        self.road_total = flt(self.road_total, 2)
        self.nd_total = flt(self.nd_total, 2)
        self.ex_warranty_amount = flt(self.ex_warranty_amount, 2)
        self.road_tax_amount = flt(self.road_tax_amount, 2)
        self.discount_amount = flt(self.discount_amount, 2)

        if self.discount_amount < 0:
            frappe.throw("Discount cannot be negative")

        # ===============================
        # DISCOUNT VALIDATION (WITHOUT GST)
        # ===============================

        if self.discount_amount > 0:

            if not self.approver:
                frappe.throw("Approver must be selected")

            if self.price <= 0:
                frappe.throw("Vehicle price must be greater than zero")

            approval_doc = frappe.db.get_value(
                "Discount Approval",
                {"approval_user": self.approver},
                ["discount_percent"],
                as_dict=True
            )

            if not approval_doc:
                frappe.throw("No discount limit configured for selected approver")

            max_percent = flt(approval_doc.discount_percent)

            if max_percent <= 0:
                frappe.throw("Invalid approver discount configuration")

            # ✅ Validate entered amount directly (NO GST DIVISION HERE)
            max_allowed = flt((self.price * max_percent) / 100, 2)

            if self.discount_amount > max_allowed:
                frappe.throw(
                    f"""
                    Discount exceeds allowed limit.

                    Approver Limit: {max_percent}%
                    Maximum Allowed: ₹ {max_allowed}
                    Entered: ₹ {self.discount_amount}
                    """
                )

        # ===============================
        # FINAL AMOUNT CALCULATION
        # ===============================

        total = self.get_total_with_finance()
        self.final_amount = max(flt(total, 2), 0)

    # =====================================================
    # SUBMIT
    # =====================================================

    def on_submit(self):
        if not self.discount_approved:
            self.discount_approved = "Pending"

    # =====================================================
    # AFTER SUBMIT CONTROL
    # =====================================================

    def before_update_after_submit(self):

        if self.docstatus == 2:
            return

        db_doc = frappe.get_doc(self.doctype, self.name)

        system_discount_update = (
            db_doc.discount_approved == "Pending"
            and self.discount_approved in ["Approved", "Reject"]
        )

        locked_fields = [
            "finance_amount",
            "down_payment_amount",
            "hp_amount",
            "payment_type",
            "amount",
            "road_total",
            "nd_total",
            "ex_warranty_amount",
            "road_tax_amount"
        ]

        for field in locked_fields:
            if system_discount_update:
                continue
            if abs(flt(getattr(self, field)) - flt(getattr(db_doc, field))) > 0.01:
                frappe.throw(
                    f"Not allowed to change {field.replace('_', ' ').title()} after submission"
                )

        # Prevent discount tampering after decision
        if db_doc.discount_approved in ["Approved", "Reject"]:
            if abs(flt(self.discount_amount) - flt(db_doc.discount_amount)) > 0.01:
                frappe.throw("Cannot modify discount after decision taken")


# =========================================================
# APPROVAL API
# =========================================================

@frappe.whitelist()
def update_discount_decision(docname, decision):

    if decision not in ["Approved", "Reject"]:
        frappe.throw("Invalid decision")

    doc = frappe.get_doc("Booking Form", docname)

    if doc.docstatus != 1:
        frappe.throw("Document must be submitted first")

    if doc.approver != frappe.session.user:
        frappe.throw("You are not authorized approver")

    if doc.discount_approved in ["Approved", "Reject"]:
        frappe.throw("Decision already taken")

    if doc.discount_amount < 0:
        frappe.throw("Invalid discount amount")

    if doc.price <= 0:
        frappe.throw("Vehicle price must be greater than zero")

    # Get approver limit
    approval_doc = frappe.db.get_value(
        "Discount Approval",
        {"approval_user": doc.approver},
        ["discount_percent"],
        as_dict=True
    )

    if not approval_doc:
        frappe.throw("No discount limit configured for this approver")

    max_percent = flt(approval_doc.discount_percent)

    max_allowed = flt((doc.price * max_percent) / 100, 2)

    if doc.discount_amount > max_allowed:
        frappe.throw(f"Discount exceeds {max_percent}% approval limit")

    # =====================================================
    # DECISION LOGIC
    # =====================================================

    if decision == "Approved":

        # Convert entered amount → GST exclusive base
        gst_exclusive_discount = flt(doc.discount_amount / 1.18, 2)

        # Reduce vehicle price
        new_price = flt(doc.price - gst_exclusive_discount, 2)
        doc.price = new_price

        # Recalculate GST
        doc.cgst_amount = flt((new_price * doc.cgst_rate) / 100, 2)
        doc.sgst_amount = flt((new_price * doc.sgst_rate) / 100, 2)

        # Recalculate vehicle total
        doc.amount = flt(new_price + doc.cgst_amount + doc.sgst_amount, 2)

        doc.discount_approved = "Approved"

    else:
        doc.discount_approved = "Reject"
        doc.discount_amount = 0

    # =====================================================
    # RECALCULATE FULL TOTAL
    # =====================================================

    base_total = doc.get_base_total()

    if doc.payment_type == "Finance":
        base_total += flt(doc.hp_amount)

    doc.final_amount = flt(base_total, 2)

    # =====================================================
    # FINANCE RECALCULATION
    # =====================================================

    if doc.payment_type == "Finance":
        finance = flt(
            doc.final_amount
            - flt(doc.down_payment_amount)
            - flt(doc.hp_amount),
            2
        )
        doc.finance_amount = max(finance, 0)

    doc.save(ignore_permissions=True)

    return "OK"


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def customer_query(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT
            name,
            CONCAT(
                customer_name,
                ' | Hirise ID: ', IFNULL(hiris_id, '-')
            ) AS description
        FROM `tabCustomer`
        WHERE docstatus < 2
        AND (
            name LIKE %(txt)s
            OR customer_name LIKE %(txt)s
            OR hiris_id LIKE %(txt)s
            OR mobile_no LIKE %(txt)s
        )
        ORDER BY customer_name
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })


# =========================================================
# PAYMENT JOURNAL ENTRY API
# =========================================================

@frappe.whitelist()
def make_payment_journal_entry(booking_name):
    booking = frappe.get_doc("Booking Form", booking_name)

    # -------------------------------
    # VALIDATION
    # -------------------------------
    if booking.docstatus != 1:
        frappe.throw("Booking must be submitted")
    if not booking.payment_account:
        frappe.throw("Payment Account is required")
    if not booking.cost_center:
        frappe.throw("Cost Center is required")
    if not booking.company:
        frappe.throw("Company is required")
    if not frappe.db.exists("Cost Center", booking.cost_center):
        frappe.throw(f"Cost Center {booking.cost_center} does not exist")
    if not frappe.db.exists("Company", booking.company):
        frappe.throw(f"Company {booking.company} does not exist")

    total_amount = flt(booking.final_amount)
    already_paid = flt(booking.amount_recieved)
    outstanding = total_amount - already_paid

    if outstanding <= 0:
        frappe.throw("Booking already fully paid")

    # -------------------------------
    # GET ACCOUNTS
    # -------------------------------
    if booking.payment_account == "Cash":
        debit_account = frappe.get_value("Company", booking.company, "default_cash_account")
    elif booking.payment_account == "Bank":
        debit_account = frappe.get_value("Company", booking.company, "default_bank_account")
    else:
        frappe.throw(f"Unsupported payment account type: {booking.payment_account}")

    receivable_account = frappe.get_value("Company", booking.company, "default_receivable_account")
    if not receivable_account:
        frappe.throw(f"No default Receivable Account set for Company {booking.company}")

    # -------------------------------
    # CREATE JOURNAL ENTRY DRAFT
    # -------------------------------
    je = frappe.new_doc("Journal Entry")
    je.voucher_type = "Journal Entry"
    je.company = booking.company
    je.posting_date = booking.booking_date or frappe.utils.today()
    je.user_remark = f"Payment against Booking {booking.name}"
    je.cost_center = booking.cost_center
    je.from_booking_form = 1

    # Debit: Cash / Bank
    je.append("accounts", {
        "account": debit_account,
        "debit_in_account_currency": outstanding,
        "cost_center": booking.cost_center
    })

    # Credit: Debtors
    je.append("accounts", {
        "account": receivable_account,
        "party_type": "Customer",
        "party": booking.customer,
        "credit_in_account_currency": outstanding,
        "cost_center": booking.cost_center,
        "reference_type": "Booking Form",
        "reference_name": booking.name,
        "is_advance": "Yes"
    })

    je.insert(ignore_permissions=True)  # Keep as Draft
    frappe.db.commit()

    # Return the Journal Entry name directly
    return je.name