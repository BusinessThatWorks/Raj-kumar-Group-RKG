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

        total = flt(self.get_total_with_finance(), 2)

        # ===============================
        # DYNAMIC DISCOUNT VALIDATION
        # ===============================

        if self.discount_amount < 0:
            frappe.throw("Discount cannot be negative")

        if self.discount_amount > 0:

            if not self.approver:
                frappe.throw("Approver must be selected")

            if self.price <= 0:
                frappe.throw("Vehicle price must be greater than zero")

            # 🔥 ALWAYS validate against ORIGINAL price
            original_price = flt(self.price, 2)

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

            # ✅ Max allowed discount (GST exclusive)
            max_allowed_exclusive = flt((original_price * max_percent) / 100, 2)

            # ✅ Convert user input to GST exclusive
            gst_exclusive_discount = flt(self.discount_amount / 1.18, 2)

            if gst_exclusive_discount > max_allowed_exclusive:
                frappe.throw(
                    f"""
                    Discount exceeds allowed limit.

                    Approver Limit: {max_percent}%
                    Maximum Allowed (Excl GST): ₹ {max_allowed_exclusive}
                    Entered (Excl GST): ₹ {gst_exclusive_discount}
                    """
                )

        

        # ===============================
        # FINAL AMOUNT CALCULATION
        # ===============================

        final_total = total
        if self.discount_amount > 0 and self.discount_approved == "Approved":
            gst_exclusive_discount = flt(self.discount_amount / 1.18, 2)
            final_total = flt(total - gst_exclusive_discount, 2)

        self.final_amount = max(final_total, 0)

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

        # Allow system discount approval update
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

    if doc.price <= 0:
        frappe.throw("Ex-showroom price must be greater than zero")

    if doc.discount_amount < 0:
        frappe.throw("Invalid discount amount")

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

    # Convert inclusive → exclusive
    gst_exclusive_discount = flt(doc.discount_amount / 1.18, 2)

    max_allowed_discount = flt((doc.price * max_percent) / 100, 2)

    if gst_exclusive_discount > max_allowed_discount:
        frappe.throw(f"Discount exceeds {max_percent}% approval limit")

    # =====================================================
    # DECISION LOGIC
    # =====================================================

    if decision == "Approved":

        # 1️⃣ Reduce vehicle price
        new_price = flt(doc.price - gst_exclusive_discount, 2)
        doc.price = new_price

        # 2️⃣ Recalculate GST
        doc.cgst_amount = flt((new_price * doc.cgst_rate) / 100, 2)
        doc.sgst_amount = flt((new_price * doc.sgst_rate) / 100, 2)

        # 3️⃣ Recalculate vehicle amount
        doc.amount = flt(new_price + doc.cgst_amount + doc.sgst_amount, 2)

        doc.discount_approved = "Approved"

    else:
        doc.discount_approved = "Reject"
        doc.discount_amount = 0

        doc.cgst_amount = flt((doc.price * doc.cgst_rate) / 100, 2)
        doc.sgst_amount = flt((doc.price * doc.sgst_rate) / 100, 2)
        doc.amount = flt(doc.price + doc.cgst_amount + doc.sgst_amount, 2)

    # =====================================================
    # 🔥 RECALCULATE FULL TOTAL (VERY IMPORTANT)
    # =====================================================

    base_total = (
        flt(doc.amount)
        + flt(doc.road_total)
        + flt(doc.nd_total)
        + flt(doc.ex_warranty_amount)
        + flt(doc.road_tax_amount)
        + doc.get_nha_total()
        + doc.get_hirise_total()
    )

    if doc.payment_type == "Finance":
        base_total += flt(doc.hp_amount)

    doc.final_amount = flt(base_total, 2)

    # =====================================================
    # 🔥 FINANCE RECALCULATION
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